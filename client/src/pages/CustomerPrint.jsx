
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // ✅ Corrected import
import io from 'socket.io-client';
import { 
  Upload, Printer, CheckCircle2, AlertCircle, Loader2, 
  FileText, Copy, Palette, Sparkles, ShieldCheck 
} from 'lucide-react';

const SERVER_URL = 'http://localhost:5000';

export default function CustomerPrint() {
  const { token } = useParams();
  const [shopInfo, setShopInfo] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  
  // Form State
  const [file, setFile] = useState(null);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('bw');

  // Job & Tracking State
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [totalPrice, setTotalPrice] = useState(0);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/shops/public/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Invalid or expired QR code');
        return res.json();
      })
      .then((data) => {
        setShopInfo(data);
        if (data.printers && data.printers.length > 0) {
          setSelectedPrinter(data.printers[0].printerId);
        }
        setLoadingShop(false);
      })
      .catch((err) => {
        setErrorMsg(err.message);
        setLoadingShop(false);
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !selectedPrinter) return;

    setSubmitting(true);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('document', file);
    formData.append('shopToken', token);
    formData.append('printerId', selectedPrinter);
    formData.append('copies', copies);
    formData.append('colorMode', colorMode);

    try {
      const res = await fetch(`${SERVER_URL}/api/print-jobs/submit`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit print job');
      }

      setJobId(data.jobId);
      setTotalPrice(data.totalPrice);
      setStatus(data.status);

      const socket = io(SERVER_URL);
      socket.emit('join-job-room', data.jobId);

      socket.on('customer-status-update', (update) => {
        setStatus(update.status);
        if (update.errorMessage) setErrorMsg(update.errorMessage);
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingShop) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh]">
        <div className="p-4 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="text-sm font-medium text-slate-600">Connecting to print terminal...</span>
        </div>
      </div>
    );
  }

  if (errorMsg && !shopInfo) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 text-center">
        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Terminal Offline</h2>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{errorMsg}</p>
      </div>
    );
  }

  if (jobId) {
    return (
      <div className="max-w-md mx-auto mt-10 p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold tracking-wide mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Direct Express Terminal
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900">{shopInfo?.shopName}</h2>
        <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">Job Reference: {jobId}</p>

        <div className="my-8 p-6 bg-slate-50/80 rounded-2xl border border-slate-100">
          {status === 'COMPLETED' ? (
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          ) : status === 'FAILED' ? (
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-100">
              <AlertCircle className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-indigo-100">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          )}

          <div className="text-base font-bold text-slate-800 tracking-wider uppercase">
            {status}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {status === 'COMPLETED' ? 'Document printed successfully!' : 'Processing your document...'}
          </p>
          {errorMsg && <p className="text-xs text-red-500 font-medium mt-3 px-2">{errorMsg}</p>}
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-900/10 mb-6">
          <span className="text-xs font-medium text-slate-300">Total Price</span>
          <span className="text-xl font-black">₹{totalPrice}</span>
        </div>

        <button
          onClick={() => { setJobId(null); setStatus(null); setFile(null); }}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Print another document
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-6 p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100">
      <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{shopInfo?.shopName}</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Instant Self-Service Print Hub</p>
        </div>
        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
          <Printer className="w-6 h-6" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* File Dropzone */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            1. Select Document
          </label>
          <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-6 text-center transition-all group bg-slate-50/50 hover:bg-indigo-50/30">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              required
            />
            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5 text-indigo-600" />
            </div>
            <span className="text-xs font-semibold text-slate-700 block truncate">
              {file ? file.name : 'Tap to upload PDF or Image'}
            </span>
            <span className="text-[10px] text-slate-400 mt-1 block">Maximum file size: 25MB</span>
          </div>
        </div>

        {/* Printer Pick */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            2. Choose Printer
          </label>
          <select
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
          >
            {shopInfo?.printers.map((p) => (
              <option key={p.printerId} value={p.printerId}>
                {p.name} {p.isColorSupported ? '• (Supports Color)' : '• (Monochrome Only)'}
              </option>
            ))}
          </select>
        </div>

        {/* Options Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Copy className="w-3.5 h-3.5" /> Copies
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" /> Color Mode
            </label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value)}
              className="w-full text-xs font-medium border border-slate-200 rounded-xl p-3 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-800"
            >
              <option value="bw">B&W (₹{shopInfo?.pricing?.bwPerPage}/pg)</option>
              <option value="color">Color (₹{shopInfo?.pricing?.colorPerPage}/pg)</option>
            </select>
          </div>
        </div>

        {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex justify-center items-center gap-2 text-xs uppercase tracking-wider"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Printer className="w-4 h-4" /> Send Job to Printer
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Encrypted Direct Terminal Spooling</span>
        </div>
      </form>
    </div>
  );
}