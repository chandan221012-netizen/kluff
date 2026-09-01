import React, { useState, useMemo } from 'react';
import {
  ArrowRight, ArrowLeft, ChevronLeft, ChevronRight,
  FileText, Layers, BookOpen, AlignJustify, Check, Copy, Maximize2, X
} from 'lucide-react';

/**
 * Parses a page range string like "1-3, 5, 7-10" into an array of page numbers.
 */
function parsePageRange(rangeStr, totalPages) {
  if (!rangeStr || !rangeStr.trim()) return [];
  const pages = new Set();
  const parts = rangeStr.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        pages.add(page);
      }
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

export default function StepPreview({
  files = [],
  editSettings = {},
  pageRange = {},
  setPageRange,
  fileCopies = {},
  setFileCopies,
  printSide = 'single',
  setPrintSide,
  totalPages = {},
  pageImages = {},
  onNext,
  onBack,
}) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const activeFile = files?.[activeFileIndex];
  const fileKey = activeFileIndex;
  const fileTotalPages = totalPages?.[fileKey] || 1;
  const currentCopies = fileCopies[activeFileIndex] || 1;
  const settings = editSettings?.[fileKey] || {
    zoom: 1, rotation: 0, brightness: 100, contrast: 100, cropPoints: null, orientation: 'portrait'
  };

  const fileRange = pageRange?.[fileKey] || '';
  const selectedPages = useMemo(() => {
    if (!fileRange.trim()) {
      return Array.from({ length: fileTotalPages }, (_, i) => i + 1);
    }
    const parsed = parsePageRange(fileRange, fileTotalPages);
    return parsed.length > 0 ? parsed : Array.from({ length: fileTotalPages }, (_, i) => i + 1);
  }, [fileRange, fileTotalPages]);

  const totalSelectedPages = useMemo(() => {
    let count = 0;
    files.forEach((_, idx) => {
      const r = pageRange?.[idx] || '';
      const tp = totalPages?.[idx] || 1;
      const pagesForFile = (!r.trim()) ? tp : (parsePageRange(r, tp).length || tp);
      const copiesForFile = fileCopies[idx] || 1;
      count += pagesForFile * copiesForFile;
    });
    return count;
  }, [files, pageRange, totalPages, fileCopies]);

  const isLandscape = settings.orientation === 'landscape';
  const totalRotation = (settings.rotation + (isLandscape ? 90 : 0)) % 360;
  const currentPreviewPage = selectedPages[previewPage - 1] || 1;
  const currentImage = pageImages?.[fileKey]?.[currentPreviewPage];

  return (
    <div className="space-y-4">
      {/* File Tabs */}
      {files.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {files.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setActiveFileIndex(i); setPreviewPage(1); }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                i === activeFileIndex
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {f.name.length > 15 ? f.name.substring(0, 12) + '...' : f.name}
            </button>
          ))}
        </div>
      )}

      {/* Main Preview Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-4">
        {/* Card Header matching reference */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center font-bold text-xs shrink-0">
              PDF
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 truncate max-w-[200px]">
                {activeFile?.name || 'Document'}
              </h2>
              <p className="text-xs text-slate-400 font-medium">{fileTotalPages} pages</p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1 rounded-xl shrink-0">
            {selectedPages.length} pages selected
          </span>
        </div>

        {/* Preview Canvas with Floating Buttons */}
        <div
          className="relative bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-center overflow-hidden"
          style={{ minHeight: '320px', maxHeight: '420px' }}
        >
          {/* Top-Right Expand Button */}
          <button
            type="button"
            onClick={() => setShowFullscreen(true)}
            className="absolute top-3 right-3 z-20 w-9 h-9 rounded-xl bg-white/95 hover:bg-white shadow-md border border-slate-200/90 flex items-center justify-center text-slate-700 hover:text-slate-950 transition-all active:scale-95 cursor-pointer"
            title="Maximize and view full screen"
            aria-label="Maximize preview"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Centered Document Sheet (Clean final preview without crop tool borders) */}
          {currentImage ? (
            <div className="relative p-2 flex items-center justify-center">
              <img
                src={currentImage}
                alt={`Page ${currentPreviewPage} preview`}
                className="max-w-full max-h-[360px] object-contain select-none shadow-md rounded-sm bg-white"
                draggable={false}
                style={{
                  transform: `rotate(${totalRotation}deg)`,
                  filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
                }}
              />
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-medium py-16">
              No preview available for page {currentPreviewPage}
            </div>
          )}

          {/* Floating Mid-Right & Mid-Left Document Switcher Arrows (when multiple files) */}
          {files.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveFileIndex(i => (i - 1 + files.length) % files.length);
                  setPreviewPage(1);
                }}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 flex items-center justify-center transition-all"
                title="Previous Document"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveFileIndex(i => (i + 1) % files.length);
                  setPreviewPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-slate-200 text-slate-800 hover:scale-105 active:scale-95 flex items-center justify-center transition-all"
                title="Next Document"
              >
                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
              </button>
            </>
          )}
        </div>

        {/* Page Indicator & Page Navigation */}
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-2">
          <span>Page {previewPage} of {selectedPages.length}</span>
          {selectedPages.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                disabled={previewPage <= 1}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewPage(p => Math.min(selectedPages.length, p + 1))}
                disabled={previewPage >= selectedPages.length}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Page Thumbnails Row */}
        {fileTotalPages > 1 && (
          <div className="flex justify-center gap-3 overflow-x-auto py-1">
            {Array.from({ length: Math.min(fileTotalPages, 10) }, (_, i) => i + 1).map(pageNum => {
              const isSelected = selectedPages.includes(pageNum);
              const isCurrent = pageNum === currentPreviewPage;
              const thumbImg = pageImages?.[fileKey]?.[pageNum];

              return (
                <div key={pageNum} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const idx = selectedPages.indexOf(pageNum);
                      if (idx !== -1) setPreviewPage(idx + 1);
                    }}
                    className={`w-14 h-18 rounded-lg overflow-hidden bg-slate-50 transition-all ${
                      isCurrent
                        ? 'ring-2 ring-amber-400 shadow-md scale-105'
                        : isSelected
                        ? 'border border-slate-200 opacity-90'
                        : 'opacity-40 grayscale border border-slate-200'
                    }`}
                  >
                    {thumbImg ? (
                      <img src={thumbImg} alt={`P${pageNum}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                        {pageNum}
                      </div>
                    )}
                  </button>
                  <span className={`text-[10px] font-bold ${isCurrent ? 'text-amber-500 font-black' : 'text-slate-400'}`}>
                    {pageNum}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Page Selection Controls */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-800">Pages to Print</h3>

        {/* Radio options */}
        <div className="grid grid-cols-2 gap-2">
          {/* All Pages Pill */}
          <button
            type="button"
            onClick={() => setPageRange(prev => ({ ...prev, [fileKey]: '' }))}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              !fileRange.trim()
                ? 'border-amber-400 bg-amber-50/50 text-slate-900 shadow-xs'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
              !fileRange.trim() ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
            }`}>
              {!fileRange.trim() && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <span>All Pages ({fileTotalPages})</span>
          </button>

          {/* Custom Range Pill */}
          <button
            type="button"
            onClick={() => {
              if (!fileRange.trim()) {
                setPageRange(prev => ({ ...prev, [fileKey]: `1-${fileTotalPages}` }));
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
              fileRange.trim()
                ? 'border-amber-400 bg-amber-50/50 text-slate-900 shadow-xs'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
              fileRange.trim() ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
            }`}>
              {fileRange.trim() && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <span>Custom Range</span>
          </button>
        </div>

        {/* Custom Range Input */}
        <div>
          <input
            type="text"
            value={fileRange}
            onChange={(e) => setPageRange(prev => ({ ...prev, [fileKey]: e.target.value }))}
            placeholder="e.g. 1-2, 4, 7-9"
            className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 px-6 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs transition-all active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={totalSelectedPages === 0}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-2xl text-xs shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98]"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Looks Good, Continue</span>
        </button>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {showFullscreen && currentImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-200"
          onClick={() => setShowFullscreen(false)}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between py-3 px-4 text-white max-w-3xl mx-auto w-full shrink-0 border-b border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 pr-4">
              <h3 className="text-sm font-bold truncate text-slate-100">
                {activeFile?.name || 'Document'}
              </h3>
              <p className="text-xs text-slate-400">
                Page {currentPreviewPage} of {fileTotalPages} • Fullscreen Preview
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowFullscreen(false)}
              className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white flex items-center justify-center transition-all border border-slate-700 shadow-sm"
              title="Close Fullscreen"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Centered Image */}
          <div
            className="flex-1 flex items-center justify-center p-3 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage}
              alt={`Page ${currentPreviewPage} fullscreen`}
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl bg-white select-none"
              style={{
                transform: `rotate(${totalRotation}deg)`,
                filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Export the parser so CustomerPrint can use it
export { parsePageRange };
