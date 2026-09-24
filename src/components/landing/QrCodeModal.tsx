import React, { useState } from 'react';
import { X, Copy, Check, Download, ExternalLink, Smartphone } from 'lucide-react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const downloadTargetUrl = 'https://roommate26.vercel.app/?action=download';

  const handleCopy = () => {
    navigator.clipboard.writeText(downloadTargetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveQrImage = () => {
    const link = document.createElement('a');
    link.href = '/RoomMate-Scan-To-Download-QR.png';
    link.download = 'RoomMate-Scan-To-Download-QR.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-charcoal/40 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-white border border-brand-border shadow-2xl p-6 text-center overflow-hidden"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-brand-slate hover:text-brand-charcoal hover:bg-brand-soft transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header App Identity */}
        <img
          src="/logo.png"
          alt="RoomMate"
          className="w-12 h-12 rounded-2xl object-contain shadow-xs border border-brand-border bg-white p-1 mx-auto mb-2"
        />

        <h3 className="text-lg font-bold text-brand-charcoal">Scan to Download</h3>
        <p className="text-xs text-brand-slate mt-0.5 mb-4">
          Point your phone camera to open RoomMate and download the APK automatically.
        </p>

        {/* Scannable Real QR Graphic Container */}
        <div className="relative p-2.5 rounded-2xl bg-brand-surface border border-brand-border inline-block mx-auto mb-3 shadow-inner">
          <img
            src="/RoomMate-Scan-To-Download-QR.png"
            alt="RoomMate Scan to Download QR Code"
            className="w-56 h-auto max-h-72 rounded-xl object-contain mx-auto shadow-xs border border-brand-border/60 bg-white"
          />
        </div>

        {/* Build Specs Pill */}
        <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-surface border border-brand-border text-[11px] font-medium text-brand-slate">
          <Smartphone className="w-3.5 h-3.5 text-brand" />
          <span>v1.0.4 (Build 10) • Staging Release • 7.29 MB</span>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              type="button"
              className="flex-1 py-2.5 bg-brand-surface hover:bg-brand-soft text-brand-charcoal rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-brand-border cursor-pointer active:scale-95"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Link!' : 'Copy Link'}</span>
            </button>

            <button
              onClick={handleSaveQrImage}
              type="button"
              className="flex-1 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save QR Image</span>
            </button>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-full py-2 text-xs font-semibold text-brand-slate hover:text-brand-charcoal transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
