import React, { useState, useEffect } from 'react';
import {
  QrCode,
  X,
  Loader2,
  Check,
  Edit3,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { validateUpiId } from '../../../../lib/payments/upiExtraction';

interface QrPreviewModalProps {
  isOpen: boolean;
  previewUrl: string | null;
  extractedUpiId: string | null;
  existingUpiId?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirmSave: (saveUpi: boolean, upiToSave?: string) => Promise<void> | void;
}

export const QrPreviewModal: React.FC<QrPreviewModalProps> = ({
  isOpen,
  previewUrl,
  extractedUpiId,
  existingUpiId,
  isSaving,
  onClose,
  onConfirmSave,
}) => {
  const [mode, setMode] = useState<'confirm' | 'edit'>('confirm');
  const [editedUpi, setEditedUpi] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset internal state whenever modal opens or extracted UPI changes
  useEffect(() => {
    if (isOpen) {
      setMode('confirm');
      setEditedUpi(extractedUpiId || '');
      setValidationError(null);
    }
  }, [isOpen, extractedUpiId]);

  if (!isOpen || !previewUrl) return null;

  const cleanExisting = (existingUpiId || '').trim().toLowerCase();
  const cleanExtracted = (extractedUpiId || '').trim().toLowerCase();

  const isExactDuplicate = Boolean(
    cleanExtracted && cleanExisting && cleanExtracted === cleanExisting
  );
  const isConflictWithExisting = Boolean(
    cleanExtracted && cleanExisting && cleanExtracted !== cleanExisting
  );

  // Handle saving in edit mode
  const handleSaveEdited = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateUpiId(editedUpi);
    if (!validation.isValid || !validation.normalized) {
      setValidationError(validation.error || 'Please enter a valid UPI ID.');
      return;
    }
    setValidationError(null);
    await onConfirmSave(true, validation.normalized);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-preview-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 text-center animate-in slide-in-from-bottom-6 duration-200 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2 text-left">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 id="qr-preview-title" className="text-sm font-bold text-slate-900">
                {mode === 'edit'
                  ? 'Edit UPI ID'
                  : extractedUpiId
                  ? 'Is this your UPI ID?'
                  : 'Confirm Payment QR'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {mode === 'edit'
                  ? 'Modify before saving'
                  : extractedUpiId
                  ? 'We found this UPI ID from your uploaded QR code.'
                  : 'Preview before saving'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thumbnail QR Display */}
        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl inline-block shadow-inner mx-auto">
          <img
            src={previewUrl}
            alt="QR Code Preview"
            className="w-36 h-36 object-contain rounded-xl bg-white mx-auto"
          />
        </div>

        {/* MODE: EDIT */}
        {mode === 'edit' ? (
          <form onSubmit={handleSaveEdited} className="space-y-4 text-left">
            <div>
              <label htmlFor="edit-upi-input" className="block text-xs font-semibold text-slate-700 mb-1">
                UPI ID (VPA)
              </label>
              <input
                id="edit-upi-input"
                type="text"
                value={editedUpi}
                onChange={(e) => {
                  setEditedUpi(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="e.g. rahul@okaxis"
                disabled={isSaving}
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-mono font-medium text-slate-900 placeholder:text-slate-400"
              />
              {validationError && (
                <div className="flex items-center space-x-1.5 mt-1.5 text-rose-600 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMode('confirm');
                  setEditedUpi(extractedUpiId || '');
                  setValidationError(null);
                }}
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all flex items-center justify-center space-x-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save UPI ID & QR</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* MODE: CONFIRM */
          <div className="space-y-3.5">
            {/* Case 1: Valid UPI QR with Extracted VPA */}
            {extractedUpiId ? (
              <div className="space-y-3">
                {/* Extracted UPI Highlight Badge */}
                <div className="p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">
                    Extracted UPI ID
                  </span>
                  <p className="text-base font-mono font-extrabold text-emerald-950 break-all">
                    {extractedUpiId}
                  </p>
                </div>

                {/* Sub-case: Identical existing UPI ID */}
                {isExactDuplicate && (
                  <div className="flex items-center justify-center space-x-1.5 text-xs text-emerald-700 font-medium bg-emerald-50/50 py-1.5 px-2.5 rounded-xl border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>This UPI ID is already saved on your profile.</span>
                  </div>
                )}

                {/* Sub-case: Conflict with different existing UPI ID */}
                {isConflictWithExisting && (
                  <div className="text-left p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Existing UPI ID: {cleanExisting}</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-snug">
                      You currently have a different UPI ID saved. Saving will update it to{' '}
                      <span className="font-mono font-bold">{cleanExtracted}</span>.
                    </p>
                  </div>
                )}

                {/* Buttons based on conflict / duplicate status */}
                {isExactDuplicate ? (
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSaving}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirmSave(false)}
                      disabled={isSaving}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save QR Code</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : isConflictWithExisting ? (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onConfirmSave(true, cleanExtracted)}
                      disabled={isSaving}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Yes, update UPI & save QR</span>
                        </>
                      )}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirmSave(false)}
                        disabled={isSaving}
                        className="py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all truncate"
                        title="Keep existing UPI ID and only save QR"
                      >
                        Keep existing UPI
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('edit')}
                        disabled={isSaving}
                        className="py-2.5 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100/70 active:scale-98 transition-all text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>No, edit it</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Standard Confirmation: "Yes, save it" and "No, edit it" */
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setMode('edit')}
                        disabled={isSaving}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-98 transition-all text-xs font-semibold flex items-center justify-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                        <span>No, edit it</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onConfirmSave(true, cleanExtracted)}
                        disabled={isSaving}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Yes, save it</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSaving}
                      className="text-[11px] text-slate-500 hover:text-slate-800 transition-colors pt-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Case 2: Non-UPI QR (URL, Wi-Fi, arbitrary payload) */
              <div className="space-y-3">
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  Use this payment QR code? Roommates can scan this directly to settle debts with you.
                </p>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSaving}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmSave(false)}
                    disabled={isSaving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save QR</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
