"use client";

import { useRef, useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setError(null);
    } else {
      setError("Por favor, selecione um arquivo PDF válido.");
      setFile(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("pdf", file);

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erro ao converter o arquivo");
      }

      // Download do arquivo convertido
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(".pdf", ".pptx");
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError("Erro ao converter o arquivo. Tente novamente.");
      console.error(err);
    } finally {
      setConverting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">
          PDF para PowerPoint
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Converta seus arquivos PDF em apresentações PowerPoint
        </p>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <svg
              className="w-16 h-16 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-lg font-medium text-gray-700">
              {file ? file.name : "Clique para selecionar um arquivo PDF"}
            </span>
            <span className="text-sm text-gray-500 mt-2">
              ou arraste e solte aqui
            </span>
          </label>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {file && !converting && (
          <button
            onClick={handleConvert}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Converter para PowerPoint
          </button>
        )}

        {converting && (
          <div className="mt-6 flex flex-col items-center justify-center py-8">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <p className="mt-4 text-gray-700 font-medium">
              Convertendo seu PDF...
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Isso pode levar alguns segundos
            </p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Como funciona?
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-600">
            <li>Selecione um arquivo PDF</li>
            <li>Cada página será convertida em um slide</li>
            <li>Baixe seu arquivo PowerPoint (.pptx)</li>
          </ol>
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-500 text-sm">
        <p>desenvolvido por Rafael Costa</p>
        {/* <p>Conversão realizada no navegador com segurança e privacidade</p> */}
      </footer>
    </main>
  );
}
