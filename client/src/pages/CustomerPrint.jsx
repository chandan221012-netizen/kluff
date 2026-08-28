import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import {
  Printer, CheckCircle2, AlertCircle, Loader2,
  Copy, Palette, Sparkles, ShieldCheck, ArrowRight, ArrowLeft,
  Store, Clock, FileCheck, CreditCard, ChevronRight, RefreshCw, ZoomIn, RotateCw
} from 'lucide-react';

import UploadZone from '../components/UploadZone';
import FileCard from '../components/FileCard';
import PriceBreakdown from '../components/PriceBreakdown';
import OrderTimeline from '../components/OrderTimeline';

const SERVER_URL = 'http://localhost:5000';

export default function CustomerPrint() {
  const { token } = useParams();

  // App Steps: 1: Landing, 2: Upload, 3: Options & Preview, 4: Summary, 5: Payment, 6: Tracking
  const [currentStep, setCurrentStep] = useState(1);

  // Shop Data
  const [shopInfo, setShopInfo] = useState(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Print Job Configuration
  const [files, setFiles] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('bw');
  const [paperSize, setPaperSize] = useState('A4');
  const [printSide, setPrintSide] = useState('single');
  const [finishing, setFinishing] = useState('none');
  const [paymentMethod, setPaymentMethod] = useState('counter');

  // Preview State
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewRotation, setPreviewRotation] = useState(0);

  // Submission & Tracking
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [pricingBreakdown, setPricingBreakdown] = useState({
    printing: 0,
    paper: 0,
    finishing: 0,
    service: 2,
    total: 2,
  });

  // Fetch Public Shop Info via QR Token
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

  // Recalculate Dynamic Pricing whenever print settings change
  useEffect(() => {
    if (!shopInfo) return;

    const rate = colorMode === 'color'
      ? (shopInfo.pricing?.colorPerPage || 10)
      : (shopInfo.pricing?.bwPerPage || 2);

    // Default estimate assuming 1 page per file if page-parsing isn't finished
    const estimatedTotalPages = files.reduce((acc, f) => acc + (f.pageCount || 1), 0);
    const printingCost = estimatedTotalPages * rate * copies;
    const paperCost = paperSize === 'A3' ? estimatedTotalPages * 2 * copies : 0;
    const finishingCost = finishing === 'staple' ? 5 : finishing === 'binding' ? 30 : 0;
    const serviceFee = 2;

    setPricingBreakdown({
      printing: printingCost,
      paper: paperCost,
      finishing: finishingCost,
      service: serviceFee,
      total: printingCost + paperCost + finishingCost + serviceFee,
    });
  }, [files, copies, colorMode, paperSize, finishing, shopInfo]);

  // File Handlers
  const handleFilesAdded = (newFiles) => {
    const formattedFiles = newFiles.map((file) => Object.assign(file, { pageCount: 1 }));
    setFiles((prev) => [...prev, ...formattedFiles]);
  };

  const handleRemoveFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Order to Backend
  const handleSubmitJob = async () => {
    if (files.length === 0 || !selectedPrinter) return;

    setSubmitting(true);
    setErrorMsg('');

    const formData = new FormData();
    files.forEach((file) => formData.append('document', file));
    formData.append('shopToken', token);
    formData.append('printerId', selectedPrinter);
    formData.append('copies', copies);
    formData.append('colorMode', colorMode);
    formData.append('paperSize', paperSize);
    formData.append('printSide', printSide);
    formData.append('finishing', finishing);
    formData.append('paymentMethod', paymentMethod);

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
      setStatus(data.status || 'RECEIVED');
      setCurrentStep(6); // Move to Order Tracking

      // Connect Socket.IO for live order progress
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

  return (
    <div className="max-w-md mx-auto my-4 px-4 pb-12">
      {/* Brand Header */}
      <div className="flex items-center justify-between py-3 mb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-600/20">
            K
          </div>
          <div>
            <span className="text-base font-black text-slate-900 tracking-tight">Kluff</span>
            <span className="text-[10px] text-slate-400 font-semibold block leading-none">Zero-Touch Printing</span>
          </div>
        </div>

        {currentStep < 6 && (
          <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
            Step {currentStep} of 5
          </span>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: SHOP LANDING PAGE                                                 */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100 shadow-sm">
              <Store className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full inline-block">
              Connected Terminal
            </span>
            <h1 className="text-2xl font-black text-slate-900">{shopInfo?.shopName}</h1>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1 font-medium">
              <Clock className="w-3.5 h-3.5 text-emerald-500" /> Est. Ready Time: 5-10 mins
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center text-xs pt-2">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">B&W Rate</span>
              <span className="text-sm font-black text-slate-800">₹{shopInfo?.pricing?.bwPerPage}/pg</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Color Rate</span>
              <span className="text-sm font-black text-slate-800">₹{shopInfo?.pricing?.colorPerPage}/pg</span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>No app installation required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Direct encrypted spooling to shop printer</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Instant price estimation & progress tracking</span>
            </div>
          </div>

          <button
            onClick={() => setCurrentStep(2)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            Start Printing <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: UPLOAD DOCUMENT                                                   */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">What would you like to print?</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload PDFs, images, or document files</p>
          </div>

          <UploadZone onFilesSelected={handleFilesAdded} />

          {files.length > 0 && (
            <div className="space-y-2 pt-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Uploaded Files ({files.length})
              </label>
              {files.map((file, index) => (
                <FileCard
                  key={index}
                  file={file}
                  pageCount={file.pageCount}
                  onRemove={() => handleRemoveFile(index)}
                  onPreview={() => {
                    setPreviewFileIndex(index);
                    setCurrentStep(3);
                  }}
                />
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
            >
              Back
            </button>
            <button
              disabled={files.length === 0}
              onClick={() => setCurrentStep(3)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: FILE PREVIEW & PRINT OPTIONS                                      */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Configure Print Options</h2>
            <p className="text-xs text-slate-400 mt-0.5">Preview and adjust formatting rules</p>
          </div>

          {/* Minimal Document Preview Controls */}
          {files[previewFileIndex] && (
            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium truncate max-w-[180px]">{files[previewFileIndex].name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreviewZoom((z) => Math.min(z + 25, 200))} className="p-1 hover:text-indigo-400">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setPreviewRotation((r) => (r + 90) % 360)} className="p-1 hover:text-indigo-400">
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-32 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 overflow-hidden">
                <div
                  style={{
                    transform: `scale(${previewZoom / 100}) rotate(${previewRotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                  className="text-slate-400 text-xs flex flex-col items-center gap-1"
                >
                  <FileCheck className="w-8 h-8 text-indigo-400" />
                  <span>Page 1 of {files[previewFileIndex].pageCount || 1}</span>
                </div>
              </div>
            </div>
          )}

          {/* Configuration Form */}
          <div className="space-y-4 text-xs">
            {/* Target Printer */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Target Printer</label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
              >
                {shopInfo?.printers?.map((p) => (
                  <option key={p.printerId} value={p.printerId}>
                    {p.name} {p.isColorSupported ? '• (Color)' : '• (Monochrome)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Copies & Color Mode */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Copies</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={copies}
                  onChange={(e) => setCopies(Number(e.target.value))}
                  className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Color Mode</label>
                <select
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value)}
                  className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
                >
                  <option value="bw">B&W (₹{shopInfo?.pricing?.bwPerPage}/pg)</option>
                  <option value="color">Color (₹{shopInfo?.pricing?.colorPerPage}/pg)</option>
                </select>
              </div>
            </div>

            {/* Paper Size & Sides */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Paper Size</label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value)}
                  className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
                >
                  <option value="A4">A4 Standard</option>
                  <option value="A3">A3 Poster (+₹2)</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Print Sides</label>
                <select
                  value={printSide}
                  onChange={(e) => setPrintSide(e.target.value)}
                  className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
                >
                  <option value="single">Single-Sided</option>
                  <option value="double">Double-Sided (Duplex)</option>
                </select>
              </div>
            </div>

            {/* Finishing */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Finishing Options</label>
              <select
                value={finishing}
                onChange={(e) => setFinishing(e.target.value)}
                className="w-full font-medium border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-800"
              >
                <option value="none">No Finishing</option>
                <option value="staple">Corner Staple (+₹5)</option>
                <option value="binding">Spiral Binding (+₹30)</option>
              </select>
            </div>
          </div>

          <PriceBreakdown {...pricingBreakdown} />

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              Review Order <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: ORDER SUMMARY                                                     */}
      {/* ========================================================================= */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Order Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">Please review before sending to queue</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 text-xs">
            <div className="flex justify-between font-medium">
              <span className="text-slate-500">Shop</span>
              <span className="font-bold text-slate-800">{shopInfo?.shopName}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-500">Documents</span>
              <span className="font-bold text-slate-800">{files.length} file(s)</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-500">Settings</span>
              <span className="font-bold text-slate-800">
                {paperSize} • {colorMode.toUpperCase()} • {copies} Copy(ies)
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-500">Finishing</span>
              <span className="font-bold text-slate-800">{finishing}</span>
            </div>
          </div>

          <PriceBreakdown {...pricingBreakdown} />

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
            >
              Edit Settings
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              Proceed to Payment <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 5: PAYMENT                                                           */}
      {/* ========================================================================= */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Choose Payment Method</h2>
            <p className="text-xs text-slate-400 mt-0.5">Total payable: ₹{pricingBreakdown.total}</p>
          </div>

          <div className="space-y-3 text-xs">
            <label
              onClick={() => setPaymentMethod('counter')}
              className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'counter'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 font-bold'
                  : 'border-slate-100 text-slate-600'
                }`}
            >
              <div className="flex items-center gap-3">
                <Store className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="font-bold text-slate-800">Pay at Counter</p>
                  <p className="text-[10px] text-slate-400 font-normal">Pay cash or UPI directly when picking up</p>
                </div>
              </div>
              <input type="radio" checked={paymentMethod === 'counter'} readOnly />
            </label>

            <label
              onClick={() => setPaymentMethod('upi')}
              className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'upi'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-900 font-bold'
                  : 'border-slate-100 text-slate-600'
                }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="font-bold text-slate-800">Instant UPI QR</p>
                  <p className="text-[10px] text-slate-400 font-normal">Pay online before printing starts</p>
                </div>
              </div>
              <input type="radio" checked={paymentMethod === 'upi'} readOnly />
            </label>
          </div>

          {errorMsg && <p className="text-xs text-rose-500 font-medium">{errorMsg}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCurrentStep(4)}
              className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
            >
              Back
            </button>
            <button
              disabled={submitting}
              onClick={handleSubmitJob}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Print'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 6: REAL-TIME ORDER TRACKING                                          */}
      {/* ========================================================================= */}
      {currentStep === 6 && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" /> Order Confirmed
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-900">{shopInfo?.shopName}</h2>
            <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">
              Ref ID: #{jobId?.substring(0, 8)}
            </p>
          </div>

          <OrderTimeline currentStatus={status || 'RECEIVED'} />

          <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-900/10">
            <span className="text-xs font-medium text-slate-300">Total Payable</span>
            <span className="text-xl font-black">₹{pricingBreakdown.total}</span>
          </div>

          <button
            onClick={() => {
              setFiles([]);
              setJobId(null);
              setStatus(null);
              setCurrentStep(1);
            }}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors inline-block"
          >
            Print Another Document
          </button>
        </div>
      )}
    </div>
  );
}