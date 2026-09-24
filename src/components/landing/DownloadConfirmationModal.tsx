import React, { useState, useEffect } from 'react';
import { X, Download, ShieldCheck, CheckCircle2, Smartphone, AlertCircle, HelpCircle } from 'lucide-react';

interface DownloadConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  onOpenGuide: () => void;
}

export const DownloadConfirmationModal: React.FC<DownloadConfirmationModalProps> = ({
  isOpen,
  onClose,
  onDownload,
  onOpenGuide,
}) => {
  const [countdown, setCountdown] = useState<number>(3);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [downloadStarted, setDownloadStarted] = useState<boolean>(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCountdown(3);
      setIsPaused(false);
      setDownloadStarted(false);
    }
  }, [isOpen]);

  // Countdown timer effect
  useEffect(() => {
    if (!isOpen || isPaused || downloadStarted) return;

    if (countdown <= 0) {
      setDownloadStarted(true);
      onDownload();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, isPaused, countdown, downloadStarted, onDownload]);

  if (!isOpen) return null;

  const handleManualDownload = () => {
    setDownloadStarted(true);
    setIsPaused(true);
    onDownload();
  };

  const handlePauseOrCancel = () => {
    setIsPaused(true);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-charcoal/50 backdrop-blur-md animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl bg-white border border-brand-border shadow-2xl p-6 text-center overflow-hidden"
      >
        {/* Subtle Ambient Brand Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-brand/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-brand-slate hover:text-brand-charcoal hover:bg-brand-soft transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand App Icon & Verified Badge */}
        <div className="relative inline-block mx-auto mb-3">
          <img
            src="/logo.png"
            alt="RoomMate"
            className="w-16 h-16 rounded-2xl object-contain shadow-md border border-brand-border bg-white p-1"
          />
          <div className="absolute -bottom-1.5 -right-1.5 bg-emerald-600 text-white rounded-full p-1 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <h3 className="text-xl font-black text-brand-charcoal tracking-tight">
          Download RoomMate Android App
        </h3>
        <p className="text-xs text-brand-slate mt-1 mb-4">
          Direct APK from verified staging release
        </p>

        {/* Build Metadata Card */}
        <div className="bg-brand-surface rounded-2xl p-3.5 border border-brand-border/80 text-left mb-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-brand-slate font-medium flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-brand" /> Version
            </span>
            <span className="font-bold text-brand-charcoal">v1.0.4 • Build 10</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-brand-slate font-medium flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-brand" /> File Size
            </span>
            <span className="font-bold text-brand-charcoal">7.29 MB (Android APK)</span>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-brand-border/50">
            <span className="text-brand-slate font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Security Check
            </span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 text-[11px]">
              100% Virus-Free & Safe
            </span>
          </div>
        </div>

        {/* Countdown or Download Started Banner */}
        {downloadStarted ? (
          <div className="mb-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 text-left">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900">Download initiated!</p>
              <p className="text-[11px] text-emerald-700">Check your phone's notification bar or download manager.</p>
            </div>
          </div>
        ) : (
          <div className="mb-5 p-3 rounded-2xl bg-brand-soft/60 border border-brand/20 text-brand-charcoal text-xs">
            {!isPaused ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-brand">Starting automatically in...</span>
                  <span className="text-base font-black text-brand bg-white px-2 py-0.5 rounded-lg border border-brand/30 shadow-xs">
                    {countdown}s
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-white rounded-full h-1.5 overflow-hidden border border-brand/20">
                  <div
                    className="bg-brand h-full transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${(countdown / 3) * 100}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePauseOrCancel}
                  className="text-[11px] text-brand-slate hover:text-brand-charcoal underline cursor-pointer"
                >
                  Pause countdown
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-brand-slate">
                <span>Countdown paused. Tap below to start.</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleManualDownload}
            type="button"
            className="w-full py-3 bg-brand hover:bg-brand-dark text-white rounded-2xl text-sm font-bold shadow-md shadow-brand/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>{downloadStarted ? 'Download Again' : 'Download APK Now'}</span>
          </button>

          <button
            onClick={onClose}
            type="button"
            className="w-full py-2.5 bg-brand-surface hover:bg-brand-soft text-brand-slate hover:text-brand-charcoal rounded-2xl text-xs font-semibold transition-colors cursor-pointer"
          >
            {downloadStarted ? 'Close' : 'Cancel & Browse Features'}
          </button>
        </div>

        {/* Sideload Guide Trigger */}
        <div className="mt-4 pt-3 border-t border-brand-border/60">
          <button
            onClick={() => {
              onClose();
              onOpenGuide();
            }}
            type="button"
            className="text-[11px] text-brand font-bold hover:underline flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How to install APK on Android (Guide)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
