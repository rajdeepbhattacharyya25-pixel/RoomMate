import React, { useState, useEffect, useCallback } from 'react';
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

  const projectUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const projectId = projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';

  const handleTestConnection = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (isOpen && !connectionStatus.tested) {
      handleTestConnection();
    }
  }, [isOpen, connectionStatus.tested, handleTestConnection]);

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
        setSyncResult('⚠️ ' + res.message + ' (Ensure tables exist in Supabase SQL editor first).');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#12121A] border border-slate-200/90 dark:border-[#27354A] rounded-2xl shadow-xl overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#27354A] bg-slate-50/70 dark:bg-[#181822]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  Supabase Backend Hub
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-medium">
                  {projectId}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                PostgreSQL Cloud Database & Row-Level Security Integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#20202A] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Connection Status Card */}
          <div className="p-4 rounded-xl bg-[#f8faff] dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Database Connection</span>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg bg-white dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] shadow-2xs hover:bg-slate-50 dark:hover:bg-[#282838] transition-colors font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
                {testing ? 'Testing...' : 'Check Status'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs bg-white dark:bg-[#20202A] p-3 rounded-lg border border-slate-200/80 dark:border-[#27354A] shadow-2xs">
              {testing ? (
                <RefreshCw className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
              ) : connectionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-slate-800 dark:text-slate-200 font-medium truncate">{projectUrl}</p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                  {connectionStatus.tested ? connectionStatus.message : 'Checking live connection...'}
                </p>
              </div>
            </div>
          </div>

          {/* Database Schema & Migration Status */}
          <div className="p-4 rounded-xl bg-[#f8faff] dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-semibold text-slate-900 dark:text-white">PostgreSQL Schema & RLS Migration</span>
              </div>
              <span className="text-xs px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800/60 font-mono font-medium">
                10 Tables + RLS
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              We generated the complete schema script containing tables, constraints, security definer functions, and Row-Level Security policies.
            </p>

            <div className="p-3 bg-white dark:bg-[#20202A] rounded-lg border border-slate-200 dark:border-[#27354A] text-xs font-mono text-slate-800 dark:text-slate-200 flex items-center justify-between shadow-2xs">
              <span className="truncate">supabase/migrations/20260909_init_student_expense_schema.sql</span>
              <button
                onClick={handleCopyMigrationPath}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#282838] hover:bg-slate-200 dark:hover:bg-[#323246] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27354A] transition-colors flex-shrink-0 ml-2 font-sans font-medium"
              >
                <Copy className="w-3 h-3" />
                {copiedSql ? 'Copied Path!' : 'Copy Path'}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-0.5">
              <a
                href={`https://supabase.com/dashboard/project/${projectId}/sql`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                Open Supabase SQL Editor in Browser
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Seed / Sync Action */}
          <div className="p-4 rounded-xl bg-[#f8faff] dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Sync Campus Ledger to Supabase</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Push your current demo roommates, rooms, expenses, and splits to the live cloud database.
                </p>
              </div>
              <button
                onClick={handleSyncToSupabase}
                disabled={syncing}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync to Cloud'}
              </button>
            </div>

            {syncResult && (
              <div className="p-3 rounded-lg bg-white dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] text-xs font-mono text-slate-700 dark:text-slate-300 shadow-2xs animate-in fade-in">
                {syncResult}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-[#27354A] bg-slate-50/70 dark:bg-[#181822] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Target: <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">https://{projectId}.supabase.co</span></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium transition-colors shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
