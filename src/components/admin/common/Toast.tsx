import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const type = toast.type || 'info';
        const styles = {
          success: {
            bg: 'bg-white border-emerald-200 text-slate-800 shadow-emerald-100/50',
            icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
          },
          error: {
            bg: 'bg-white border-rose-200 text-slate-800 shadow-rose-100/50',
            icon: <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />,
          },
          warning: {
            bg: 'bg-white border-amber-200 text-slate-800 shadow-amber-100/50',
            icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
          },
          info: {
            bg: 'bg-white border-indigo-200 text-slate-800 shadow-indigo-100/50',
            icon: <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />,
          },
        }[type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 ${styles.bg}`}
          >
            {styles.icon}
            <div className="flex-1 min-w-0">
              {toast.title && <p className="text-xs font-bold text-slate-900">{toast.title}</p>}
              <p className="text-xs text-slate-600 leading-snug">{toast.message}</p>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
