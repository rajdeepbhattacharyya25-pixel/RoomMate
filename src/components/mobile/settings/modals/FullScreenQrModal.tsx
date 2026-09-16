import React from 'react';
import { QrCode, X } from 'lucide-react';
import { User } from '../../../../types';

interface FullScreenQrModalProps {
  isOpen: boolean;
  currentUser: User;
  qrUrl?: string;
  onClose: () => void;
}

export const FullScreenQrModal: React.FC<FullScreenQrModalProps> = ({
  isOpen,
  currentUser,
  qrUrl,
  onClose,
}) => {
  const activeQr = qrUrl || currentUser.upiQrUrl;
  if (!isOpen || !activeQr) return null;

  const displayUpi =
    currentUser.upiId ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem(`roommate_upi_${currentUser.id}`) : '') ||
    `${currentUser.name.toLowerCase().replace(/\s+/g, '')}@okaxis`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-qr-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          aria-label="Close QR Modal"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center active:scale-95 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="pt-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 id="fullscreen-qr-title" className="text-base font-bold text-slate-900">
            {currentUser.name}&apos;s QR Code
          </h3>
          <p className="text-xs text-slate-500">Scan with PhonePe, GPay, or Paytm</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl inline-block shadow-inner">
          <img
            src={activeQr}
            alt="Full Payment QR"
            className="w-56 h-56 object-contain rounded-xl bg-white"
          />
        </div>

        <p className="text-[11px] text-slate-500 font-mono">
          UPI ID: {displayUpi}
        </p>

        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-slate-900 text-white text-xs font-semibold active:scale-98 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
};
