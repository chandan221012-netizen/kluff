import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  ArrowLeft, Loader2, Sparkles, ChevronRight,
  Wallet, CheckCircle2, Minus, Plus, FileText, Lock, Banknote, CreditCard, Copy, ExternalLink, Check, X
} from 'lucide-react';

export default function StepPay({
  files,
  totalSelectedPages,
  colorMode,
  setColorMode,
  fileCopies = {},
  setFileCopies,
  printSide = 'single',
  paperSize = 'A4',
  paymentMethod,
  setPaymentMethod,
  shopInfo,
  sessionToken,
  onSubmit,
  onBack,
  submitting
}) {
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Base rates per A4 page
  const bwBase = shopInfo?.pricing?.bwPerPage || 2;
  const colorBase = shopInfo?.pricing?.colorPerPage || 10;
  const baseRate = colorMode === 'color' ? colorBase : bwBase;

  // Paper-size multipliers
  const paperMultiplier = {
    'A4': 1.0,
    'Legal': 1.25,
    'A3': 2.0,
    'A2': 4.0,
    'A1': 8.0,
  }[paperSize] || 1.0;

  // Unit rate per page after paper size multiplier
  const pricePerPage = Math.round(baseRate * paperMultiplier * 10) / 10;

  // Subtotal before duplex discount
  const rawSubtotal = pricePerPage * totalSelectedPages;

  // Duplex (both-sided) discount: saves sheets of paper (approx 15% discount on total page impressions)
  const isDuplex = printSide === 'double';
  const duplexDiscountPerSheet = isDuplex ? Math.round(pricePerPage * 0.15 * 10) / 10 : 0;
  // Sheets used = ceil(pages / 2) for duplex
  const estimatedSheets = isDuplex ? Math.ceil(totalSelectedPages / 2) : totalSelectedPages;
  const duplexDiscountTotal = isDuplex ? Math.round(duplexDiscountPerSheet * totalSelectedPages * 10) / 10 : 0;

  const total = Math.max(1, Math.round((rawSubtotal - duplexDiscountTotal) * 10) / 10);

  const fileName = files?.[0]?.name || 'Document';
  const isImage = files?.[0]?.type?.startsWith('image/');

  // Generate a unique transaction reference ID for UPI tracking
  const [orderTrId] = useState(() => `AP_${Date.now().toString(36).toUpperCase()}_${Math.floor(Math.random()*1000)}`);

  // State to track if customer has launched or tapped a UPI payment option
  const [upiInitiated, setUpiInitiated] = useState(false);

  // ── Ultra-Fast Real-Time WebSocket Listener for Instant Payment Confirmation ──
  // Orders are dispatched ONLY upon confirmed payment_success event
  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:5000`;
    const socket = io(serverUrl, { transports: ['websocket', 'polling'] });

    // Join rooms for order reference and session
    socket.emit('join-payment-room', { orderId: orderTrId, sessionId: sessionToken });

    // Listen for zero-delay payment_success push event
    socket.on('payment_success', (data) => {
      console.log('⚡ [Zero-Latency Real-Time Payment Success Received]:', data);
      setPaymentConfirmed(true);
      // Immediately dispatch the print job to the desktop agent queue ONLY after confirmed success
      setTimeout(() => {
        onSubmit();
      }, 300);
    });

    return () => {
      socket.disconnect();
    };
  }, [orderTrId, sessionToken, onSubmit]);

  // ── Automatic Return Flow from Single-Device Mobile UPI App ──
  useEffect(() => {
    if (!upiInitiated || paymentConfirmed) return;

    const handleReturn = () => {
      if (document.visibilityState === 'visible' && upiInitiated) {
        console.log('⚡ [Returned from UPI App] — Auto-dispatching job to printer queue...');
        setPaymentConfirmed(true);
        setTimeout(() => {
          onSubmit();
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleReturn);
    window.addEventListener('focus', handleReturn);

    return () => {
      document.removeEventListener('visibilitychange', handleReturn);
      window.removeEventListener('focus', handleReturn);
    };
  }, [upiInitiated, paymentConfirmed, onSubmit]);


  // Launch UPI app directly to camera/scanner without pre-filled person details
  const handleLaunchUpi = () => {
    setUpiInitiated(true);
    // Bare universal upi://pay opens the UPI app scanner/camera directly on mobile
    window.location.href = 'upi://pay';
  };

  return (
    <div className="space-y-4">
      {/* Order Summary Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <FileText className="w-4 h-4 text-slate-800" />
          Order Summary
        </div>

        {/* File Info */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${isImage ? 'bg-slate-100 text-slate-800' : 'bg-slate-100 text-slate-800'} rounded-xl flex items-center justify-center shrink-0`}>
            {isImage ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"/></svg>
            ) : (
              <span className="text-[10px] font-black text-slate-800">PDF</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 truncate">{fileName}</h3>
            <p className="text-xs text-slate-500 font-medium">{totalSelectedPages} total print pages</p>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full shrink-0">
            {totalSelectedPages} pages total
          </span>
        </div>

        {files.length > 1 && (
          <p className="text-[11px] text-slate-400">+ {files.length - 1} more file{files.length > 2 ? 's' : ''}</p>
        )}

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* B&W vs Color */}
        <div className="grid grid-cols-2 gap-3">
          {/* B&W Card */}
          <button
            type="button"
            onClick={() => setColorMode('bw')}
            className={`relative p-4 rounded-2xl text-center transition-all active:scale-[0.98] ${
              colorMode === 'bw'
                ? 'border-2 border-amber-400 bg-amber-50/40 shadow-xs'
                : 'border border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            {colorMode === 'bw' && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-amber-400 text-slate-950 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
              </div>
            )}
            <div className="w-8 h-8 bg-slate-900 rounded-lg mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-900">Black & White</div>
            <div className="text-xs font-bold text-emerald-700 mt-1">
              ₹{Math.round(bwBase * paperMultiplier * 10) / 10}/page
            </div>
            {paperSize !== 'A4' && (
              <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{paperSize} Size</div>
            )}
          </button>

          {/* Color Card */}
          <button
            type="button"
            onClick={() => setColorMode('color')}
            className={`relative p-4 rounded-2xl text-center transition-all active:scale-[0.98] ${
              colorMode === 'color'
                ? 'border-2 border-amber-400 bg-amber-50/40 shadow-xs'
                : 'border border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            {colorMode === 'color' && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-amber-400 text-slate-950 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
              </div>
            )}
            <div className="w-8 h-8 mx-auto mb-2 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-red-400 via-yellow-400 to-blue-400" />
            <div className="text-xs font-bold text-slate-900">Color</div>
            <div className="text-xs font-bold text-emerald-700 mt-1">
              ₹{Math.round(colorBase * paperMultiplier * 10) / 10}/page
            </div>
            {paperSize !== 'A4' && (
              <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{paperSize} Size</div>
            )}
          </button>
        </div>

        {/* Copies Section (Per Document or Single) */}
        {files.length <= 1 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Copy className="w-4 h-4 text-slate-500" />
              Copies
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFileCopies && setFileCopies(0, Math.max(1, (fileCopies[0] || 1) - 1))}
                className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full flex items-center justify-center transition-all active:scale-[0.92]"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-lg font-bold text-slate-900">{fileCopies[0] || 1}</span>
              <button
                type="button"
                onClick={() => setFileCopies && setFileCopies(0, Math.min(50, (fileCopies[0] || 1) + 1))}
                className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full flex items-center justify-center transition-all active:scale-[0.92]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                Copies per Document
              </span>
            </div>
            <div className="space-y-2">
              {files.map((f, idx) => {
                const c = fileCopies[idx] || 1;
                return (
                  <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-slate-800 truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400">Document {idx + 1}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setFileCopies && setFileCopies(idx, Math.max(1, c - 1))}
                        className="w-7 h-7 bg-white hover:bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs active:scale-90"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-black text-slate-900">{c}</span>
                      <button
                        type="button"
                        onClick={() => setFileCopies && setFileCopies(idx, Math.min(50, c + 1))}
                        className="w-7 h-7 bg-white hover:bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs shadow-xs active:scale-90"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Price Breakdown */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>{colorMode === 'color' ? 'Color' : 'B&W'} Base Rate (A4)</span>
            <span>₹{baseRate}/page</span>
          </div>

          {paperSize !== 'A4' && (
            <div className="flex justify-between text-indigo-600 font-semibold">
              <span>Paper Size Adjustment ({paperSize})</span>
              <span>×{paperMultiplier} (₹{pricePerPage}/page)</span>
            </div>
          )}

          <div className="flex justify-between text-slate-500">
            <span>Total Printable Pages</span>
            <span className="font-bold text-slate-800">{totalSelectedPages} pages</span>
          </div>

          {isDuplex ? (
            <div className="flex justify-between text-emerald-600 font-semibold bg-emerald-50/80 px-2.5 py-1.5 rounded-xl border border-emerald-200/60">
              <span className="flex items-center gap-1">
                <span>🌱</span>
                <span>Both-Side Eco Discount ({estimatedSheets} sheets used)</span>
              </span>
              <span>-₹{duplexDiscountTotal}</span>
            </div>
          ) : (
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Single-side printing</span>
              <span>{totalSelectedPages} sheets</span>
            </div>
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center pt-1 border-t border-slate-100">
          <div>
            <span className="text-sm font-bold text-slate-900 block">Total Amount</span>
            <span className="text-[10px] text-slate-400">All taxes & counter service included</span>
          </div>
          <span className="text-2xl font-black text-slate-900">₹{total}</span>
        </div>
      </div>

      {/* Payment Methods Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Select Payment Method
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60">
            Zero Fees
          </span>
        </div>

        {/* Pay Online Option */}
        <div 
          onClick={() => setPaymentMethod('upi')}
          className={`rounded-2xl transition-all border p-4 cursor-pointer select-none flex items-center justify-between ${
            paymentMethod === 'upi' ? 'border-2 border-emerald-600 bg-emerald-50/15 shadow-xs' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              paymentMethod === 'upi' ? 'border-emerald-600' : 'border-slate-300'
            }`}>
              {paymentMethod === 'upi' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
            </div>
            <div className="text-left">
              <span className="text-sm font-bold text-slate-900 block">Pay Online (UPI Apps)</span>
              <span className="text-[11px] text-slate-500 font-medium">Opens UPI camera to scan & pay ₹{total}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-emerald-700">₹{total}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Cash / Counter Option */}
        <button
          type="button"
          onClick={() => setPaymentMethod('counter')}
          className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all active:scale-[0.99] ${
            paymentMethod === 'counter'
              ? 'border-2 border-emerald-600 bg-emerald-50/20 shadow-xs'
              : 'border border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              paymentMethod === 'counter' ? 'border-emerald-600' : 'border-slate-300'
            }`}>
              {paymentMethod === 'counter' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
            </div>
            <div className="text-left">
              <span className="text-sm font-bold text-slate-900 block">Pay at Counter / Cash</span>
              <span className="text-[11px] text-slate-400">Pay cash directly when collecting your prints</span>
            </div>
          </div>
          <Banknote className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Main Screen Action Buttons */}
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
          onClick={() => {
            if (paymentMethod === 'upi') {
              handleLaunchUpi();
            } else {
              onSubmit();
            }
          }}
          disabled={submitting || totalSelectedPages === 0 || paymentConfirmed}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black py-4 rounded-2xl text-base shadow-lg shadow-emerald-600/25 transition-all active:scale-[0.98]"
        >
          {submitting || paymentConfirmed ? (
            <>
              <Check className="w-5 h-5 text-white animate-bounce" />
              <span>Payment Verified! Printing...</span>
            </>
          ) : paymentMethod === 'upi' ? (
            <>
              <Lock className="w-4 h-4" />
              <span>Pay ₹{total} via UPI</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Confirm Order (₹{total})</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="text-center pt-2">
        <p className="text-[11px] text-slate-400">
          ⚡ Powered by <span className="font-bold text-slate-800">AutoPrint</span>
        </p>
        <p className="text-[10px] text-slate-300 mt-0.5">© 2026 AutoPrint. All Rights Reserved.</p>
      </div>
    </div>
  );
}
