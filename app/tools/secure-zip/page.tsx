"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, FileArchive, Lock, Upload, Download, File as FileIcon, AlertCircle, CheckCircle2, Share2, Home } from "lucide-react";
import { BlobWriter, ZipWriter, BlobReader } from "@zip.js/zip.js";

const SAFE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;

const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function SecureZip() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [encryptionMethod, setEncryptionMethod] = useState<"zipCrypto" | "aes">("zipCrypto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
        setFile(null);
        setError(
          `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side compression.`
        );
        setSuccessMessage(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccessMessage(null);
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
      const selectedFile = e.dataTransfer.files[0];
      if (selectedFile.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
        setFile(null);
        setError(
          `File too large (${formatSizeMB(selectedFile.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side compression.`
        );
        setSuccessMessage(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccessMessage(null);
    }
  };

  const createZipBlob = async () => {
    if (!file) {
      throw new Error("Please select a file first.");
    }
    if (!password) {
      throw new Error("Please enter a password to protect your zip.");
    }

    const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
    await zipWriter.add(file.name, new BlobReader(file), {
      password,
      zipCrypto: encryptionMethod === "zipCrypto",
      level: 5,
    });

    const blob = await zipWriter.close();
    const downloadName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const filename = `${downloadName}-protected.zip`;
    return { blob, filename };
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
    setSuccessMessage(null);

    try {
      const { blob, filename } = await createZipBlob();

      // Compress & Download should always trigger a direct file download.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMessage("ZIP file created and downloaded successfully!");
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError("Failed to create zip file: " + errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const createZipAndShare = async () => {
    if (!file) {
      setError("Please select a file first.");
      return;
    }
    if (!password) {
      setError("Please enter a password to protect your zip.");
      return;
    }

    setIsSharing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { blob, filename } = await createZipBlob();
      const shareFile = new File([blob], filename, { type: "application/zip" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({
          files: [shareFile],
          title: filename,
        });
        setSuccessMessage("ZIP file created and shared successfully!");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccessMessage("Sharing isn't supported here. ZIP downloaded instead.");
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError("Failed to create zip file: " + errorMessage);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <main className="max-w-3xl mx-auto p-4 sm:p-8 py-12 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/tools"
              className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="space-y-2 text-left">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                <FileArchive className="w-8 h-8 text-amber-600" />
                Secure Zip Creator
              </h1>
              <p className="text-slate-500 text-sm max-w-2xl">
                Compress a file into a password-protected ZIP archive.
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-amber-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            
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
                    <FileIcon className="w-8 h-8 text-amber-600" />
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
                    <p className="text-xs text-amber-600 font-medium">Recommended safe size: up to 100 MB per file</p>
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
            {successMessage && (
              <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                {successMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={createZip}
                disabled={isProcessing || isSharing || !file || !password}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white font-medium transition-all shadow-sm ${
                  isProcessing || isSharing || !file || !password
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

              <button
                onClick={createZipAndShare}
                disabled={isSharing || isProcessing || !file || !password}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-white font-medium transition-all shadow-sm ${
                  isSharing || isProcessing || !file || !password
                    ? "bg-slate-300 cursor-not-allowed"
                    : "bg-slate-900 hover:bg-slate-800 active:transform active:scale-[0.98]"
                }`}
              >
                {isSharing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Compressing...
                  </>
                ) : (
                  <>
                    <Share2 className="w-5 h-5" />
                    Compress & Share ZIP
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm">Powered by @zip.js/zip.js.</p>
      </main>
    </div>
  );
}
