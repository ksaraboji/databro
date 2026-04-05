"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, Loader2, AlertCircle, X, Download, Image as ImageIcon, Plus, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PDFDocument, PDFPage } from 'pdf-lib';

const SAFE_FILE_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;
const SAFE_TOTAL_SIZE_LIMIT_BYTES = 200 * 1024 * 1024;
const formatSizeMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

interface SelectedImage {
    file: File;
    preview: string;
    name: string;
}

function getEmbeddableImageBytes(file: File): Promise<{ bytes: ArrayBuffer; type: 'png' | 'jpeg' }> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Canvas context unavailable'));
                return;
            }
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(objectUrl);
            const isJpeg = file.type === 'image/jpeg';
            const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
            canvas.toBlob(
                (blob) => {
                    if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
                    blob.arrayBuffer()
                        .then((buf) => resolve({ bytes: buf, type: isJpeg ? 'jpeg' : 'png' }))
                        .catch(reject);
                },
                mimeType,
                0.95,
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error(`Failed to load image: ${file.name}`));
        };
        img.src = objectUrl;
    });
}

export default function ImageToPdfPage() {
    const [images, setImages] = useState<SelectedImage[]>([]);
    const [totalSize, setTotalSize] = useState(0);
    const [isConverting, setIsConverting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');

    const calculateTotalSize = (newImages: SelectedImage[]) => {
        const total = newImages.reduce((sum, img) => sum + img.file.size, 0);
        setTotalSize(total);
        return total;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            const validImages: SelectedImage[] = [];

            for (const file of newFiles) {
                if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.type)) {
                    setError(`Unsupported file type: ${file.type}. Please upload PNG, JPEG, WebP, or GIF.`);
                    continue;
                }

                if (file.size > SAFE_FILE_SIZE_LIMIT_BYTES) {
                    setError(
                        `Image too large (${formatSizeMB(file.size)}). Recommended safe limit is ${formatSizeMB(SAFE_FILE_SIZE_LIMIT_BYTES)} per image.`
                    );
                    continue;
                }

                const preview = URL.createObjectURL(file);
                validImages.push({
                    file,
                    preview,
                    name: file.name
                });
            }

            const updatedImages = [...images, ...validImages];
            const newTotal = calculateTotalSize(updatedImages);

            if (newTotal > SAFE_TOTAL_SIZE_LIMIT_BYTES) {
                setError(
                    `Total size too large (${formatSizeMB(newTotal)}). Recommended safe limit is ${formatSizeMB(SAFE_TOTAL_SIZE_LIMIT_BYTES)} total.`
                );
                setImages(images); // Revert
                return;
            }

            setImages(updatedImages);
            setError(null);
        }

        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files) {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'image/*';
            const fileList = e.dataTransfer.files;

            // Simulate change event
            const changeEvent = new Event('change', { bubbles: true });
            Object.defineProperty(input, 'files', {
                value: fileList,
                writable: false,
            });
            input.dispatchEvent(changeEvent);
            handleFileSelect({ target: input } as any);
        }
    };

    const removeImage = (index: number) => {
        const removed = images[index];
        URL.revokeObjectURL(removed.preview);
        const updated = images.filter((_, i) => i !== index);
        setImages(updated);
        calculateTotalSize(updated);
    };

    const moveImage = (index: number, direction: 'up' | 'down') => {
        const updated = [...images];
        if (direction === 'up' && index > 0) {
            [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        } else if (direction === 'down' && index < updated.length - 1) {
            [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
        }
        setImages(updated);
    };

    const convertImagesToPdf = async () => {
        if (images.length === 0) return;

        setIsConverting(true);
        setError(null);

        try {
            const pdfDoc = await PDFDocument.create();

            for (const img of images) {
                const { bytes, type } = await getEmbeddableImageBytes(img.file);
                const embeddedImage = type === 'jpeg'
                    ? await pdfDoc.embedJpg(bytes)
                    : await pdfDoc.embedPng(bytes);

                const { width, height } = embeddedImage.scale(1);

                // Determine page orientation and size
                let pageWidth = width;
                let pageHeight = height;

                if (orientation === 'portrait') {
                    if (width > height) {
                        pageWidth = height;
                        pageHeight = width;
                    }
                } else if (orientation === 'landscape') {
                    if (width < height) {
                        pageWidth = height;
                        pageHeight = width;
                    }
                }

                const page = pdfDoc.addPage([pageWidth, pageHeight]);
                const x = (pageWidth - width) / 2;
                const y = (pageHeight - height) / 2;
                page.drawImage(embeddedImage, {
                    x,
                    y,
                    width,
                    height,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

            const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `images_to_pdf_${timestamp}.pdf`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Clear after successful download
            images.forEach(img => URL.revokeObjectURL(img.preview));
            setImages([]);
            setTotalSize(0);
        } catch (err) {
            console.error(err);
            setError('Failed to convert images to PDF.');
        } finally {
            setIsConverting(false);
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
                                <FileText className="w-8 h-8 text-orange-600" />
                                Image to PDF Converter
                            </h1>
                            <p className="text-sm text-slate-500">
                                Combine multiple images (PNG, JPEG, WebP, GIF) into a single PDF document.
                            </p>
                        </motion.div>
                    </div>

                    <Link
                        href="/"
                        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-orange-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-50"
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
                                <label className="text-sm font-semibold text-slate-700 mb-3 block">Add Images</label>
                                <div
                                    className="relative group"
                                    onDrop={handleDrop}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                >
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all hover:border-orange-400 hover:bg-orange-50/10 gap-3">
                                        <Upload className="w-10 h-10 text-slate-300 group-hover:text-orange-400 transition-colors" />
                                        <div>
                                            <span className="font-bold text-slate-700 block text-sm">Upload Images</span>
                                            <span className="text-xs text-slate-500">Click or drag &amp; drop multiple images</span>
                                            <span className="text-xs text-orange-600 font-medium block mt-1">Recommended: up to 50 MB per image, 200 MB total</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {images.length > 0 && (
                                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 space-y-2">
                                    <div className="text-sm font-semibold text-slate-900">{images.length} image(s) selected</div>
                                    <div className="text-xs text-slate-600">Total size: {formatSizeMB(totalSize)}</div>
                                </div>
                            )}

                            {/* Page Orientation */}
                            <div>
                                <label className="text-sm font-semibold text-slate-700 mb-3 block">Page Orientation</label>
                                <div className="space-y-2">
                                    {(['auto', 'portrait', 'landscape'] as const).map(opt => (
                                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="radio"
                                                value={opt}
                                                checked={orientation === opt}
                                                onChange={(e) => setOrientation(e.target.value as any)}
                                                className="w-4 h-4 accent-orange-600"
                                            />
                                            <span className="text-sm text-slate-700 font-medium capitalize">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Convert Button */}
                            <button
                                onClick={convertImagesToPdf}
                                disabled={images.length === 0 || isConverting}
                                className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    images.length === 0 || isConverting
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200 hover:shadow-xl'
                                }`}
                            >
                                {isConverting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Creating PDF...
                                    </>
                                ) : (
                                    <>
                                        <FileText className="w-5 h-5" />
                                        Create PDF
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>

                    {/* Right: Image List */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"
                    >
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h2 className="font-bold text-slate-900 uppercase tracking-wide text-sm">2. Selected Images</h2>
                            {images.length > 0 && (
                                <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{images.length}</span>
                            )}
                        </div>

                        <div className="p-6 flex-1 flex flex-col">
                            {images.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 min-h-100">
                                    <ImageIcon className="w-16 h-16 opacity-30" />
                                    <p className="text-sm">No images selected yet</p>
                                    <p className="text-xs text-slate-400">Add images above to get started</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6 flex-1 overflow-y-auto">
                                        <AnimatePresence>
                                            {images.map((img, idx) => (
                                                <motion.div
                                                    key={idx}
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden group flex flex-col"
                                                >
                                                    <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden relative">
                                                        <img
                                                            src={img.preview}
                                                            alt={img.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute top-2 left-2 min-w-6 h-6 px-1 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md">
                                                            {idx + 1}
                                                        </div>
                                                    </div>
                                                    <div className="p-3 border-t border-slate-200 space-y-2">
                                                        <div className="text-xs font-mono text-slate-600 truncate" title={img.name}>
                                                            {img.name}
                                                        </div>
                                                        <div className="flex gap-1 justify-between">
                                                            <button
                                                                onClick={() => moveImage(idx, 'up')}
                                                                disabled={idx === 0}
                                                                className="flex-1 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ▲
                                                            </button>
                                                            <button
                                                                onClick={() => moveImage(idx, 'down')}
                                                                disabled={idx === images.length - 1}
                                                                className="flex-1 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                            >
                                                                ▼
                                                            </button>
                                                            <button
                                                                onClick={() => removeImage(idx)}
                                                                className="flex-1 py-1 text-xs font-bold bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                                                            >
                                                                <X className="w-3 h-3 inline" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 space-y-3">
                                        <button
                                            onClick={() => {
                                                images.forEach(img => URL.revokeObjectURL(img.preview));
                                                setImages([]);
                                                setTotalSize(0);
                                            }}
                                            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            Clear All
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
                    Powered by <a href="https://github.com/Hopding/pdf-lib" target="_blank" className="underline hover:text-slate-600">pdf-lib</a>.
                </p>
            </div>
        </div>
    );
}
