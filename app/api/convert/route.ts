import { exec } from "child_process";
import { randomBytes } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { tmpdir } from "os";
import { join } from "path";
import PizZip from "pizzip";
import { promisify } from "util";

const execAsync = promisify(exec);

// Path to Python virtual environment
const PYTHON_PATH = join(process.cwd(), ".venv", "bin", "python");
const SCRIPT_PATH = join(process.cwd(), "scripts", "pdf_to_images.py");

// Get image dimensions from PNG data
function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at byte 16 (after signature and IHDR length/type)
  // Width: 4 bytes at offset 16
  // Height: 4 bytes at offset 20
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];

  try {
    const formData = await request.formData();
    const file = formData.get("pdf") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Ler o PDF
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    // Criar diretório temporário
    const tempDir = join(
      tmpdir(),
      `pdf-convert-${randomBytes(8).toString("hex")}`
    );
    const pdfPath = join(tempDir, "input.pdf");

    // Salvar PDF temporariamente
    await execAsync(`mkdir -p "${tempDir}"`);
    await writeFile(pdfPath, pdfBytes);
    tempFiles.push(tempDir);

    let slides: string[] = [];

    try {
      // Usar Aspose.PDF via Python para converter
      const { stdout, stderr } = await execAsync(
        `"${PYTHON_PATH}" "${SCRIPT_PATH}" "${pdfPath}" "${tempDir}"`
      );

      if (stderr) {
        console.error("Python stderr:", stderr);
      }

      const result = JSON.parse(stdout);

      if (!result.success) {
        throw new Error(result.error || "Erro ao converter PDF com Aspose");
      }

      slides = result.images;
      console.log(`Convertidas ${slides.length} páginas usando Aspose.PDF`);
    } catch (asposeError: any) {
      console.error(
        "Erro ao usar Aspose.PDF, tentando fallback:",
        asposeError.message
      );

      // Fallback para pdftoppm
      try {
        await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${tempDir}/page"`);

        // Contar arquivos gerados
        const { stdout: lsOutput } = await execAsync(
          `ls "${tempDir}"/page-*.png | wc -l`
        );
        const numPages = parseInt(lsOutput.trim());

        // Ler as imagens geradas
        for (let i = 1; i <= numPages; i++) {
          const pageNum = i
            .toString()
            .padStart(numPages.toString().length, "0");
          const imagePath = join(tempDir, `page-${pageNum}.png`);
          const imageBuffer = await readFile(imagePath);
          const base64 = imageBuffer.toString("base64");
          slides.push(base64);
        }

        console.log(
          `Convertidas ${slides.length} páginas usando pdftoppm (fallback)`
        );
      } catch (popplerError) {
        throw new Error(
          "Erro ao converter PDF. Aspose.PDF e pdftoppm falharam."
        );
      }
    }

    if (slides.length === 0) {
      throw new Error("Nenhuma página foi convertida");
    }

    // Calcular dimensões das imagens
    const imageDimensions = slides.map((base64) => {
      const buffer = Buffer.from(base64, "base64");
      return getPngDimensions(buffer);
    });

    // Criar PowerPoint usando Open XML
    const pptx = createPowerPoint(slides, imageDimensions);

    // Limpar arquivos temporários
    for (const tempFile of tempFiles) {
      try {
        await execAsync(`rm -rf "${tempFile}"`);
      } catch (e) {
        console.error("Erro ao limpar arquivos temporários:", e);
      }
    }

    return new NextResponse(pptx as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${file.name.replace(
          ".pdf",
          ".pptx"
        )}"`,
      },
    });
  } catch (error) {
    // Limpar arquivos temporários em caso de erro
    for (const tempFile of tempFiles) {
      try {
        await execAsync(`rm -rf "${tempFile}"`);
      } catch (e) {
        // Ignorar erros de limpeza
      }
    }

    console.error("Erro ao converter PDF:", error);
    return NextResponse.json(
      { error: "Erro ao converter o arquivo" },
      { status: 500 }
    );
  }
}

