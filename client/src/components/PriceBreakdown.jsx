import React from 'react';

export default function PriceBreakdown({ printingCost, paperCost, finishingCost, serviceFee, total }) {
  return (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
      <div className="flex justify-between text-slate-500">
        <span>Printing</span>
        <span className="font-semibold text-slate-700">₹{printingCost}</span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Paper Surcharge</span>
        <span className="font-semibold text-slate-700">₹{paperCost}</span>
      </div>
      {finishingCost > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>Finishing & Binding</span>
          <span className="font-semibold text-slate-700">₹{finishingCost}</span>
        </div>
      )}
      <div className="flex justify-between text-slate-500 pb-2 border-b border-slate-200">
        <span>Platform & Queue Fee</span>
        <span className="font-semibold text-slate-700">₹{serviceFee}</span>
      </div>
      <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
        <span>Total Amount</span>
        <span className="text-indigo-600">₹{total}</span>
      </div>
    </div>
  );
}