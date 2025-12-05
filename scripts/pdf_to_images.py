#!/usr/bin/env python3
import sys
import os
import base64
import json
from aspose.pdf import Document
from aspose.pdf.devices import PngDevice, Resolution


def convert_pdf_to_images(pdf_path, output_dir):
    """
    Convert PDF to PNG images using Aspose.PDF
    Returns list of base64 encoded images
    """
    try:
        # Load PDF document
        document = Document(pdf_path)

        # Create resolution object (150 DPI)
        resolution = Resolution(150)

        # Create PNG device
        png_device = PngDevice(resolution)

        images = []

        # Convert each page
        for page_number in range(1, document.pages.count + 1):
            output_file = os.path.join(output_dir, f"page-{page_number}.png")

            # Convert page to PNG
            png_device.process(document.pages[page_number], output_file)

            # Read and encode to base64
            with open(output_file, 'rb') as f:
                image_data = f.read()
                base64_data = base64.b64encode(image_data).decode('utf-8')
                images.append(base64_data)

            # Clean up the image file
            os.remove(output_file)

        return {
            'success': True,
            'images': images,
            'page_count': document.pages.count
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(json.dumps(
            {'success': False, 'error': 'Usage: pdf_to_images.py <pdf_path> <output_dir>'}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]

    result = convert_pdf_to_images(pdf_path, output_dir)
    print(json.dumps(result))
