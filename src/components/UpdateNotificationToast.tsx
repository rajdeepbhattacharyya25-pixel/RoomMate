import React, { useState, useEffect } from 'react';
import { liveUpdater, UpdateState } from '../services/updater';
import { Sparkles, RefreshCw, X } from 'lucide-react';

export const UpdateNotificationToast: React.FC = () => {
  const [state, setState] = useState<UpdateState>(() => liveUpdater.getState());
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const unsubscribe = liveUpdater.subscribe((newState) => {
      setState(newState);
      // Un-dismiss if a new update just finished staging
      if (newState.updateReady) {
        setDismissed(false);
      }
    });

    // Check for update silently 3 seconds after startup
    const timer = setTimeout(() => {
      liveUpdater.checkForUpdate({ silent: true }).catch(() => {});
    }, 3000);

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  if (dismissed || !state.updateReady) {
    return null;
  }

  const handleRestart = async () => {
    setRestarting(true);
    await liveUpdater.applyUpdateAndRestart();
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#111827]/95 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl shadow-indigo-500/20 backdrop-blur-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30 text-indigo-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Update Ready
              </span>
              {state.channel === 'staging' && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono border border-amber-500/30">
                  STAGING
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-white">
              RoomMate v{state.release?.version || 'new'} is ready.
            </p>
            <p className="text-xs text-slate-400">
              Applies on next launch, or restart now.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleRestart}
            disabled={restarting}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Applying...' : 'Restart'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
