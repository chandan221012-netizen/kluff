import React from 'react';
import { Check } from 'lucide-react';

const STEPS = ['Upload', 'Edit', 'Preview', 'Pay'];

export default function ProgressBar({ currentStep = 1 }) {
  return (
    <div className="w-full px-2 py-2">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const isReached = stepNumber <= currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <React.Fragment key={step}>
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 flex items-center justify-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isReached
                        ? 'bg-amber-400 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isReached ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      stepNumber
                    )}
                  </div>
                </div>
                <span
                  className={`text-[11px] mt-1 whitespace-nowrap font-semibold transition-colors ${
                    isCurrent
                      ? 'text-slate-900 font-bold'
                      : isReached
                      ? 'text-slate-800'
                      : 'text-slate-400'
                  }`}
                >
                  {step}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 self-start mt-[15px] transition-colors ${
                    index < currentStep - 1 ? 'bg-amber-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
