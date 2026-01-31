"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, FileArchive, Lock, Upload, Download, File, AlertCircle, CheckCircle2 } from "lucide-react";
import { BlobWriter, ZipWriter, BlobReader } from "@zip.js/zip.js";
import FloatingHomeButton from "@/components/floating-home-button";

export default function SecureZip() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [encryptionMethod, setEncryptionMethod] = useState<"zipCrypto" | "aes">("zipCrypto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
      setSuccess(false);
    }
  };

  const createZip = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    if (!password) {
      setError("Please enter a password to protect your zip.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      // Create a BlobWriter to store the zip content
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"));

      // Add the file to the zip with password protection
      // Use zipCrypto for Windows compatibility if selected, otherwise AES (default in zip.js for password)
      await zipWriter.add(file.name, new BlobReader(file), {
        password: password,
        zipCrypto: encryptionMethod === "zipCrypto",
        level: 5 // Default compression level
      });

      // Close the zip writer and get the blob
      const blob = await zipWriter.close();

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Get filename without extension and add .zip
      const downloadName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      link.download = `${downloadName}-protected.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError("Failed to create zip file: " + errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <FloatingHomeButton />
      
      <main className="max-w-3xl mx-auto p-4 sm:p-8 py-12 space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <Link
            href="/tools"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tools
          </Link>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
              <FileArchive className="w-8 h-8 text-amber-600" />
              Secure Zip Creator
            </h1>
            <p className="text-slate-600 max-w-2xl">
              Compress a file into a password-protected ZIP archive. 
              Client-side encryption means your password and data never leave your browser.
            </p>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8">
            
            {/* File Upload Area */}
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                file ? "border-amber-400 bg-amber-50/10" : "border-slate-300 hover:border-amber-400 hover:bg-slate-50"
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
                    <File className="w-8 h-8 text-amber-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">{file.name}</p>
                    <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <p className="text-xs text-amber-600 font-medium mt-2">Click or drop to replace</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">Click to upload or drag and drop</p>
                    <p className="text-sm text-slate-500">Select any file to compress</p>
                  </div>
                </div>
              )}
            </div>

            {/* Password Section */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Set Encryption Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all sm:text-sm"
                  placeholder="Enter a strong password..."
                  disabled={isProcessing}
                />
              </div>
              <p className="text-xs text-slate-500">
                This password will be required to open the ZIP file. Do not forget it!
              </p>
            </div>

            {/* Encryption Method Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Encryption Compatibility
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className={`relative flex items-start p-4 cursor-pointer rounded-lg border transition-all ${
                  encryptionMethod === "zipCrypto" 
                    ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500" 
                    : "border-slate-200 bg-white hover:border-amber-300"
                }`}>
                  <input
                    type="radio"
                    name="encryption"
                    className="mt-1 h-4 w-4 text-amber-600 border-gray-300 focus:ring-amber-500"
                    checked={encryptionMethod === "zipCrypto"}
                    onChange={() => setEncryptionMethod("zipCrypto")}
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-slate-900">Windows Compatible</span>
                    <span className="block text-xs text-slate-500 mt-1">
                      Uses ZipCrypto (Legacy). Works with built-in Windows/Mac zip extractors. Less secure.
                    </span>
                  </div>
                </label>

                <label className={`relative flex items-start p-4 cursor-pointer rounded-lg border transition-all ${
                  encryptionMethod === "aes" 
                    ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500" 
                    : "border-slate-200 bg-white hover:border-amber-300"
                }`}>
                  <input
                    type="radio"
                    name="encryption"
                    className="mt-1 h-4 w-4 text-amber-600 border-gray-300 focus:ring-amber-500"
                    checked={encryptionMethod === "aes"}
                    onChange={() => setEncryptionMethod("aes")}
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-slate-900">Strong Encryption</span>
                    <span className="block text-xs text-slate-500 mt-1">
                      Uses AES-256. Highly secure, but requires 7-Zip, WinRAR, or similar on Windows.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                ZIP file created and downloaded successfully!
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={createZip}
              disabled={isProcessing || !file || !password}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white font-medium transition-all shadow-sm ${
                isProcessing || !file || !password
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-700 active:transform active:scale-[0.98]"
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Compressing...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Compress & Download ZIP
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
