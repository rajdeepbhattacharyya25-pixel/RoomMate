/**
 * RoomExportBottomSheet — Format picker and export trigger for Room Shared Expenses
 *
 * Bottom sheet allowing users to export room shared expenses and settlements in
 * PDF, CSV, or Excel (.xlsx) formats.
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
  ShieldCheck,
} from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { RoomExportFormat } from '../../lib/services/roomExpenseExportService';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface RoomExportBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  monthLabel: string;
  onExport: (format: RoomExportFormat) => Promise<void>;
}

type ExportState = 'IDLE' | 'GENERATING' | 'SUCCESS' | 'ERROR';

const FORMAT_OPTIONS: Array<{
  format: RoomExportFormat;
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
    subtitle: 'Detailed room shared expense & settlement statement — best for sharing',
    iconBg: 'bg-rose-50 border-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    format: 'csv',
    icon: Table2,
    title: 'CSV Spreadsheet',
    subtitle: 'Raw shared expense & roommate split data — best for Excel / Sheets',
    iconBg: 'bg-emerald-50 border-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    format: 'xlsx',
    icon: FileSpreadsheet,
    title: 'Excel Workbook (.xlsx)',
    subtitle: 'Multi-sheet workbook (Summary, Expenses, Settlements, Splits)',
    iconBg: 'bg-sky-50 border-sky-100',
    iconColor: 'text-sky-600',
  },
];

export const RoomExportBottomSheet: React.FC<RoomExportBottomSheetProps> = ({
  isOpen,
  onClose,
  roomName,
  monthLabel,
  onExport,
}) => {
  const [exportState, setExportState] = useState<ExportState>('IDLE');
  const [activeFormat, setActiveFormat] = useState<RoomExportFormat | null>(null);

  const handleExport = async (format: RoomExportFormat) => {
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
      console.error('Room export failed:', err);
      setExportState('ERROR');
      hapticWarning();
    }
  };

  const handleRetry = () => {
    setExportState('IDLE');
    setActiveFormat(null);
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={() => {
        if (exportState !== 'GENERATING') {
          setExportState('IDLE');
          setActiveFormat(null);
          onClose();
        }
      }}
      title={`Export ${monthLabel}`}
      subtitle={`${roomName} • Shared Expenses & Settlements`}
      icon={<Download className="w-5 h-5" />}
      maxHeight="80vh"
    >
      <div className="space-y-4 pb-4">
        {/* State 1: IDLE — Format Selection */}
        {exportState === 'IDLE' && (
          <>
            <div className="space-y-2.5">
              <p className="text-xs text-slate-500 font-medium px-0.5">
                Choose format to download or share:
              </p>

              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.format}
                    onClick={() => handleExport(opt.format)}
                    className="w-full p-3.5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:bg-indigo-50/20 active:scale-[0.98] transition-all text-left flex items-start gap-3.5 shadow-2xs group"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl border ${opt.iconBg} ${opt.iconColor} flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {opt.title}
                        </span>
                        <Download className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {opt.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Privacy & Room Isolation Banner */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Strict Room Privacy: </span>
                Only shared expenses and settlements for {roomName} are exported. Personal Vault expenses are never included.
              </div>
            </div>
          </>
        )}

        {/* State 2: GENERATING — Loading Spinner */}
        {exportState === 'GENERATING' && (
          <div className="py-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
              <Loader2 className="w-7 h-7 animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">
                Generating {activeFormat?.toUpperCase()} Report...
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Compiling shared bills, roommate balances, and itemized splits for {monthLabel}...
              </p>
            </div>
          </div>
        )}

        {/* State 3: SUCCESS — Confirmation & Auto-Close */}
        {exportState === 'SUCCESS' && (
          <div className="py-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="w-7 h-7 stroke-[2]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Export Successful!</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your report has been generated and downloaded to your device.
              </p>
            </div>
          </div>
        )}

        {/* State 4: ERROR — Retry Option */}
        {exportState === 'ERROR' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <AlertCircle className="w-7 h-7 stroke-[2]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Couldn't generate report</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                An unexpected error occurred while compiling data. Please try again.
              </p>
            </div>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs active:scale-95 transition-all"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
};
