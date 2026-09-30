import React, { useState, useEffect } from 'react';
import {
  Bug,
  Mail,
  Send,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Trash2,
  Loader2,
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { User, Room, BugCategory, BugSeverity } from '../../types';
import {
  captureDiagnosticReport,
  generateBugReportMailtoUrl,
} from '../../lib/services/diagnosticService';
import { submitBugReportCloud } from '../../lib/storage/cloudStorageAdapter';
import {
  isShakeDetectionEnabled,
  setShakeDetectionEnabled,
  getShakeSensitivity,
  setShakeSensitivity,
  ShakeSensitivity,
} from '../../lib/native/shakeDetector';
import { hapticSuccess, hapticImpact, hapticSelection } from '../../lib/native/haptics';
import { pickImageFile, uploadImage } from '../../lib/services/imageUploadService';

export interface ShakeBugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  activeRoom?: Room | null;
  currentRoute?: string;
  onReportSubmitted?: () => void;
}

const CATEGORY_OPTIONS: { label: string; value: BugCategory; emoji: string }[] = [
  { label: 'UI Glitch', value: 'UI_GLITCH', emoji: '🎨' },
  { label: 'Expense Split', value: 'EXPENSE_SPLIT', emoji: '⚖️' },
  { label: 'Payment / UPI', value: 'PAYMENT_UPI', emoji: '💸' },
  { label: 'Room & Invites', value: 'ROOM_MANAGEMENT', emoji: '👥' },
  { label: 'Sync & Offline', value: 'SYNC_OFFLINE', emoji: '🔄' },
  { label: 'Other', value: 'OTHER', emoji: '💬' },
];

