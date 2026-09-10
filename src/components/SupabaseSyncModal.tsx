import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink, X, Cloud, Terminal } from 'lucide-react';
import { testSupabaseConnection } from '../lib/supabase/client';
import { supabaseService } from '../lib/supabase/supabaseService';
import { db } from '../lib/storage/mockStorage';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStateSynced?: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({ isOpen, onClose, onStateSynced }) => {
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  }>({
    tested: false,
    success: false,
    message: '',
  });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const projectUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
  const projectId = 'pbzaaskftrmnvocczhat';

  useEffect(() => {
    if (isOpen && !connectionStatus.tested) {
      handleTestConnection();
    }
  }, [isOpen]);

  const handleTestConnection = async () => {
    setTesting(true);
    setSyncResult(null);
    try {
      const res = await testSupabaseConnection();
      setConnectionStatus({
        tested: true,
        success: res.success,
        message: res.message,
      });
    } catch (e: unknown) {
      setConnectionStatus({
        tested: true,
        success: false,
        message: e instanceof Error ? e.message : 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncToSupabase = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const state = db.getState();
      const res = await supabaseService.seedInitialData(state);
      if (res.success) {
        setSyncResult('✅ ' + res.message);
        if (onStateSynced) onStateSynced();
      } else {
        setSyncResult('⚠️ ' + res.message + ' (Make sure tables are created in Supabase SQL editor first).');
      }
    } catch (err: unknown) {
      setSyncResult('❌ ' + (err instanceof Error ? err.message : 'Sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyMigrationPath = () => {
    navigator.clipboard.writeText('supabase/migrations/20260909_init_student_expense_schema.sql');
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Supabase Backend Hub
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  {projectId}
                </span>
              </h2>
              <p className="text-xs text-slate-400">PostgreSQL Cloud Database & Row-Level Security Integration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Connection Status Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-slate-200">Database Connection</span>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-emerald-400' : ''}`} />
                {testing ? 'Testing...' : 'Check Status'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
              {testing ? (
                <RefreshCw className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
              ) : connectionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-slate-300 truncate">{projectUrl}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {connectionStatus.tested ? connectionStatus.message : 'Checking connection...'}
                </p>
              </div>
            </div>
          </div>

          {/* Database Schema & Migration Status */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-slate-200">PostgreSQL Schema & RLS Migration</span>
              </div>
              <span className="text-xs px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 font-mono">
                10 Tables + RLS
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              We generated the complete schema script containing tables, constraints, security definer functions, and Row-Level Security policies.
            </p>

            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between">
              <span className="truncate">supabase/migrations/20260909_init_student_expense_schema.sql</span>
              <button
                onClick={handleCopyMigrationPath}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex-shrink-0 ml-2"
              >
                <Copy className="w-3 h-3" />
                {copiedSql ? 'Copied Path!' : 'Copy Path'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`https://supabase.com/dashboard/project/${projectId}/sql`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                Open Supabase SQL Editor in Browser
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Seed / Sync Action */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-200">Sync Campus Ledger to Supabase</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Push your current demo roommates, rooms, expenses, and splits to the live cloud database.
                </p>
              </div>
              <button
                onClick={handleSyncToSupabase}
                disabled={syncing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Cloud'}
              </button>
            </div>

            {syncResult && (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 animate-in fade-in">
                {syncResult}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
          <span>Target: <span className="font-mono text-slate-300">https://pbzaaskftrmnvocczhat.supabase.co</span></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
