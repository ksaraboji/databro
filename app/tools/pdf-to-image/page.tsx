"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Image as ImageIcon, Loader2, AlertCircle, X, Download, FileImage, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type PdfJsLike = {
    version: string;
    GlobalWorkerOptions: { workerSrc: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<any> }> };
};

let pdfjsPromise: Promise<PdfJsLike> | null = null;

const SAFE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;
const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizePdfJsModule(mod: any): PdfJsLike | null {
    if (!mod || typeof mod !== "object") return null;

    const candidates = [mod, mod.default];
    for (const candidate of candidates) {
        if (
            candidate &&
            typeof candidate === "object" &&
            typeof candidate.getDocument === "function" &&
            candidate.GlobalWorkerOptions
        ) {
            return candidate as PdfJsLike;
        }
    }

    return null;
}

async function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = (async () => {
            const moduleLoaders = [
                () => import('pdfjs-dist/legacy/build/pdf.min.mjs'),
                () => import('pdfjs-dist/build/pdf.min.mjs'),
            ];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let lastError: any = null;
            for (const loadModule of moduleLoaders) {
                try {
                    const mod = await loadModule();
                    const pdfjsLib = normalizePdfJsModule(mod);
                    if (pdfjsLib) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;
                        return pdfjsLib;
                    }
                } catch (err) {
                    lastError = err;
                }
            }

            throw lastError ?? new Error("Unable to load pdfjs-dist module");
        })();
    }

    try {
        return await pdfjsPromise;
    } catch (err) {
        pdfjsPromise = null;
        throw err;
    }
}

interface ConvertedImage {
    pageNumber: number;
    dataUrl: string;
    filename: string;
}

