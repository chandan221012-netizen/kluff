import React from 'react';
import { CheckCircle2, Clock, Printer, PackageCheck } from 'lucide-react';

const STEPS = [
  { key: 'RECEIVED', label: 'Order Received', icon: Clock },
  { key: 'QUEUED', label: 'In Spool Queue', icon: Clock },
  { key: 'PRINTING', label: 'Printing', icon: Printer },
  { key: 'COMPLETED', label: 'Ready for Pickup', icon: PackageCheck },
];

export default function OrderTimeline({ currentStatus }) {
  const getStepState = (stepKey) => {
    const statusOrder = ['RECEIVED', 'QUEUED', 'PRINTING', 'COMPLETED'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const stepIndex = statusOrder.indexOf(stepKey);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="space-y-4 py-2">
      {STEPS.map((step) => {
        const state = getStepState(step.key);
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                state === 'completed'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                  : state === 'active'
                  ? 'bg-indigo-600 border-indigo-600 text-white animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-300'
              }`}
            >
              {state === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <p
                className={`text-xs font-bold ${
                  state === 'completed'
                    ? 'text-emerald-700'
                    : state === 'active'
                    ? 'text-indigo-600'
                    : 'text-slate-400'
                }`}
              >
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}