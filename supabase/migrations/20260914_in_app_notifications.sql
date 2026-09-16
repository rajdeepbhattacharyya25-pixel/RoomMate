-- ==============================================================================
-- ROOMMATE IN-APP NOTIFICATIONS SYSTEM
-- Migration: 20260914_in_app_notifications.sql
-- Description: Creates in_app_notifications table with RLS, indexes, and realtime.
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type TEXT,
    action_target TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    event_id TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. Indexes for fast retrieval & badge calculation
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
    ON public.in_app_notifications(user_id, is_read, is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_priority 
    ON public.in_app_notifications(user_id, priority, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_event 
    ON public.in_app_notifications(user_id, event_id) 
    WHERE event_id IS NOT NULL;

-- 3. Row Level Security (RLS)
ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.in_app_notifications FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to update (mark read, soft delete) their own notifications
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.in_app_notifications FOR UPDATE
    USING (auth.uid() = user_id);

-- Allow authenticated users to insert notifications targeted to users
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.in_app_notifications;
CREATE POLICY "Authenticated users can insert notifications"
    ON public.in_app_notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Enable Realtime Replication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'in_app_notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
    END IF;
END $$;
