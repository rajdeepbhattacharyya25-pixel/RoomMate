import React from 'react';
import { QrCode, X } from 'lucide-react';
import { User } from '../../../../types';
import { useBackButton } from '../../../../lib/native/backButton';

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

  // Dismiss fullscreen QR modal on Android hardware back button
  useBackButton(onClose, isOpen && Boolean(activeQr));

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 dark:bg-black/90 backdrop-blur-xs p-4 animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#12121A] rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl border border-slate-200/90 dark:border-[#27354A] relative animate-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          aria-label="Close QR Modal"
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-[#20202A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center active:scale-95 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="pt-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 id="fullscreen-qr-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            {currentUser.name}&apos;s QR Code
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Scan with PhonePe, GPay, or Paytm</p>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-2xl inline-block shadow-inner">
          <img
            src={activeQr}
            alt="Full Payment QR"
            className="w-56 h-56 object-contain rounded-xl bg-white p-2"
          />
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          UPI ID: {displayUpi}
        </p>

        <button
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold active:scale-98 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
};