function createPowerPoint(
  images: string[],
  imageDimensions: { width: number; height: number }[]
): Buffer {
  const zip = new PizZip();

  // Slide dimensions in EMUs (914400 EMUs = 1 inch)
  // Standard 4:3 slide: 10" x 7.5"
  const SLIDE_WIDTH = 9144000; // 10 inches
  const SLIDE_HEIGHT = 6858000; // 7.5 inches

  // [Content_Types].xml
  let slideOverrides = "";
  let slideLayoutOverrides = "";
  images.forEach((_, i) => {
    slideOverrides += `  <Override PartName="/ppt/slides/slide${
      i + 1
    }.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n`;
  });

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverrides}</Types>`
  );

  // _rels/.rels
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  // ppt/_rels/presentation.xml.rels
  const pptFolder = zip.folder("ppt");
  const pptRelsFolder = pptFolder?.folder("_rels");

  let slideRels = "";
  slideRels += `  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>\n`;
  images.forEach((_, i) => {
    slideRels += `  <Relationship Id="rId${
      i + 2
    }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${
      i + 1
    }.xml"/>\n`;
  });

  pptRelsFolder?.file(
    "presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slideRels}</Relationships>`
  );

  // ppt/presentation.xml
  let slideIdList = "";
  images.forEach((_, i) => {
    slideIdList += `    <p:sldId id="${256 + i}" r:id="rId${i + 2}"/>\n`;
  });

  pptFolder?.file(
    "presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideIdList}  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
  );

  // Create theme
  const themeFolder = pptFolder?.folder("theme");
  themeFolder?.file(
    "theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"/>
        <a:gradFill rotWithShape="1"/>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"/>
        <a:gradFill rotWithShape="1"/>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
  );

  // Create slide master
  const slideMastersFolder = pptFolder?.folder("slideMasters");
  const slideMastersRelsFolder = slideMastersFolder?.folder("_rels");

  slideMastersRelsFolder?.file(
    "slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );

  slideMastersFolder?.file(
    "slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`
  );

  // Create slide layout
  const slideLayoutsFolder = pptFolder?.folder("slideLayouts");
  const slideLayoutsRelsFolder = slideLayoutsFolder?.folder("_rels");

  slideLayoutsRelsFolder?.file(
    "slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );

  slideLayoutsFolder?.file(
    "slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>`
  );

  // Criar slides
  const slidesFolder = pptFolder?.folder("slides");
  const slideRelsFolder = slidesFolder?.folder("_rels");
  const mediaFolder = pptFolder?.folder("media");

  images.forEach((imageBase64, i) => {
    const slideNum = i + 1;
    const dim = imageDimensions[i];

    // Calculate aspect ratio and fit image within slide
    const imageAspect = dim.width / dim.height;
    const slideAspect = SLIDE_WIDTH / SLIDE_HEIGHT;

    let imageWidth: number;
    let imageHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (imageAspect > slideAspect) {
      // Image is wider than slide - fit to width
      imageWidth = SLIDE_WIDTH;
      imageHeight = Math.round(SLIDE_WIDTH / imageAspect);
      offsetX = 0;
      offsetY = Math.round((SLIDE_HEIGHT - imageHeight) / 2);
    } else {
      // Image is taller than slide - fit to height
      imageHeight = SLIDE_HEIGHT;
      imageWidth = Math.round(SLIDE_HEIGHT * imageAspect);
      offsetX = Math.round((SLIDE_WIDTH - imageWidth) / 2);
      offsetY = 0;
    }

    // Salvar imagem
    const imageBuffer = Buffer.from(imageBase64, "base64");
    mediaFolder?.file(`image${slideNum}.png`, imageBuffer);

    // slide.xml.rels
    slideRelsFolder?.file(
      `slide${slideNum}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${slideNum}.png"/>
</Relationships>`
    );

    // slide.xml
    slidesFolder?.file(
      `slide${slideNum}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="Picture ${slideNum}"/>
          <p:cNvPicPr>
            <a:picLocks noChangeAspect="1"/>
          </p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId2"/>
          <a:stretch>
            <a:fillRect/>
          </a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="${offsetX}" y="${offsetY}"/>
            <a:ext cx="${imageWidth}" cy="${imageHeight}"/>
          </a:xfrm>
          <a:prstGeom prst="rect">
            <a:avLst/>
          </a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`
    );
  });

  return Buffer.from(
    zip.generate({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })
  );
}
