import React, { useState } from 'react';
import { HelpCircle, X, Camera, Loader2, Check, AlertCircle, Trash2 } from 'lucide-react';
import { pickImageFile, uploadImage } from '../../../../lib/services/imageUploadService';
import { submitBugReportCloud } from '../../../../lib/storage/cloudStorageAdapter';
import { captureDiagnosticReport } from '../../../../lib/services/diagnosticService';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { User, BugCategory } from '../../../../types';

interface ReportProblemModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onSubmitted?: () => void;
}

const CATEGORIES = [
  'Expense problem',
  'Payment problem',
  'Room problem',
  'Login problem',
  'Notification problem',
  'Other',
];

const CATEGORY_MAP: Record<string, BugCategory> = {
  'Expense problem': 'EXPENSE_SPLIT',
  'Payment problem': 'PAYMENT_UPI',
  'Room problem': 'ROOM_MANAGEMENT',
  'Login problem': 'OTHER',
  'Notification problem': 'UI_GLITCH',
  'Other': 'OTHER',
};

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSubmitted,
}) => {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isUploadingShot, setIsUploadingShot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePickScreenshot = async () => {
    try {
      const file = await pickImageFile('image/*');
      if (!file) return;

      setIsUploadingShot(true);
      const res = await uploadImage(file, `${currentUser.name}_issue_screenshot`);
      if (res.success && res.url) {
        setScreenshotUrl(res.url);
        await hapticSuccess();
      } else {
        setError('Screenshot upload failed. Please retry.');
      }
    } catch {
      setError('Could not attach screenshot.');
    } finally {
      setIsUploadingShot(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDesc = description.trim();
    if (!cleanDesc) {
      setError('Please describe what happened.');
      hapticWarning();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const bugCategory = CATEGORY_MAP[category] || 'OTHER';
      const diagnostics = captureDiagnosticReport(currentUser, null, 'settings');

      // 1. Submit to Supabase Cloud & SuperAdmin Live CDC
      await submitBugReportCloud({
        userId: currentUser.id,
        userName: currentUser.name,
        userEmail: currentUser.email || 'no-email@roommate.internal',
        userRole: currentUser.role,
        category: bugCategory,
        severity: 'MEDIUM',
        status: 'OPEN',
        description: cleanDesc,
        screenshotUrl: screenshotUrl || undefined,
        diagnostics,
      });

      // 2. Also keep local offline backup
      try {
        const reports = JSON.parse(localStorage.getItem('roommate_issue_reports') || '[]');
        reports.push({
          id: 'rep_' + Date.now(),
          userId: currentUser.id,
          userEmail: currentUser.email,
          userName: currentUser.name,
          category,
          description: cleanDesc,
          screenshotUrl,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem('roommate_issue_reports', JSON.stringify(reports));
      } catch {
        // ignore local storage error
      }

      await hapticSuccess();
      setIsSubmitted(true);
      if (onSubmitted) onSubmitted();

      setTimeout(() => {
        setIsSubmitted(false);
        setDescription('');
        setScreenshotUrl(null);
        onClose();
      }, 2500);
    } catch {
      setError("Couldn't submit report. Please check your connection.");
      hapticWarning();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-problem-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-[#12121A] rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 dark:border-[#27354A] space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-[#27354A]/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <HelpCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="report-problem-title" className="text-sm font-bold text-slate-900 dark:text-slate-100">Report a Problem</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">We&apos;ll investigate and resolve the issue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E2638] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-center space-y-2 animate-in fade-in">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
              <Check className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">Report Submitted</h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Thank you for helping us improve RoomMate! Our team will look into this issue.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
            <div>
              <label htmlFor="issue-category-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Problem Category
              </label>
              <select
                id="issue-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="issue-desc-textarea" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Description
              </label>
              <textarea
                id="issue-desc-textarea"
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Please describe what happened, steps to reproduce, or any unexpected behavior..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
              />
            </div>

            {/* Optional screenshot attachment */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Screenshot (Optional)</span>
              {screenshotUrl ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-[#27354A]">
                  <div className="flex items-center space-x-2.5">
                    <img src={screenshotUrl} alt="Attached issue screenshot" className="w-10 h-10 rounded-lg object-cover bg-white border border-slate-200 dark:border-slate-700" />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">Screenshot attached</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreenshotUrl(null)}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handlePickScreenshot}
                  disabled={isUploadingShot}
                  className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-[#27354A] hover:border-slate-400 dark:hover:border-[#384a68] text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center justify-center space-x-2 transition-colors active:scale-98"
                >
                  {isUploadingShot ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                      <span>Uploading screenshot...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>Attach Screenshot</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {error && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-[#27354A] text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#181820] active:scale-98 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Report</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
