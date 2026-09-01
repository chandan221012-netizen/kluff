import React, { useRef, useState, useCallback, useEffect } from 'react';

/**
 * SafeSlider: A touch-resilient slider that prevents accidental jumps when
 * scrolling or rolling the mobile screen.
 * 
 * Behavior:
 * - Tapping or touching discrete points on the track does NOT alter the value.
 * - Value ONLY changes when the user actively drags horizontally past a threshold.
 * - Vertical scrolling gestures are passed through without altering the slider.
 */
export default function SafeSlider({
  min = 0,
  max = 100,
  step = 1,
  value = 50,
  onChange,
  accentColor = 'emerald', // 'emerald' | 'amber' | 'indigo'
  className = ''
}) {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const touchStateRef = useRef({
    startX: 0,
    startY: 0,
    startVal: value,
    hasMovedPastThreshold: false,
    isVerticalScroll: false
  });

  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  // Color schemes
  const colorMap = {
    emerald: {
      bar: 'bg-emerald-500',
      thumb: 'border-emerald-500 ring-emerald-400/20'
    },
    amber: {
      bar: 'bg-amber-500',
      thumb: 'border-amber-500 ring-amber-400/20'
    },
    indigo: {
      bar: 'bg-indigo-500',
      thumb: 'border-indigo-500 ring-indigo-400/20'
    }
  };

  const colors = colorMap[accentColor] || colorMap.emerald;

  const calculateValueFromPointer = useCallback((clientX) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const rawPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawVal = min + rawPct * (max - min);
    const steppedVal = step ? Math.round(rawVal / step) * step : rawVal;
    return Math.max(min, Math.min(max, steppedVal));
  }, [min, max, step, value]);

  // Touch Handlers
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startVal: value,
      hasMovedPastThreshold: false,
      isVerticalScroll: false
    };
    // Do NOT alter value on initial touch down (prevents tap jumping)
  };

  const handleTouchMove = (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStateRef.current.startX;
    const dy = touch.clientY - touchStateRef.current.startY;

    // Check if movement is primarily vertical (scrolling page)
    if (!touchStateRef.current.hasMovedPastThreshold) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) {
        touchStateRef.current.isVerticalScroll = true;
        return; // Let browser scroll naturally
      }
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        touchStateRef.current.hasMovedPastThreshold = true;
        setIsDragging(true);
      }
    }

    if (touchStateRef.current.hasMovedPastThreshold && !touchStateRef.current.isVerticalScroll) {
      if (e.cancelable) e.preventDefault();
      const newVal = calculateValueFromPointer(touch.clientX);
      if (onChange) onChange(newVal);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStateRef.current.hasMovedPastThreshold = false;
    touchStateRef.current.isVerticalScroll = false;
  };

  // Mouse Handlers (Desktop)
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    let hasMoved = false;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      if (Math.abs(dx) > 3) {
        hasMoved = true;
        setIsDragging(true);
      }
      if (hasMoved) {
        const newVal = calculateValueFromPointer(moveEvent.clientX);
        if (onChange) onChange(newVal);
      }
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      ref={trackRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      className={`relative w-full h-8 flex items-center cursor-pointer select-none touch-pan-y ${className}`}
    >
      {/* Background Track Rail */}
      <div className="relative w-full h-2.5 bg-slate-200/90 rounded-full overflow-hidden">
        {/* Filled Progress Bar */}
        <div
          className={`h-full ${colors.bar} rounded-full transition-all duration-75`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Draggable Slider Thumb */}
      <div
        style={{ left: `${percentage}%` }}
        className={`absolute -translate-x-1/2 w-6 h-6 bg-white rounded-full border-[3px] ${colors.thumb} shadow-md flex items-center justify-center transition-transform ${
          isDragging ? 'scale-125 ring-4' : 'hover:scale-110'
        }`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${colors.bar}`} />
      </div>
    </div>
  );
}
