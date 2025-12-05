# PDF to PowerPoint Converter

Aplicação web para converter arquivos PDF em apresentações PowerPoint (.pptx).

## 🚀 Deploy na Vercel

### Opção 1: Deploy via CLI

1. Instale a CLI da Vercel:
```bash
npm i -g vercel
```

2. Execute o deploy:
```bash
cd pdf-to-ppt-web
vercel
```

### Opção 2: Deploy via GitHub

1. Faça push do código para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com)
3. Importe o repositório
4. A Vercel detectará automaticamente que é um projeto Next.js
5. Clique em "Deploy"

## 💻 Desenvolvimento Local

1. Instale as dependências:
```bash
npm install
```

2. Execute o servidor de desenvolvimento:
```bash
npm run dev
```

3. Abra [http://localhost:3000](http://localhost:3000) no navegador

## 🛠️ Como Funciona

1. O usuário faz upload de um arquivo PDF
2. O PDF é processado no servidor usando `pdfjs-dist`
3. Cada página é convertida em uma imagem PNG de alta qualidade
4. As imagens são inseridas em slides de PowerPoint usando Open XML
5. O arquivo .pptx é gerado e enviado para download

## 📦 Tecnologias

- **Next.js 14** - Framework React com API routes
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização
- **PDF.js** - Renderização de PDF
- **PizZip** - Criação de arquivos ZIP (formato .pptx)

## ⚙️ Configurações da Vercel

A aplicação está pronta para deploy na Vercel sem configurações adicionais. O Next.js é automaticamente otimizado pela plataforma.

### Limites

- Tamanho máximo de arquivo: 4.5MB (Vercel Hobby plan)
- Para arquivos maiores, considere upgrade para Pro plan ou use soluções de storage externo

## 🔒 Privacidade

Todo o processamento é feito no servidor da Vercel. Os arquivos não são armazenados após a conversão.

## 📝 Licença

MIT
