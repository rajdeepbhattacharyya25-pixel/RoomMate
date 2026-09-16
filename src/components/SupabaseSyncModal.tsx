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

  const projectUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
  const projectId = 'pbzaaskftrmnvocczhat';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-slate-900">
                  Supabase Backend Hub
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-medium">
                  {projectId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                PostgreSQL Cloud Database & Row-Level Security Integration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Connection Status Card */}
          <div className="p-4 rounded-xl bg-[#f8faff] border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-900">Database Connection</span>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs hover:bg-slate-50 transition-colors font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin text-indigo-600' : ''}`} />
                {testing ? 'Testing...' : 'Check Status'}
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
              {testing ? (
                <RefreshCw className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
              ) : connectionStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-slate-800 font-medium truncate">{projectUrl}</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  {connectionStatus.tested ? connectionStatus.message : 'Checking live connection...'}
                </p>
              </div>
            </div>
          </div>

          {/* Database Schema & Migration Status */}
          <div className="p-4 rounded-xl bg-[#f8faff] border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-900">PostgreSQL Schema & RLS Migration</span>
              </div>
              <span className="text-xs px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-mono font-medium">
                10 Tables + RLS
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              We generated the complete schema script containing tables, constraints, security definer functions, and Row-Level Security policies.
            </p>

            <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs font-mono text-slate-800 flex items-center justify-between shadow-2xs">
              <span className="truncate">supabase/migrations/20260909_init_student_expense_schema.sql</span>
              <button
                onClick={handleCopyMigrationPath}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors flex-shrink-0 ml-2 font-sans font-medium"
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
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                Open Supabase SQL Editor in Browser
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Seed / Sync Action */}
          <div className="p-4 rounded-xl bg-[#f8faff] border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Sync Campus Ledger to Supabase</h4>
                <p className="text-xs text-slate-500 mt-0.5">
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
              <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-700 shadow-2xs animate-in fade-in">
                {syncResult}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>Target: <span className="font-mono text-slate-700 font-medium">https://{projectId}.supabase.co</span></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium transition-colors shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
