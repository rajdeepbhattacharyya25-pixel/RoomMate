import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { hapticImpact } from '../../lib/native/haptics';
import { registerBackButtonHandler } from '../../lib/native/backButton';

export interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string; // e.g. '92vh', '88vh'
  showCloseButton?: boolean;
  showHandle?: boolean;
  className?: string;
  contentClassName?: string;
  headerRight?: React.ReactNode;
}

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  subtitle,
  children,
  maxHeight = '90vh',
  showCloseButton = true,
  showHandle = true,
  className = '',
  contentClassName = '',
  headerRight,
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const currentDrag = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Synchronize rendering and visibility when parent toggles `isOpen`
  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsRendered(true);
      setDragOffset(0);

      // Start off-screen (isVisible: false -> translateY(100%)), then animate up to translateY(0)
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          setIsVisible(true);
        });
        openRafRef.current = r2;
      });
      openRafRef.current = r1;
    } else {
      // Parent set isOpen to false -> animate down and unmount
      if (openRafRef.current) {
        cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }
      setIsVisible(false);
      closeTimerRef.current = setTimeout(() => {
        setIsRendered(false);
        setDragOffset(0);
      }, 260);
    }

    return () => {
      if (openRafRef.current) cancelAnimationFrame(openRafRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen]);

  // Animated close sequence: slide down -> notify parent via onClose callback
  const handleInternalClose = useCallback(() => {
    hapticImpact('LIGHT');
    setIsVisible(false);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsRendered(false);
      setDragOffset(0);
      onCloseRef.current();
    }, 260);
  }, []);

  // Register Android Hardware Back Button / gesture listener while open and visible
  useEffect(() => {
    if (!isRendered || !isVisible) return;

    const unregister = registerBackButtonHandler(() => {
      handleInternalClose();
      return true; // Consumed
    });

    return () => {
      unregister();
    };
  }, [isRendered, isVisible, handleInternalClose]);

  // Prevent background scroll while modal is rendered
  useEffect(() => {
    if (isRendered) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isRendered]);

  // Touch handlers for drag-to-dismiss gesture on header / drag bar
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
    currentDrag.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartY.current) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (deltaY > 0) {
      // Dragging downwards
      currentDrag.current = deltaY;
      setDragOffset(deltaY);
    } else {
      // Rubber-banding when pulling upward
      const resistance = deltaY * 0.2;
      currentDrag.current = resistance;
      setDragOffset(resistance);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const touchDuration = Date.now() - touchStartTime.current;
    const velocity = currentDrag.current / Math.max(touchDuration, 1);

    // Dismiss if dragged down more than 75px or flicked downwards with high velocity
    if (currentDrag.current > 75 || (currentDrag.current > 35 && velocity > 0.45)) {
      handleInternalClose();
    } else {
      // Snap back up
      setDragOffset(0);
      currentDrag.current = 0;
    }
    touchStartY.current = 0;
  };

  if (!isRendered) return null;

  const backdropOpacity = !isVisible
    ? 0
    : dragOffset > 0
    ? Math.max(0.15, 1 - dragOffset / 320)
    : 1;

  const sheetTransform = !isVisible
    ? 'translateY(100%)'
    : dragOffset !== 0
    ? `translateY(${Math.max(0, dragOffset)}px)`
    : 'translateY(0)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed md:absolute inset-0 z-50 flex items-end justify-center select-none"
    >
      {/* Dimmed Backdrop with fade in/out animation; clicking outside triggers animated close */}
      <div
        onClick={handleInternalClose}
        style={{
          opacity: backdropOpacity,
        }}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity duration-250 ease-out"
        aria-label="Close sheet overlay"
      />

      {/* Native Bottom Sheet Card */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight,
          transform: sheetTransform,
          transition: isDragging
            ? 'none'
            : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease-out',
          // Generous safe-area padding at the bottom so it never merges with Android's 3-button navigation bar
          paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 20px), 56px)',
        }}
        className={`relative z-10 w-full max-w-[420px] bg-white border-t border-slate-200/90 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)] flex flex-col overflow-hidden will-change-transform ${className}`}
      >
        {/* Swipe / Drag Zone (Touch-to-dismiss handle) */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none flex flex-col items-center justify-center shrink-0"
        >
          {showHandle && (
            <div className="w-12 h-1.5 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          )}

          {/* Optional Header Row (Title, Icon, Close button) inside drag zone */}
          {(title || icon || showCloseButton || headerRight) && (
            <div className="w-full px-5 pt-2.5 pb-1 flex items-center justify-between">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                {icon && (
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs border border-indigo-100/80">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  {typeof title === 'string' ? (
                    <h2 className="text-sm font-bold text-slate-900 truncate tracking-tight">{title}</h2>
                  ) : (
                    title
                  )}
                  {subtitle && (
                    <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {headerRight}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={handleInternalClose}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
                    aria-label="Close dialog"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content Container */}
        <div className={`px-5 pt-1 overflow-y-auto overscroll-contain flex-1 ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
