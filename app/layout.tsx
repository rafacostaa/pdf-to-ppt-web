import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PDF to PowerPoint Converter',
  description: 'Convert your PDF files to PowerPoint presentations online',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
