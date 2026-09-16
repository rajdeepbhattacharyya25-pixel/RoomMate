import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://roommate.app';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-charcoal/40 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-white border border-brand-border shadow-2xl p-6 text-center"
      >
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-brand-slate hover:text-brand-charcoal hover:bg-brand-soft transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <img
          src="/logo.png"
          alt="RoomMate"
          className="w-14 h-14 rounded-2xl object-contain shadow-xs border border-brand-border bg-white p-1 mx-auto mb-3"
        />

        <h3 className="text-base font-bold text-brand-charcoal">Scan with Phone Camera</h3>
        <p className="text-xs text-brand-slate mt-1 mb-5">
          Scan to open RoomMate instantly on your mobile browser or download the APK.
        </p>

        {/* Crisp Stylized QR Visual with Centered Emblem */}
        <div className="relative p-4 rounded-2xl bg-brand-surface border border-brand-border inline-block mx-auto mb-5">
          <svg className="w-44 h-44 mx-auto" viewBox="0 0 100 100" fill="currentColor">
            {/* Corner square 1 */}
            <rect x="10" y="10" width="26" height="26" rx="4" fill="#0C6B70" />
            <rect x="14" y="14" width="18" height="18" rx="2" fill="#FFFFFF" />
            <rect x="18" y="18" width="10" height="10" rx="1" fill="#0C6B70" />

            {/* Corner square 2 */}
            <rect x="64" y="10" width="26" height="26" rx="4" fill="#0C6B70" />
            <rect x="68" y="14" width="18" height="18" rx="2" fill="#FFFFFF" />
            <rect x="72" y="18" width="10" height="10" rx="1" fill="#0C6B70" />

            {/* Corner square 3 */}
            <rect x="10" y="64" width="26" height="26" rx="4" fill="#0C6B70" />
            <rect x="14" y="68" width="18" height="18" rx="2" fill="#FFFFFF" />
            <rect x="18" y="72" width="10" height="10" rx="1" fill="#0C6B70" />

            {/* Micro Pattern Dots */}
            <rect x="42" y="12" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="52" y="12" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="42" y="24" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="52" y="24" width="6" height="6" rx="1" fill="#0C6B70" />

            <rect x="12" y="42" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="24" y="42" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="12" y="52" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="24" y="52" width="6" height="6" rx="1" fill="#0C6B70" />

            <rect x="44" y="44" width="12" height="12" rx="2" fill="#0C6B70" />
            <rect x="62" y="44" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="74" y="44" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="62" y="56" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="74" y="56" width="6" height="6" rx="1" fill="#0C6B70" />

            <rect x="44" y="64" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="54" y="64" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="44" y="76" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="54" y="76" width="6" height="6" rx="1" fill="#0C6B70" />
            <rect x="66" y="72" width="10" height="10" rx="1" fill="#0C6B70" />
            <rect x="80" y="72" width="10" height="10" rx="1" fill="#0C6B70" />
          </svg>
          {/* Centered Brand Emblem */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="p-1 bg-white rounded-xl shadow-xs border border-brand-border">
              <img src="/logo.png" alt="RoomMate" className="w-7 h-7 rounded-lg object-contain" />
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            type="button"
            className="flex-1 py-2.5 bg-brand-surface hover:bg-brand-soft text-brand-charcoal rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-brand-border cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy URL'}</span>
          </button>
          <button
            onClick={onClose}
            type="button"
            className="flex-1 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
