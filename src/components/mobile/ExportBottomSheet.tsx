/**
 * ExportBottomSheet — Format picker and export trigger
 *
 * Bottom sheet that lets the user choose PDF/CSV/XLSX export format,
 * shows loading state during generation, and handles success/error states.
 */

import React, { useState } from 'react';
import {
  FileText,
  Table2,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ExportFormat } from '../../lib/services/expenseExportService';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface ExportBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  monthLabel: string;
  onExport: (format: ExportFormat) => Promise<void>;
}

type ExportState = 'IDLE' | 'GENERATING' | 'SUCCESS' | 'ERROR';

const FORMAT_OPTIONS: Array<{
  format: ExportFormat;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  iconBg: string;
  iconColor: string;
}> = [
  {
    format: 'pdf',
    icon: FileText,
    title: 'PDF Report',
    subtitle: 'Detailed monthly expense report — best for viewing & sharing',
    iconBg: 'bg-rose-50 border-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    format: 'csv',
    icon: Table2,
    title: 'CSV Spreadsheet',
    subtitle: 'Raw expense data — best for spreadsheets & analysis',
    iconBg: 'bg-emerald-50 border-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    format: 'xlsx',
    icon: FileSpreadsheet,
    title: 'Excel Workbook',
    subtitle: 'Multi-sheet structured data — best for editing & further analysis',
    iconBg: 'bg-sky-50 border-sky-100',
    iconColor: 'text-sky-600',
  },
];

export const ExportBottomSheet: React.FC<ExportBottomSheetProps> = ({
  isOpen,
  onClose,
  monthLabel,
  onExport,
}) => {
  const [exportState, setExportState] = useState<ExportState>('IDLE');
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    if (exportState === 'GENERATING') return;
    hapticImpact('MEDIUM');
    setActiveFormat(format);
    setExportState('GENERATING');

    try {
      await onExport(format);
      setExportState('SUCCESS');
      hapticSuccess();

      // Auto-close after success
      setTimeout(() => {
        setExportState('IDLE');
        setActiveFormat(null);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Export failed:', err);
      setExportState('ERROR');
      hapticWarning();
    }
  };

  const handleRetry = () => {
    setExportState('IDLE');
    setActiveFormat(null);
  };

  const handleClose = () => {
    if (exportState === 'GENERATING') return; // Prevent close during generation
    setExportState('IDLE');
    setActiveFormat(null);
    onClose();
  };

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={handleClose} title="">
      <div className="px-1 pb-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Download className="w-4.5 h-4.5 text-indigo-600" />
              Export {monthLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Choose a format to download your expense data</p>
          </div>
        </div>

        {/* ── IDLE: Format Selection ── */}
        {exportState === 'IDLE' && (
          <div className="space-y-2.5">
            {FORMAT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.format}
                  onClick={() => handleExport(opt.format)}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/30 active:scale-[0.98] transition-all shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]"
                >
                  <div className={`w-10 h-10 rounded-xl ${opt.iconBg} border flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                    <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{opt.subtitle}</div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </button>
              );
            })}

            {/* Cancel */}
            <button
              onClick={handleClose}
              className="w-full py-2.5 text-center text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors mt-1"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── GENERATING: Loading State ── */}
        {exportState === 'GENERATING' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-900">Generating your report…</p>
              <p className="text-xs text-slate-500 mt-1">
                {activeFormat === 'pdf' ? 'Creating PDF with charts and tables' :
                 activeFormat === 'csv' ? 'Formatting spreadsheet data' :
                 'Building multi-sheet workbook'}
              </p>
            </div>
          </div>
        )}

        {/* ── SUCCESS: Confirmation ── */}
        {exportState === 'SUCCESS' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-700">Export successful!</p>
              <p className="text-xs text-slate-500 mt-1">
                Your {activeFormat?.toUpperCase()} file has been downloaded
              </p>
            </div>
          </div>
        )}

        {/* ── ERROR: Retry State ── */}
        {exportState === 'ERROR' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-rose-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-rose-700">Couldn't generate the report</p>
              <p className="text-xs text-slate-500 mt-1">Please try again</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleRetry}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold active:scale-95 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium active:scale-95 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
};
