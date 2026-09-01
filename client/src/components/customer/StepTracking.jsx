import React from 'react';
import {
  CheckCircle2,
  Clock,
  Printer,
  Package,
  AlertCircle,
  FileText,
} from 'lucide-react';

export default function StepTracking({
  jobId,
  batchId,
  batchJobs = [],
  status = 'RECEIVED',
  shopInfo,
}) {
  const normStatus = (status || 'RECEIVED').toUpperCase();
  const isFailed = normStatus === 'FAILED';
  const referenceId = batchId || jobId || 'N/A';
  const shopName = shopInfo?.name || shopInfo?.shopName || 'Print Shop';

  const steps = [
    {
      id: 'RECEIVED',
      label: 'Received',
      desc: 'Order received by printer',
      icon: Clock,
    },
    {
      id: 'PROCESSING',
      label: 'Processing',
      desc: 'Preparing document layout',
      icon: FileText,
    },
    {
      id: 'PRINTING',
      label: 'Printing',
      desc: 'Printing your documents',
      icon: Printer,
    },
    {
      id: 'COMPLETED',
      label: 'Completed',
      desc: 'Ready for pickup',
      icon: Package,
    },
  ];

  // Determine reached count and active state based on status:
  // - RECEIVED: step 1 green
  // - PROCESSING: steps 1-2 green
  // - PRINTING: steps 1-3 green
  // - COMPLETED: all 4 green
  // - FAILED: red dot + 'Print Failed' for current step
  const getStepStatus = (index) => {
    if (isFailed) {
      if (index === 0) return { reached: true, active: false, failed: false };
      if (index === 1) return { reached: false, active: false, failed: true };
      return { reached: false, active: false, failed: false };
    }

    let reachedCount = 1;
    let activeIndex = 0;

    if (normStatus === 'RECEIVED') {
      reachedCount = 1;
      activeIndex = 0;
    } else if (normStatus === 'PROCESSING') {
      reachedCount = 2;
      activeIndex = 1;
    } else if (normStatus === 'PRINTING') {
      reachedCount = 3;
      activeIndex = 2;
    } else if (normStatus === 'COMPLETED') {
      reachedCount = 4;
      activeIndex = 3;
    }

    const reached = index < reachedCount;
    const active = index === activeIndex && normStatus !== 'COMPLETED';

    return { reached, active, failed: false };
  };

  const getJobBadgeClass = (jobStatus) => {
    const s = (jobStatus || 'QUEUED').toUpperCase();
    switch (s) {
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'PRINTING':
        return 'bg-slate-900 text-white animate-pulse';
      case 'FAILED':
        return 'bg-red-50 text-red-700 border border-red-200';
      case 'QUEUED':
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto space-y-4">
      {/* 1. Success Header */}
      {status && (
        <div className="text-center space-y-2 py-2">
          <div
            className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center transition-all ${
              isFailed
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {isFailed ? (
              <AlertCircle className="w-8 h-8 text-red-600" />
            ) : (
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            )}
          </div>
          <h1 className="text-base font-bold text-slate-900">
            {isFailed ? 'Print Order Failed' : 'Order Submitted!'}
          </h1>
          <p className="text-xs text-slate-400">
            {isFailed
              ? 'There was an issue processing your order. Please contact shop staff.'
              : 'Your documents are being processed'}
          </p>
        </div>
      )}

      {/* 2. Reference Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-1 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
          Order Reference
        </span>
        <p className="text-lg font-mono font-bold text-slate-900 select-all">
          {referenceId}
        </p>
        <p className="text-xs text-slate-400">{shopName}</p>
      </div>

      {/* 3. Status Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
        <div className="space-y-6">
          {steps.map((step, idx) => {
            const { reached, active, failed } = getStepStatus(idx);
            const isLast = idx === steps.length - 1;
            const nextStepStatus = !isLast ? getStepStatus(idx + 1) : null;
            const isLineGreen = reached && nextStepStatus?.reached;

            return (
              <div key={step.id} className="relative flex items-start gap-4">
                {/* Vertical connecting line (2px wide) */}
                {!isLast && (
                  <div
                    className={`absolute left-3.5 top-8 w-0.5 h-[calc(100%+8px)] -ml-[1px] transition-colors duration-300 ${
                      isLineGreen ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}

                {/* Status Dot */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                    failed
                      ? 'bg-red-500 text-white ring-4 ring-red-100'
                      : reached
                      ? active
                        ? 'bg-slate-900 text-white ring-4 ring-slate-100 animate-pulse'
                        : 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {failed ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : reached ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                  )}
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-sm font-bold ${
                        failed
                          ? 'text-red-600'
                          : reached
                          ? 'text-slate-900'
                          : 'text-slate-400'
                      }`}
                    >
                      {failed ? 'Print Failed' : step.label}
                    </p>
                    {active && (
                      <span className="text-[10px] font-bold text-slate-800 uppercase tracking-wide animate-pulse">
                        In Progress
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Batch Jobs List */}
      {batchJobs && batchJobs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Documents in Queue
            </h2>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {batchJobs.length} {batchJobs.length === 1 ? 'file' : 'files'}
            </span>
          </div>

          <div className="space-y-2">
            {batchJobs.map((job, idx) => (
              <div
                key={job.jobId || idx}
                className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-slate-700 shrink-0" />
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {job.originalFileName || job.fileName || `Document ${idx + 1}`}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full shrink-0 ${getJobBadgeClass(
                    job.status
                  )}`}
                >
                  {job.status || 'QUEUED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Footer note */}
      <p className="text-xs text-slate-400 text-center pt-2">
        Please collect your prints from the counter
      </p>
    </div>
  );
}
