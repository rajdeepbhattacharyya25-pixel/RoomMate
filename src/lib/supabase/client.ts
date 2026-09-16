import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
const processEnv = typeof globalThis !== 'undefined' ? (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env : undefined;
const env = metaEnv || processEnv || {};

const supabaseUrl = (env.VITE_SUPABASE_URL as string) || '';
const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string) || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project-ref.supabase.co' &&
  supabaseAnonKey !== 'your-publishable-or-anon-key'
);

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key', 
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
});

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string; details?: unknown }> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: 'Supabase URL or Key not configured.',
    };
  }

  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) {
      // Table might not exist yet if migration hasn't been run
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase project! (Tables pending migration).',
          details: error,
        };
      }
      return {
        success: false,
        message: error.message,
        details: error,
      };
    }
    return {
      success: true,
      message: 'Connected to Supabase project and verified database access.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown connection error',
      details: err,
    };
  }
}
