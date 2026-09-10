import React, { useState, useMemo } from 'react';
import { User } from '../../types';
import {
  NudgeTone,
  generateUpiDeepLink,
  formatNudgeMessage,
  generateWhatsAppUrl,
  generateUpiQrCodeUrl,
} from '../../lib/ledger/nudgeService';
import { hapticSelection, hapticSuccess, hapticImpact } from '../../lib/native/haptics';
import { sendLocalNudgeNotification } from '../../lib/native/notifications';
import {
  X,
  QrCode,
  Copy,
  Check,
  CheckCheck,
  ShieldCheck,
  Edit2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface WhatsAppNudgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  debtorUser: User;
  roomName: string;
  totalAmount: number;
  items?: Array<{ title: string; shareAmount: number }>;
  onRecordSettlement: (amount: number, method: 'UPI') => void;
}

export const WhatsAppNudgeModal: React.FC<WhatsAppNudgeModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  debtorUser,
  roomName,
  totalAmount,
  items,
  onRecordSettlement,
}) => {
  const [tone, setTone] = useState<NudgeTone>('casual');
  const [receivingUpiId, setReceivingUpiId] = useState(
    () => `${currentUser.name.toLowerCase().replace(/\s+/g, '')}@okaxis`
  );
  const [isEditingUpi, setIsEditingUpi] = useState(false);
  const [tempUpiInput, setTempUpiInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [settleSuccess, setSettleSuccess] = useState(false);

  // Generate UPI Deep Link
  const upiDeepLink = useMemo(() => {
    return generateUpiDeepLink({
      pa: receivingUpiId,
      pn: currentUser.name,
      am: totalAmount,
      tn: `${roomName.replace(/\s+/g, '_')}_Split`,
    });
  }, [receivingUpiId, currentUser.name, totalAmount, roomName]);

  // Generate Formatted Message
  const formattedMessage = useMemo(() => {
    return formatNudgeMessage(
      {
        debtorName: debtorUser.name,
        debtorPhone: debtorUser.phone,
        creditorName: currentUser.name,
        creditorUpiId: receivingUpiId,
        roomName,
        totalAmount,
        items,
        tone,
      },
      upiDeepLink
    );
  }, [debtorUser.name, debtorUser.phone, currentUser.name, receivingUpiId, roomName, totalAmount, items, tone, upiDeepLink]);

  // WhatsApp Universal URL
  const whatsAppUrl = useMemo(() => {
    return generateWhatsAppUrl(debtorUser.phone, formattedMessage);
  }, [debtorUser.phone, formattedMessage]);

  // In-person QR code URL
  const upiQrCodeUrl = useMemo(() => {
    return generateUpiQrCodeUrl(upiDeepLink, 280);
  }, [upiDeepLink]);

  if (!isOpen) return null;

  // Handle Copy to Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(formattedMessage);
    setCopied(true);
    hapticSuccess();
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Direct Settlement
  const handleDirectSettle = () => {
    onRecordSettlement(totalAmount, 'UPI');
    setSettleSuccess(true);
    hapticSuccess();
    setTimeout(() => {
      setSettleSuccess(false);
      onClose();
    }, 1200);
  };

  const handleStartEditUpi = () => {
    setTempUpiInput(receivingUpiId);
    setIsEditingUpi(true);
  };

  const handleSaveUpi = () => {
    if (tempUpiInput.trim()) {
      setReceivingUpiId(tempUpiInput.trim());
    }
    setIsEditingUpi(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center animate-in fade-in duration-200 select-none">
      {/* iOS Bottom Sheet (Modal Sheet matching Stitch Screen 5246a26fb2574ff4ab8203d8ce723563) */}
      <div className="w-full max-w-[395px] bg-white text-slate-900 border-t border-slate-200/80 rounded-t-[32px] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
        
        {/* iOS Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Sheet Header Bar */}
        <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">WhatsApp Nudge Studio</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                Direct UPI
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">{roomName} • Quick Collect</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-transform active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Sheet Content */}
        <div className="overflow-y-auto px-4 py-3 space-y-3.5 flex-1">
          
          {/* 1. Roommate Debt Banner */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/70 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Avatar with Verified Roommate Badge */}
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white flex items-center justify-center font-bold text-base shadow-sm">
                    {debtorUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-xs"
                    title="Verified Roommate"
                  >
                    <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-semibold text-slate-900">{debtorUser.name}</span>
                    <span className="text-[11px] text-slate-500 font-medium">({debtorUser.phone || 'Room 302'})</span>
                  </div>
                  <div className="flex items-center text-[11px] font-medium text-emerald-600 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                    Verified Flatmate
                  </div>
                </div>
              </div>

              {/* Outstanding Balance Display */}
              <div className="text-right">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Balance</span>
                <div className="text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 inline-block font-mono">
                  Owes ₹{totalAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Split Breakdown Mini Chips */}
            {items && items.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-medium text-slate-400 mr-0.5">Split Items:</span>
                {items.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-slate-200 text-xs text-slate-700 shadow-2xs"
                  >
                    <span className="mr-1">{idx % 2 === 0 ? '📶' : '🛒'}</span>
                    <span>{item.title}:</span>
                    <strong className="ml-1 text-slate-900 font-semibold font-mono">
                      ₹{item.shareAmount.toFixed(2)}
                    </strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 2. Receiving UPI ID Card */}
          <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between shadow-2xs">
            <div className="flex items-center space-x-2.5 overflow-hidden flex-1 mr-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="truncate flex-1">
                {isEditingUpi ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={tempUpiInput}
                      onChange={(e) => setTempUpiInput(e.target.value)}
                      placeholder="username@okaxis"
                      className="h-7 px-2 bg-slate-50 border border-indigo-400 rounded text-xs font-mono text-slate-900 focus:outline-none w-full"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveUpi}
                      className="px-2 py-1 bg-indigo-600 text-white rounded text-[11px] font-semibold"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs text-slate-500 font-medium">Receive on:</span>
                      <span className="text-xs font-mono font-semibold text-slate-900 truncate">
                        {receivingUpiId}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-normal leading-tight mt-0.5">
                      Instant bank credit via UPI Autopay / Intent
                    </p>
                  </>
                )}
              </div>
            </div>

            {!isEditingUpi && (
              <button
                onClick={handleStartEditUpi}
                className="shrink-0 text-indigo-600 hover:text-indigo-700 text-xs font-semibold flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                id="btn-change-upi"
              >
                <Edit2 className="w-3 h-3" />
                <span>Change</span>
              </button>
            )}
          </div>

          {/* 3. Nudge Tone Selector (Segmented Tabs) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Select Reminder Tone
              </span>
              <span className="text-[11px] font-semibold text-indigo-600">Pre-formatted</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {/* Casual Tab */}
              <button
                type="button"
                onClick={() => {
                  setTone('casual');
                  hapticSelection();
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all duration-150 ${
                  tone === 'casual'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <span>☕</span>
                <span className="truncate">Casual</span>
              </button>

              {/* Direct Tab */}
              <button
                type="button"
                onClick={() => {
                  setTone('direct');
                  hapticSelection();
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all duration-150 ${
                  tone === 'direct'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <span>⚡</span>
                <span className="truncate">Direct</span>
              </button>

              {/* Roomie Tab */}
              <button
                type="button"
                onClick={() => {
                  setTone('roomie');
                  hapticSelection();
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 transition-all duration-150 ${
                  tone === 'roomie'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/60'
                }`}
              >
                <span>🍕</span>
                <span className="truncate">Roomie</span>
              </button>
            </div>
          </div>

          {/* 4. Live WhatsApp Message Bubble Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Live Message Preview
              </span>
              <span className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                Auto-synced
              </span>
            </div>

            {/* WhatsApp Chat Container Window */}
            <div
              className="rounded-2xl p-3 border border-slate-200 relative shadow-inner"
              style={{
                backgroundColor: '#F0ECE2',
                backgroundImage: 'radial-gradient(#DFD8CB 0.75px, transparent 0.75px)',
                backgroundSize: '12px 12px',
              }}
            >
              {/* Date Pill */}
              <div className="flex justify-center mb-2">
                <span className="bg-white/85 backdrop-blur-xs text-[10px] text-slate-600 px-2.5 py-0.5 rounded-md font-medium shadow-2xs">
                  Today
                </span>
              </div>

              {/* WhatsApp Message Bubble (Green Sender Bubble) */}
              <div className="relative ml-auto max-w-[92%] bg-[#E7FFDB] border border-[#C3E6B7] text-slate-800 rounded-2xl rounded-tr-xs p-3 shadow-xs text-xs space-y-1.5 font-sans">
                {/* Message Text */}
                <p className="font-semibold text-slate-900 leading-snug">
                  {tone === 'direct' && `*${roomName} Expense Split Reminder* ⚡\nHey ${debtorUser.name.split(' ')[0]},`}
                  {tone === 'roomie' && `Hey ${debtorUser.name.split(' ')[0]}! 🍕 Dues check for ${roomName}:`}
                  {tone === 'casual' && `Hey ${debtorUser.name.split(' ')[0]}! 👋 Hope you're having a good day. Quick reminder for our ${roomName} split:`}
                </p>

                {/* Split Items */}
                {items && items.length > 0 && (
                  <div className="pl-1.5 border-l-2 border-emerald-500 space-y-0.5 text-[11px] text-slate-700">
                    {items.slice(0, 3).map((item, i) => (
                      <div key={i}>
                        • {item.title}: <span className="font-semibold text-slate-900 font-mono">₹{item.shareAmount.toFixed(2)}</span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[10px] text-slate-500 italic">+ {items.length - 3} more shared items</div>
                    )}
                  </div>
                )}

                {/* Total Due Highlight Card */}
                <div className="bg-white/80 rounded-lg p-2 border border-emerald-200/70 flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-xs">Total Due:</span>
                  <span className="font-bold text-emerald-800 font-mono text-xs">
                    ₹{totalAmount.toFixed(2)}
                  </span>
                </div>

                {/* UPI Direct Link Box */}
                <div className="pt-0.5">
                  <div className="text-[10px] text-slate-600 font-medium">
                    👉 Tap here to pay via GPay / PhonePe in 1-tap:
                  </div>
                  <div className="mt-1 bg-emerald-800/10 text-emerald-950 p-1.5 rounded-lg font-mono text-[9px] break-all border border-emerald-300/80 select-all leading-snug">
                    {upiDeepLink}
                  </div>
                </div>

                {/* Timestamp & Double Blue Tick */}
                <div className="flex items-center justify-end space-x-1 pt-0.5 text-[10px] text-slate-500">
                  <span>10:42 AM</span>
                  <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] stroke-[2.5]" />
                </div>

                {/* WhatsApp Chat Tail */}
                <div className="absolute -right-1.5 top-0 w-2.5 h-2.5 bg-[#E7FFDB] border-t border-r border-[#C3E6B7] rotate-45" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Footer Area */}
        <div className="p-4 bg-white border-t border-slate-100 space-y-2">
          {/* Primary Action: Send via WhatsApp */}
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              hapticSuccess();
              sendLocalNudgeNotification({
                fromName: currentUser.name,
                amount: totalAmount,
                tone,
              });
            }}
            className="w-full h-[50px] bg-[#25D366] hover:bg-[#20BD5A] active:scale-[0.98] text-white rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all"
            id="btn-send-whatsapp"
          >
            {/* WhatsApp SVG Icon */}
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            <span className="font-semibold text-white tracking-tight">Send Nudge via WhatsApp</span>
            <ExternalLink className="w-4 h-4 text-white/80" />
          </a>

          {/* Secondary Action Row (2 Equal Buttons) */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              onClick={handleCopy}
              className="h-10 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 rounded-xl px-3 flex items-center justify-center space-x-1.5 text-slate-700 text-xs font-semibold transition-all"
              id="btn-copy"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copy Message</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setShowQrModal(true);
                hapticImpact('MEDIUM');
              }}
              className="h-10 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 rounded-xl px-3 flex items-center justify-center space-x-1.5 text-slate-700 text-xs font-semibold transition-all"
              id="btn-show-qr"
            >
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>Show UPI QR</span>
            </button>
          </div>

          {/* Mark Settled Shortcut */}
          <div className="pt-1 text-center">
            <button
              onClick={handleDirectSettle}
              disabled={settleSuccess}
              className="inline-flex items-center space-x-1 text-xs font-medium text-slate-500 hover:text-indigo-600 active:scale-95 transition-all py-1 px-2 rounded"
            >
              {settleSuccess ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Settlement Recorded!</span>
                </span>
              ) : (
                <>
                  <span>Already received offline?</span>
                  <span className="text-indigo-600 font-semibold underline underline-offset-2">
                    Record Settlement Directly
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600 ml-0.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* In-Person UPI QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="max-w-xs w-full p-5 rounded-3xl bg-white border border-slate-200 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="text-sm font-bold text-slate-900">Instant UPI Payment QR</h3>
                <p className="text-[11px] text-slate-500">Scan with GPay, PhonePe, or Paytm</p>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Image Container */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl mx-auto inline-block shadow-inner">
              <img
                src={upiQrCodeUrl}
                alt="UPI Payment QR Code"
                className="w-48 h-48 rounded-lg object-contain mx-auto"
              />
            </div>

            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Amount to Settle</span>
              <div className="text-base font-bold text-slate-900 font-mono">
                ₹{totalAmount.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                {receivingUpiId}
              </div>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white active:scale-[0.98] transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
