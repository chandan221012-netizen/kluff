import React, { useRef, useState, useEffect } from 'react';
import {
  Upload,
  Camera,
  FileText,
  Image as ImageIcon,
  X,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { saveFilesToStorage, loadFilesFromStorage } from '../../utils/fileStorage';

export default function StepUpload({
  files = [],
  setFiles,
  onRemoveFile,
  paperSize = 'A4',
  setPaperSize,
  onNext,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewModalFile, setPreviewModalFile] = useState(null);
  const [previewModalUrl, setPreviewModalUrl] = useState(null);
  const [previewPdfCanvasUrl, setPreviewPdfCanvasUrl] = useState(null);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const paperSizeOptions = ['A4', 'A3', 'A2', 'A1', 'Legal'];

  // Restore files from IndexedDB if page was killed by Android/iOS background killer
  useEffect(() => {
    if (files.length === 0) {
      loadFilesFromStorage().then((stored) => {
        if (stored && stored.length > 0 && typeof setFiles === 'function') {
          setFiles(stored);
        }
      });
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && files.length === 0) {
        loadFilesFromStorage().then((stored) => {
          if (stored && stored.length > 0 && typeof setFiles === 'function') {
            setFiles(stored);
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [files.length, setFiles]);

  const handleOpenPreview = async (file) => {
    if (!file) return;
    setPreviewModalFile(file);
    setPreviewPdfCanvasUrl(null);

    try {
      const url = URL.createObjectURL(file);
      setPreviewModalUrl(url);

      // If PDF, render first page to high-res image canvas for instant mobile preview
      if (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
        // Instant return if cached
        const fileKey = `${file.name}_${file.size}_${file.lastModified || 0}`;
        if (window.__previewCache && window.__previewCache[fileKey]) {
          setPreviewPdfCanvasUrl(window.__previewCache[fileKey]);
          return;
        }

        setPreviewPdfLoading(true);
        try {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();

          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.2 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d', { alpha: false });

          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          
          if (!window.__previewCache) window.__previewCache = {};
          window.__previewCache[fileKey] = dataUrl;

          setPreviewPdfCanvasUrl(dataUrl);
        } catch (pdfErr) {
          console.warn('PDF preview render error:', pdfErr);
        } finally {
          setPreviewPdfLoading(false);
        }
      }
    } catch (e) {
      console.error('Preview create URL error:', e);
    }
  };

  const handleClosePreview = () => {
    if (previewModalUrl) {
      try {
        URL.revokeObjectURL(previewModalUrl);
      } catch (e) {}
    }
    setPreviewModalUrl(null);
    setPreviewModalFile(null);
    setPreviewPdfCanvasUrl(null);
    setPreviewPdfLoading(false);
  };

  // Clean up object URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewModalUrl) {
        try { URL.revokeObjectURL(previewModalUrl); } catch (e) {}
      }
    };
  }, [previewModalUrl]);

  const handleAddFiles = async (incomingFileList) => {
    if (!incomingFileList || incomingFileList.length === 0) return;
    try {
      const newFilesArray = Array.from(incomingFileList);

      // 1. Immediately update state and transition to Edit screen (0 ms latency)
      const existing = Array.isArray(files) ? files : [];
      const combined = [...existing, ...newFilesArray];

      if (typeof setFiles === 'function') {
        setFiles(combined);
      }

      if (typeof onNext === 'function') {
        onNext();
      }

      // 2. Persist to IndexedDB in background without holding up screen transition
      saveFilesToStorage(combined).catch(() => {});
    } catch (err) {
      console.error('Error adding files:', err);
    }
  };

  const handleFileInputChange = (e) => {
    try {
      const selected = e.target.files;
      if (selected && selected.length > 0) {
        handleAddFiles(selected);
      }
    } catch (err) {
      console.error('File input change error:', err);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    if (typeof onRemoveFile === 'function') {
      onRemoveFile(indexToRemove);
    } else if (typeof setFiles === 'function') {
      const updated = (Array.isArray(files) ? files : []).filter((_, idx) => idx !== indexToRemove);
      saveFilesToStorage(updated).catch(() => {});
      setFiles(updated);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '0.00 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const isImageFile = (file) => {
    if (file?.type?.startsWith('image/')) return true;
    const name = file?.name?.toLowerCase() || '';
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
  };

  const hasFiles = files && files.length > 0;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-6 max-w-[480px] mx-auto">
      {/* Hidden File Inputs outside clickable containers to prevent event loop / bubbling crashes */}
      <input
        id="customer-file-upload"
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.doc,.docx"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        id="customer-camera-capture"
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Upload Zone */}
      <div className="space-y-3">
        <label
          htmlFor="customer-file-upload"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all active:scale-[0.99] ${
            isDragging
              ? 'border-amber-400 bg-amber-50/60'
              : 'border-amber-300 hover:border-amber-400 bg-amber-50/20'
          }`}
        >
          <div className="flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-3 transition-transform">
              <Upload className="w-6 h-6 stroke-[2.5]" />
            </div>
            <p className="text-base font-bold text-slate-900">Tap or drag files to upload</p>
            <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG, DOCX — Max 25MB</p>
          </div>
        </label>

        {/* Mobile Camera Capture Button */}
        <div className="sm:hidden">
          <label
            htmlFor="customer-camera-capture"
            className="w-full bg-slate-900 hover:bg-black active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-sm cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Take Photo to Print</span>
          </label>
        </div>
      </div>

      {/* Uploaded Files List */}
      {hasFiles && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Uploaded Files ({files.length})
            </span>
          </div>

          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${file.lastModified || index}-${index}`}
                onClick={() => handleOpenPreview(file)}
                className="flex items-center gap-3 p-3 bg-slate-50/80 hover:bg-slate-100/90 rounded-2xl border border-slate-100 cursor-pointer transition-all active:scale-[0.99] group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  {isImageFile(file) ? (
                    <ImageIcon className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(file.size)} • Tap to preview
                  </p>
                </div>

                {/* Maximize & View File Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenPreview(file);
                  }}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-95 flex-shrink-0"
                  title="Maximize and view file"
                  aria-label={`Maximize ${file.name}`}
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {/* Remove File Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-95 flex-shrink-0"
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paper Size Selector */}
      {hasFiles && (
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
            Paper Size
          </label>
          <div className="flex gap-2">
            {paperSizeOptions.map((size) => {
              const isSelected = (paperSize || 'A4') === size;
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize && setPaperSize(size)}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Next Button */}
      {hasFiles && (
        <button
          type="button"
          onClick={onNext}
          disabled={!hasFiles}
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
        >
          <span>Continue to Edit ({files.length} file{files.length > 1 ? 's' : ''})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}

      {/* Fullscreen Document Preview Lightbox Modal */}
      {previewModalFile && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-200"
          onClick={handleClosePreview}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between py-3 px-4 text-white max-w-3xl mx-auto w-full shrink-0 border-b border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 pr-4">
              <h3 className="text-sm font-bold truncate text-slate-100">
                {previewModalFile.name}
              </h3>
              <p className="text-xs text-slate-400">
                {formatFileSize(previewModalFile.size)} • Fullscreen Preview
              </p>
            </div>

            <button
              type="button"
              onClick={handleClosePreview}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white flex items-center justify-center transition-all border border-slate-700 shadow-sm"
              title="Close Preview"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Body */}
          <div
            className="flex-1 flex items-center justify-center p-3 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {isImageFile(previewModalFile) ? (
              <img
                src={previewModalUrl}
                alt="Document preview"
                className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl bg-white select-none"
              />
            ) : previewPdfCanvasUrl ? (
              <img
                src={previewPdfCanvasUrl}
                alt="PDF First Page Preview"
                className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl bg-white select-none"
              />
            ) : previewModalFile.type === 'application/pdf' || previewModalFile.name?.endsWith('.pdf') ? (
              <div className="p-8 bg-white rounded-3xl text-center space-y-4 max-w-sm shadow-2xl">
                {previewPdfLoading ? (
                  <div className="space-y-3">
                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-semibold text-slate-600">Generating PDF preview...</p>
                  </div>
                ) : (
                  <>
                    <FileText className="w-14 h-14 text-amber-500 mx-auto" />
                    <div>
                      <p className="text-sm font-bold text-slate-800 break-words">{previewModalFile.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{formatFileSize(previewModalFile.size)} • Multi-page PDF</p>
                    </div>
                    <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      Tap <b>Continue to Edit</b> to view every page, rotate, or crop!
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="p-8 bg-white rounded-3xl text-center space-y-3 max-w-xs shadow-2xl">
                <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-800">{previewModalFile.name}</p>
                <p className="text-xs text-slate-400">Ready to print ({formatFileSize(previewModalFile.size)})</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
