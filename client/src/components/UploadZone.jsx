import React, { useRef } from 'react';
import { Upload, Camera, FileUp } from 'lucide-react';

export default function UploadZone({ onFilesSelected }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-3">
      {/* Drag & Drop Card */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative border-2 border-dashed border-slate-200 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/20 rounded-2xl p-8 text-center transition-all cursor-pointer group"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform text-indigo-600">
          <Upload className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-slate-800">Tap or drag files to upload</h3>
        <p className="text-xs text-slate-400 mt-1">Supports PDF, PNG, JPG, JPEG, DOCX (Max 25MB)</p>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-[11px] font-semibold text-slate-600 mt-4 shadow-sm">
          <FileUp className="w-3.5 h-3.5 text-indigo-600" /> Multiple files supported
        </div>
      </div>

      {/* Camera Capture Button (Mobile Primary) */}
      <div className="sm:hidden">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-slate-900/10 active:scale-[0.98] transition-transform"
        >
          <Camera className="w-4 h-4" /> Take Photo to Print
        </button>
      </div>
    </div>
  );
}