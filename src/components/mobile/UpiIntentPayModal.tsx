import React, { useState, useMemo } from 'react';
import { User, PaymentMethod } from '../../types';
import {
  launchUpiIntent,
  generateUpiQrCodeUrl,
  generateSettlementToken,
  isMobileDevice,
  UpiAppTarget,
} from '../../lib/payments/upiIntentService';
import { hapticSelection, hapticImpact, hapticSuccess } from '../../lib/native/haptics';
import {
  X,
  QrCode,
  Copy,
  Check,
  CheckCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
  UserCheck,
} from 'lucide-react';

interface UpiIntentPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  availablePayees: User[];
  initialPayeeId?: string;
  roomName: string;
  initialAmount?: number;
  onPaymentCompleted: (details: {
    payeeId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    appUsed: string;
    transactionRef: string;
    notes?: string;
  }) => void;
}

export const UpiIntentPayModal: React.FC<UpiIntentPayModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  availablePayees,
  initialPayeeId,
  roomName,
  initialAmount = 0,
  onPaymentCompleted,
}) => {
  const [selectedPayeeId, setSelectedPayeeId] = useState<string>(() => {
    if (initialPayeeId && availablePayees.some((u) => u.id === initialPayeeId)) {
      return initialPayeeId;
    }
    return availablePayees[0]?.id || '';
  });

  const [payAmount, setPayAmount] = useState<string>(() =>
    initialAmount > 0 ? initialAmount.toFixed(0) : '0'
  );
  const [selectedApp, setSelectedApp] = useState<UpiAppTarget>('generic');
  const [appLaunched, setAppLaunched] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [userUtr, setUserUtr] = useState('');
  const [generatedRef] = useState(() => generateSettlementToken());

  // Active payee user object
  const activePayee = useMemo(() => {
    return availablePayees.find((u) => u.id === selectedPayeeId) || availablePayees[0];
  }, [availablePayees, selectedPayeeId]);

  // Determine Payee's VPA / UPI ID
  const payeeUpiId = useMemo(() => {
    if (activePayee?.email) {
      return `${activePayee.name.toLowerCase().replace(/\s+/g, '')}@okaxis`;
    }
    return 'roommate@upi';
  }, [activePayee]);

  const numAmount = Number(payAmount) || 0;

  const upiOptions = useMemo(() => {
    return {
      pa: payeeUpiId,
      pn: activePayee?.name || 'Roommate',
      am: numAmount,
      tn: `${roomName.replace(/\s+/g, '_')}_Settlement`,
      tr: generatedRef,
    };
  }, [payeeUpiId, activePayee, numAmount, roomName, generatedRef]);

  const qrCodeUrl = useMemo(() => {
    return generateUpiQrCodeUrl(upiOptions, 260);
  }, [upiOptions]);

  const handleCopyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(payeeUpiId);
      await hapticSelection();
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLaunchApp = async (app: UpiAppTarget) => {
    await hapticImpact('MEDIUM');
    setSelectedApp(app);
    setAppLaunched(true);
    launchUpiIntent(app, upiOptions);
  };

  const handleConfirmPaid = async () => {
    if (!activePayee || numAmount <= 0) return;
    await hapticSuccess();

    const appNameMap: Record<UpiAppTarget, string> = {
      gpay: 'Google Pay',
      phonepe: 'PhonePe',
      paytm: 'Paytm',
      generic: 'UPI Intent',
    };

    onPaymentCompleted({
      payeeId: activePayee.id,
      amount: numAmount,
      paymentMethod: 'UPI',
      appUsed: appNameMap[selectedApp] || 'UPI',
      transactionRef: userUtr.trim() || generatedRef,
      notes: `Settled via ${appNameMap[selectedApp]} for ${roomName}`,
    });
  };

  if (!isOpen || !activePayee) return null;

  const isMobile = isMobileDevice();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-[395px] bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-5">
        {/* iOS Grab Bar */}
        <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-1" />

        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">1-Tap UPI Settlement</h2>
              <p className="text-[11px] text-slate-500">From {currentUser.name} to {activePayee.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Payee Selection Switcher (if multiple flatmates) */}
        {availablePayees.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3 h-3" />
              <span>Select Roommate To Pay</span>
            </label>
            <select
              value={selectedPayeeId}
              onChange={(e) => {
                hapticSelection();
                setSelectedPayeeId(e.target.value);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              {availablePayees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email || 'Roommate'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Payee Details Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              {activePayee.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">{activePayee.name}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                <span>{payeeUpiId}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleCopyUpiId}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
          >
            {copiedUpi ? (
              <>
                <CheckCheck className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Amount Input & Quick Chips */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Settlement Amount in ₹
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-xl font-bold text-indigo-600">₹</span>
            <input
              type="number"
              step="any"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0"
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-extrabold text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 tabular-nums transition-all"
            />
          </div>

          {/* Quick Split Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {initialAmount > 0 && (
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setPayAmount(initialAmount.toFixed(0));
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold whitespace-nowrap active:scale-95 transition-transform"
              >
                Full Due (₹{initialAmount.toFixed(0)})
              </button>
            )}
            {initialAmount > 100 && (
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setPayAmount((initialAmount / 2).toFixed(0));
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold whitespace-nowrap active:scale-95 transition-transform"
              >
                50% (₹{(initialAmount / 2).toFixed(0)})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                setPayAmount(String(Math.ceil(numAmount / 50) * 50 || 100));
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold whitespace-nowrap active:scale-95 transition-transform"
            >
              Round Up
            </button>
          </div>
        </div>

        {/* 1-Tap App Selector Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Choose Payment App (1-Tap Switch)
            </label>
            {!isMobile && (
              <span className="text-[10px] text-amber-600 font-medium">Desktop Preview Mode</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Google Pay */}
            <button
              type="button"
              onClick={() => handleLaunchApp('gpay')}
              disabled={numAmount <= 0}
              className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-97 shadow-2xs ${
                selectedApp === 'gpay'
                  ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20'
                  : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center font-bold text-sm text-[#4285F4]">
                  G
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Google Pay</div>
                  <div className="text-[10px] text-slate-500">tez:// scheme</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* PhonePe */}
            <button
              type="button"
              onClick={() => handleLaunchApp('phonepe')}
              disabled={numAmount <= 0}
              className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-97 shadow-2xs ${
                selectedApp === 'phonepe'
                  ? 'bg-purple-50/70 border-purple-400 ring-2 ring-purple-500/20'
                  : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600 shadow-2xs flex items-center justify-center font-bold text-xs text-white">
                  पे
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">PhonePe</div>
                  <div className="text-[10px] text-slate-500">phonepe://</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Paytm */}
            <button
              type="button"
              onClick={() => handleLaunchApp('paytm')}
              disabled={numAmount <= 0}
              className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-97 shadow-2xs ${
                selectedApp === 'paytm'
                  ? 'bg-sky-50/70 border-sky-400 ring-2 ring-sky-500/20'
                  : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#00BAF2] shadow-2xs flex items-center justify-center font-extrabold text-[11px] text-white">
                  Pay
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Paytm</div>
                  <div className="text-[10px] text-slate-500">paytmmp://</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Any UPI / CRED */}
            <button
              type="button"
              onClick={() => handleLaunchApp('generic')}
              disabled={numAmount <= 0}
              className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-97 shadow-2xs ${
                selectedApp === 'generic'
                  ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-500/20'
                  : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 shadow-2xs flex items-center justify-center font-bold text-xs text-white">
                  UPI
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Any App</div>
                  <div className="text-[10px] text-slate-500">OS Intent Chooser</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* QR Code Scannable Drawer Toggle (Desktop & In-Person) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              hapticSelection();
              setShowQrCode(!showQrCode);
            }}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-slate-500" />
            <span>{showQrCode ? 'Hide Scannable QR Code' : 'Show In-Person Scannable QR Code'}</span>
          </button>

          {showQrCode && (
            <div className="mt-3 p-4 bg-slate-900 rounded-2xl text-center space-y-3 animate-in fade-in zoom-in-95">
              <div className="inline-block p-3 bg-white rounded-xl shadow-lg">
                <img
                  src={qrCodeUrl}
                  alt="UPI QR Code"
                  className="w-44 h-44 mx-auto rounded-lg object-contain"
                />
              </div>
              <p className="text-[11px] text-slate-300">
                Scan with GPay, PhonePe, or Paytm on any phone to pay ₹{numAmount.toFixed(2)} to {activePayee.name}
              </p>
            </div>
          )}
        </div>

        {/* App Switcher Banner / Post-Launch Status */}
        {appLaunched && (
          <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-start space-x-2.5 animate-in fade-in">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[11px] text-indigo-950 space-y-0.5">
              <p className="font-bold">Payment App Launched!</p>
              <p className="text-indigo-800">
                Complete your transfer of ₹{numAmount.toFixed(2)} in your bank app, then tap Confirm below to generate your official proof card.
              </p>
            </div>
          </div>
        )}

        {/* Optional UTR / Reference Input */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Bank UTR / Reference ID (Optional)
            </label>
            <span className="text-[10px] font-mono text-slate-400">{generatedRef}</span>
          </div>
          <input
            type="text"
            value={userUtr}
            onChange={(e) => setUserUtr(e.target.value)}
            placeholder="e.g. 12-digit UPI UTR / Ref ID"
            className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {/* Confirm Payment & Generate Proof Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleConfirmPaid}
            disabled={numAmount <= 0}
            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>I Have Paid • Generate Proof Card</span>
          </button>
        </div>
      </div>
    </div>
  );
};
