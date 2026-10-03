-- Migration: 20261003130000_comprehensive_live_sync_hardening.sql
-- Description: Adds profiles and room_invitations to supabase_realtime publication,
--              and sets REPLICA IDENTITY FULL on profiles, expense_splits, room_invitations, and personal_expenses.

-- 1. Configure REPLICA IDENTITY FULL for complete change payloads
ALTER TABLE IF EXISTS public.profiles REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.expense_splits REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.room_invitations REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.personal_expenses REPLICA IDENTITY FULL;

-- 2. Add missing tables to supabase_realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'profiles'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'room_invitations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.room_invitations;
    END IF;
  END IF;
END $$;
