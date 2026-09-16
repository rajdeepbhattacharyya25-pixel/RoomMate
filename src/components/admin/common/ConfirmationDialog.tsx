import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: (reason?: any) => void | Promise<void>;
  title: string;
  description?: string;
  message?: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | string;
  confirmVariant?: string;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  message,
  confirmLabel,
  confirmText,
  cancelLabel = 'Cancel',
  variant,
  confirmVariant,
  requireReason = false,
  reasonPlaceholder = 'Please enter a mandatory administrative reason...',
  isLoading = false,
}) => {
  const effectiveClose = onClose || onCancel || (() => {});
  const effectiveDescription = description || message || '';
  const effectiveConfirmLabel = confirmLabel || confirmText || 'Confirm Action';
  const rawVariant = variant || confirmVariant || 'danger';
  const effectiveVariant = rawVariant === 'warning' || rawVariant === 'primary' ? rawVariant : 'danger';
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError('An administrative reason is required to proceed.');
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
  };

  const variantStyles = {
    danger: {
      iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
      confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200',
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    warning: {
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
      confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200',
      icon: <ShieldAlert className="w-5 h-5" />,
    },
    primary: {
      iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      confirmBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200',
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
  }[effectiveVariant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-150">
        <button
          onClick={effectiveClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${variantStyles.iconBg}`}>
              {variantStyles.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{effectiveDescription}</p>
            </div>
          </div>

          {requireReason && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-700">
                Reason for Action <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={reasonPlaceholder}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none transition-all"
              />
              {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={effectiveClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 ${variantStyles.confirmBtn}`}
            >
              {isLoading && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              <span>{effectiveConfirmLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