const SEVERITY_OPTIONS: { label: string; value: BugSeverity; color: string }[] = [
  { label: 'Low', value: 'LOW', color: 'bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27354A]' },
  { label: 'Medium', value: 'MEDIUM', color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40' },
  { label: 'High', value: 'HIGH', color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/40' },
  { label: 'Critical', value: 'CRITICAL', color: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40' },
];

export const ShakeBugReportModal: React.FC<ShakeBugReportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeRoom,
  currentRoute = 'dashboard',
  onReportSubmitted,
}) => {
  const [category, setCategory] = useState<BugCategory>('UI_GLITCH');
  const [severity, setSeverity] = useState<BugSeverity>('MEDIUM');
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isUploadingShot, setIsUploadingShot] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shakeEnabled, setShakeEnabledState] = useState(true);
  const [shakeSensitivity, setShakeSensitivityState] = useState<ShakeSensitivity>(() => getShakeSensitivity());
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);

  // Sync shake toggle preference and sensitivity
  useEffect(() => {
    if (isOpen) {
      setShakeEnabledState(isShakeDetectionEnabled());
      setShakeSensitivityState(getShakeSensitivity());
      setIsSuccess(false);
      setSubmittedReportId(null);
    }
  }, [isOpen]);

  const diagnostics = captureDiagnosticReport(currentUser, activeRoom, currentRoute);

  const handleToggleShake = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setShakeEnabledState(val);
    setShakeDetectionEnabled(val);
    hapticSelection();
  };

  const handlePickScreenshot = async () => {
    try {
      const file = await pickImageFile('image/*');
      if (!file) return;

      setIsUploadingShot(true);
      const res = await uploadImage(file, `${currentUser.name}_shake_bug`);
      if (res.success && res.url) {
        setScreenshotUrl(res.url);
        await hapticSuccess();
      }
    } catch {
      // User cancelled or upload failed
    } finally {
      setIsUploadingShot(false);
    }
  };

  const handleSubmitInApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!description.trim()) {
      hapticImpact('MEDIUM');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await submitBugReportCloud({
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email || 'no-email@roommate.internal',
        userRole: currentUser.role,
        category,
        severity,
        status: 'OPEN',
        description: description.trim(),
        screenshotUrl: screenshotUrl || undefined,
        diagnostics,
      });

      setSubmittedReportId(created.id);
      setIsSuccess(true);
      await hapticSuccess();
      if (onReportSubmitted) onReportSubmitted();

      setTimeout(() => {
        onClose();
        setDescription('');
        setScreenshotUrl(null);
        setIsSuccess(false);
      }, 2400);
    } catch (err) {
      console.error('Failed to submit bug report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenMailto = () => {
    hapticImpact('LIGHT');
    const mailtoUrl = generateBugReportMailtoUrl({
      category,
      severity,
      description: description.trim() || 'No description provided.',
      currentUser,
      diagnostics,
    });
    window.open(mailtoUrl, '_blank');
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-xs">
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Did something go wrong?</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Shake detected • RoomMate Feedback</p>
          </div>
        </div>
      }
      maxHeight="92vh"
    >
      {isSuccess ? (
        <div className="py-10 px-4 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8 animate-bounce" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900 dark:text-white">Report Sent to Operations Desk</h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto">
              Thanks {currentUser.name}! The engineering and admin team has received your diagnostics.
            </p>
            {submittedReportId && (
              <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 pt-1">Ticket #{submittedReportId}</p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitInApp} className="space-y-4 pt-1 pb-4">
          {/* 1. Category Pill Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Issue Category
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setCategory(cat.value);
                    }}
                    className={`flex items-center justify-center space-x-1 py-2 px-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-[#1C1C25] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
                    }`}
                  >
                    <span className="text-xs">{cat.emoji}</span>
                    <span className="truncate text-[11px]">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Severity Pill Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Impact / Severity
            </label>
            <div className="flex items-center space-x-2">
              {SEVERITY_OPTIONS.map((sev) => {
                const isSelected = severity === sev.value;
                return (
                  <button
                    key={sev.value}
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setSeverity(sev.value);
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                      isSelected
                        ? 'ring-2 ring-indigo-600 ring-offset-1 dark:ring-offset-[#12121A] font-bold shadow-xs ' + sev.color
                        : 'bg-white dark:bg-[#1C1C25] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
                    }`}
                  >
                    {sev.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Description Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                What happened?
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{description.length}/500</span>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly explain what went wrong or unexpected... (e.g. calculation mismatch in ledger or button unresponsive)"
              className="w-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-slate-50/80 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl p-3 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-[#20202A] transition-all resize-none"
            />
          </div>

          {/* 4. Screenshot / Attachment (Optional) */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A]">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-white">Screenshot</span>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {screenshotUrl ? '1 image attached' : 'Attach visual proof (optional)'}
                </p>
              </div>
            </div>

            {screenshotUrl ? (
              <div className="flex items-center space-x-2">
                <img
                  src={screenshotUrl}
                  alt="Proof"
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-[#27354A]"
                />
                <button
                  type="button"
                  onClick={() => setScreenshotUrl(null)}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePickScreenshot}
                disabled={isUploadingShot}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-[#27354A] flex items-center space-x-1"
              >
                {isUploadingShot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <span>Choose</span>
                )}
              </button>
            )}
          </div>

          {/* 5. Automatic Diagnostics Preview Accordion */}
          <div className="rounded-xl border border-slate-200 dark:border-[#27354A] overflow-hidden bg-white dark:bg-[#1C1C25]">
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="w-full flex items-center justify-between p-2.5 text-left bg-slate-50/70 dark:bg-[#181820] hover:bg-slate-100/70 dark:hover:bg-[#20202A] transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Smartphone className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Auto-captured diagnostics</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 font-medium">
                  {diagnostics.networkOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              {showDiagnostics ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              )}
            </button>

            {showDiagnostics && (
              <div className="p-3 text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 border-t border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#1C1C25] font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Route:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">{diagnostics.route}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Build:</span>
                  <span>{diagnostics.appVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">Platform:</span>
                  <span>{diagnostics.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500">User:</span>
                  <span className="truncate max-w-[180px]">{currentUser.name} ({currentUser.email || 'No email'})</span>
                </div>
                {activeRoom && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 dark:text-slate-500">Active Room:</span>
                    <span>{activeRoom.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. Dual Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting to Operations...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit In-App Report</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleOpenMailto}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-white dark:bg-[#1C1C25] hover:bg-slate-50 dark:hover:bg-[#20202A] border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Prefer email? Draft message to Admin</span>
            </button>
          </div>

          {/* 7. Footer Toggle: Shake to Report & Sensitivity */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-[#27354A] space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Shake phone to report</span>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Pop up this window when device is shaken</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={shakeEnabled}
                  onChange={handleToggleShake}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 dark:bg-[#27354A] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {shakeEnabled && (
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-[#181820] p-2 rounded-lg border border-slate-100 dark:border-[#27354A]">
                <span className="font-medium text-slate-600 dark:text-slate-300">Sensitivity:</span>
                <div className="flex items-center space-x-1">
                  {(['low', 'medium', 'high'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setShakeSensitivityState(tier);
                        setShakeSensitivity(tier);
                        hapticSelection();
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        shakeSensitivity === tier
                          ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#27354A]'
                      }`}
                    >
                      {tier === 'low' ? 'Firm' : tier === 'medium' ? 'Standard' : 'Gentle'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </MobileBottomSheet>
  );
};
