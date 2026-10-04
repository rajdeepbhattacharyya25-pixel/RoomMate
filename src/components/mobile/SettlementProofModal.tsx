import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  SettlementReceiptData,
  formatWhatsAppSettlementReceipt,
  downloadSettlementVoucherImage,
} from '../../lib/payments/upiIntentService';
import { hapticSuccess, hapticSelection } from '../../lib/native/haptics';
import { useBackButton } from '../../lib/native/backButton';
import {
  X,
  Share2,
  Download,
  Check,
  CheckCheck,
  Copy,
  ShieldCheck,
  Building2,
  Calendar,
  Hash,
  CreditCard,
  MessageCircle,
} from 'lucide-react';

interface SettlementProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptData: SettlementReceiptData | null;
  onDone: () => void;
}

export const SettlementProofModal: React.FC<SettlementProofModalProps> = ({
  isOpen,
  onClose,
  receiptData,
  onDone,
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Close receipt voucher on Android hardware back button
  useBackButton(onClose, isOpen && Boolean(receiptData));

  useEffect(() => {
    if (isOpen && receiptData) {
      hapticSuccess();
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.65 },
          colors: ['#10B981', '#6366F1', '#3B82F6', '#F59E0B'],
        });
      } catch {
        // Ignore in environments without canvas support
      }
    }
  }, [isOpen, receiptData]);

  if (!isOpen || !receiptData) return null;

  const dateDisplay =
    receiptData.dateStr ||
    new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formattedWhatsAppText = formatWhatsAppSettlementReceipt({
    ...receiptData,
    dateStr: dateDisplay,
  });

  const handleShareWhatsApp = () => {
    hapticSelection();
    const encoded = encodeURIComponent(formattedWhatsAppText);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  const handleCopyReceiptText = async () => {
    try {
      await navigator.clipboard.writeText(formattedWhatsAppText);
      await hapticSelection();
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleDownloadCard = async () => {
    await hapticSelection();
    setDownloading(true);
    try {
      downloadSettlementVoucherImage({
        ...receiptData,
        dateStr: dateDisplay,
      });
    } catch (err) {
      console.warn('Failed to download voucher card:', err);
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[375px] bg-slate-900 dark:bg-[#12121A] border border-white/15 dark:border-[#27354A] rounded-3xl p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto text-white animate-in zoom-in-95"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Verified Settlement
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Digital Proof Voucher Card (Aesthetic Preview) */}
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-800/90 to-indigo-950/90 dark:from-[#1C1C25] dark:to-[#161622] border border-white/15 dark:border-[#27354A] p-4 space-y-3.5 shadow-inner overflow-hidden">
          {/* Subtle Top Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-indigo-500 to-blue-500" />

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-400">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Payment recorded</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Settled</span>
          </div>

          {/* Big Amount */}
          <div className="text-center py-2">
            <div className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
              ₹{receiptData.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-emerald-300 font-semibold mt-1">
              You paid {receiptData.payeeName}.
            </p>
            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
              Your balance with {receiptData.payeeName} is now settled.
            </p>
          </div>

          {/* Resident Flow (Payer -> Payee) */}
          <div className="p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
                {receiptData.payerName.charAt(0)}
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Paid by</div>
                <div className="font-bold text-white leading-tight truncate max-w-[90px]">
                  {receiptData.payerName}
                </div>
              </div>
            </div>

            <div className="text-slate-500 font-mono text-sm font-bold">➔</div>

            <div className="flex items-center space-x-2 text-right">
              <div>
                <div className="text-[11px] text-slate-400">Paid to</div>
                <div className="font-bold text-white leading-tight truncate max-w-[90px]">
                  {receiptData.payeeName}
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-[11px] font-bold">
                {receiptData.payeeName.charAt(0)}
              </div>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="space-y-1.5 text-[11px] text-slate-300 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                <span>Flat / Room:</span>
              </span>
              <span className="font-semibold text-white truncate max-w-[170px]">
                {receiptData.roomName}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <CreditCard className="w-3 h-3" />
                <span>Recipient:</span>
              </span>
              <span className="font-mono text-slate-200">{receiptData.payeeUpiId}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                <span>Reference:</span>
              </span>
              <span className="font-mono text-indigo-300 font-semibold truncate max-w-[170px]">
                {receiptData.transactionRef}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Timestamp:</span>
              </span>
              <span className="text-slate-300">{dateDisplay}</span>
            </div>
          </div>

          {/* Clear confirmation seal */}
          <div className="pt-2 border-t border-white/10 text-center">
            <p className="text-[11px] text-emerald-400 font-medium">
              ✓ Payment recorded · Balance updated
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {/* Share to Flat WhatsApp Group */}
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 active:scale-98 transition-all"
          >
            <MessageCircle className="w-4 h-4 fill-white text-emerald-600" />
            <span>Share to Flat WhatsApp Group</span>
            <Share2 className="w-3.5 h-3.5 ml-0.5 opacity-80" />
          </button>

          {/* Row of Secondary Actions: Download PNG & Copy Text */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadCard}
              disabled={downloading}
              className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 border border-white/10 active:scale-97 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Saving...' : 'Save PNG'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyReceiptText}
              className="h-11 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 border border-white/10 active:scale-97 transition-all"
            >
              {copiedText ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Text</span>
                </>
              )}
            </button>
          </div>

          {/* Done & Return */}
          <div className="pt-1">
            <button
              type="button"
              onClick={onDone}
              className="w-full h-11 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