export default function PdfToImagePage() {
    const [file, setFile] = useState<File | null>(null);
    const [pageCount, setPageCount] = useState<number>(0);
    const [images, setImages] = useState<ConvertedImage[]>([]);
    const [isConverting, setIsConverting] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imageFormat, setImageFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
    const [downloadProgress, setDownloadProgress] = useState(0);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            if (selected.type !== "application/pdf") {
                setError("Please upload a valid PDF file.");
                return;
            }

            if (selected.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
                setError(
                    `File too large (${formatSizeMB(selected.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} for browser-side conversion.`
                );
                setFile(null);
                return;
            }

            setFile(selected);
            setError(null);
            setImages([]);
            setPageCount(0);
            
            // Load PDF to get page count
            try {
                const pdfjsLib = await loadPdfJs();
                const arrayBuffer = await selected.arrayBuffer();
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdf = await loadingTask.promise;
                setPageCount(pdf.numPages);
            } catch (err) {
                console.error(err);
                setError("Failed to parse PDF. It might be corrupted or password protected.");
                setFile(null);
            }
        }
    };

    const convertPdfToImages = async () => {
        if (!file) return;

        setIsConverting(true);
        setError(null);
        setImages([]);

        try {
            const pdfjsLib = await loadPdfJs();
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            const convertedImages: ConvertedImage[] = [];
            const baseName = file.name.replace(/\.[^/.]+$/, "");

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const scale = 2; // Higher resolution
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) continue;

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                    canvas,
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                let dataUrl: string;
                switch (imageFormat) {
                    case 'jpeg':
                        dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                        break;
                    case 'webp':
                        dataUrl = canvas.toDataURL('image/webp', 0.95);
                        break;
                    default:
                        dataUrl = canvas.toDataURL('image/png');
                }

                convertedImages.push({
                    pageNumber: i,
                    dataUrl,
                    filename: `${baseName}_page_${i}.${imageFormat}`
                });

                setDownloadProgress(Math.round((i / pdf.numPages) * 100));
            }

            setImages(convertedImages);
        } catch (err) {
            console.error(err);
            setError("Failed to convert PDF to images.");
        } finally {
            setIsConverting(false);
            setDownloadProgress(0);
        }
    };

    const downloadImage = (image: ConvertedImage) => {
        const link = document.createElement("a");
        link.href = image.dataUrl;
        link.setAttribute("download", image.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadAllAsZip = async () => {
        if (images.length === 0) return;

        setIsDownloadingAll(true);
        setError(null);

        try {
            // Dynamic import of JSZip
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();

            images.forEach(image => {
                const base64 = image.dataUrl.split(',')[1];
                zip.file(image.filename, base64, { base64: true });
            });

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            const baseName = file?.name.replace(/\.[^/.]+$/, "") || "images";
            link.setAttribute("download", `${baseName}_pages.zip`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            setError("Failed to create ZIP file.");
        } finally {
            setIsDownloadingAll(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-6 py-12">
                {/* Header */}
                <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <Link
                            href="/tools"
                            className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-2 text-left"
                        >
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                                <FileImage className="w-8 h-8 text-purple-600" />
                                PDF to Image Converter
                            </h1>
                            <p className="text-sm text-slate-500">
                                Convert every page of your PDF into high-quality images (PNG, JPEG, or WebP).
                            </p>
                        </motion.div>
                    </div>

                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-purple-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
                    >
                        <Home className="w-4 h-4" />
                        <span className="hidden sm:inline">Home</span>
                    </Link>
                </header>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Upload & Settings */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                >
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="font-bold text-slate-900 uppercase tracking-wide text-sm">1. Upload & Settings</h2>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* File Upload */}
                            <div>
                                <label className="text-sm font-semibold text-slate-700 mb-3 block">PDF File</label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all hover:border-purple-400 hover:bg-purple-50/10 gap-3">
                                        <Upload className="w-10 h-10 text-slate-300 group-hover:text-purple-400 transition-colors" />
                                        <div>
                                            <span className="font-bold text-slate-700 block text-sm">Upload PDF</span>
                                            <span className="text-xs text-slate-500">Click or drag</span>
                                            <span className="text-xs text-purple-600 font-medium block mt-1">Recommended safe size: up to 100 MB</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {file && (
                                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 space-y-3">
                                    <div>
                                        <div className="font-semibold text-slate-900 text-sm truncate">{file.name}</div>
                                        <div className="text-xs text-slate-500">{pageCount} pages detected</div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setFile(null);
                                            setPageCount(0);
                                            setImages([]);
                                        }}
                                        className="text-xs text-purple-600 hover:text-purple-700 font-medium underline"
                                    >
                                        Change file
                                    </button>
                                </div>
                            )}

                            {/* Image Format */}
                            <div>
                                <label className="text-sm font-semibold text-slate-700 mb-3 block">Image Format</label>
                                <div className="space-y-2">
                                    {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                                        <label key={fmt} className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="radio"
                                                value={fmt}
                                                checked={imageFormat === fmt}
                                                onChange={(e) => setImageFormat(e.target.value as 'png' | 'jpeg' | 'webp')}
                                                className="w-4 h-4 accent-purple-600"
                                            />
                                            <span className="text-sm text-slate-700 font-medium uppercase">{fmt}</span>
                                            <span className="text-xs text-slate-500">
                                                {fmt === 'png' && '(Lossless)'}
                                                {fmt === 'jpeg' && '(Smaller files)'}
                                                {fmt === 'webp' && '(Modern)'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Convert Button */}
                            <button
                                onClick={convertPdfToImages}
                                disabled={!file || isConverting}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    !file || isConverting
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 hover:shadow-xl'
                                }`}
                            >
                                {isConverting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Converting... {downloadProgress}%
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon className="w-5 h-5" />
                                        Convert to Images
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>

                    {/* Right: Preview & Download */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
                    >
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h2 className="font-bold text-slate-900 uppercase tracking-wide text-sm">2. Converted Images</h2>
                            {images.length > 0 && (
                                <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{images.length}</span>
                            )}
                        </div>

                        <div className="p-6 flex-1 flex flex-col">
                            {images.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 min-h-100">
                                    <ImageIcon className="w-16 h-16 opacity-30" />
                                    <p className="text-sm">Converted images will appear here</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 flex-1 overflow-y-auto">
                                        <AnimatePresence>
                                            {images.map((image, idx) => (
                                                <motion.div
                                                    key={idx}
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden group flex flex-col"
                                                >
                                                    <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden relative">
                                                        <img
                                                            src={image.dataUrl}
                                                            alt={`Page ${image.pageNumber}`}
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </div>
                                                    <div className="p-3 border-t border-slate-200 space-y-2">
                                                        <div className="text-xs font-mono text-slate-600 truncate">
                                                            Page {image.pageNumber}
                                                        </div>
                                                        <button
                                                            onClick={() => downloadImage(image)}
                                                            className="w-full py-1.5 text-xs font-bold bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                                                        >
                                                            <Download className="w-3 h-3 inline mr-1" />
                                                            Download
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 space-y-3">
                                        <button
                                            onClick={downloadAllAsZip}
                                            disabled={isDownloadingAll}
                                            className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                                isDownloadingAll
                                                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200'
                                            }`}
                                        >
                                            {isDownloadingAll ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Preparing...
                                                </>
                                            ) : (
                                                <>
                                                    <Download className="w-5 h-5" />
                                                    Download All as ZIP
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setImages([]);
                                                setFile(null);
                                                setPageCount(0);
                                            }}
                                            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            Start Over
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Error Message */}
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-50 text-red-600 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold block">Error</span>
                            <span className="text-sm opacity-90">{error}</span>
                        </div>
                    </motion.div>
                )}

                <p className="text-center text-slate-400 text-sm">
                    Powered by <a href="https://github.com/mozilla/pdf.js" target="_blank" className="underline hover:text-slate-600">PDF.js</a>.
                </p>
            </div>
        </div>
    );
}
