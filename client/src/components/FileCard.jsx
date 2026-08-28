import React from 'react';
import { FileText, Image as ImageIcon, Trash2, Eye } from 'lucide-react';

export default function FileCard({ file, pageCount, onRemove, onPreview }) {
  const isImage = file.type?.startsWith('image/');
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-slate-200 transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0 font-bold">
          {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-slate-800 truncate">{file.name}</h4>
          <p className="text-[11px] text-slate-400 font-medium">
            {pageCount ? `${pageCount} pages` : 'Calculating pages...'} • {fileSizeMB} MB
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-2">
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="Preview Document"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          title="Remove File"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}