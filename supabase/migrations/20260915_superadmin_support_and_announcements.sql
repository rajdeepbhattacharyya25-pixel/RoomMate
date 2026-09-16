-- ============================================================================
-- MIGRATION: SuperAdmin Support Desk, Platform Announcements & Global Config
-- Date: 2026-09-15
-- Target: SuperAdmin operations, user feedback reporting, and platform announcements
-- ============================================================================

-- 1. Bug Reports & Feature Suggestions Table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('BUG_REPORT', 'FEATURE_SUGGESTION', 'CONTACT_REQUEST')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'PLANNED', 'DECLINED')),
  screenshot_url TEXT,
  diagnostics JSONB DEFAULT '{}'::jsonb,
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_type_status ON public.support_tickets(ticket_type, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON public.support_tickets(created_at DESC);

-- Enable RLS on support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Students can insert their own support tickets
DROP POLICY IF EXISTS "Users can insert their own support tickets" ON public.support_tickets;
CREATE POLICY "Users can insert their own support tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_super_admin());

-- Students can view their own tickets; SuperAdmin can view all tickets
DROP POLICY IF EXISTS "Users can view own tickets or SuperAdmin view all" ON public.support_tickets;
CREATE POLICY "Users can view own tickets or SuperAdmin view all"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin());

-- Only SuperAdmin can update support tickets (status, admin notes)
DROP POLICY IF EXISTS "Only SuperAdmin can update support tickets" ON public.support_tickets;
CREATE POLICY "Only SuperAdmin can update support tickets"
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin());

-- 2. Platform Announcements Table
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'EVERYONE' CHECK (audience IN ('EVERYONE', 'SELECTED_USERS', 'SELECTED_ROOMS')),
  target_user_ids UUID[],
  target_room_ids UUID[],
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'IMPORTANT', 'CRITICAL')),
  delivery_channels TEXT[] NOT NULL DEFAULT ARRAY['IN_APP'],
  recipients_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DELIVERED' CHECK (status IN ('DRAFT', 'DELIVERED', 'FAILED')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_announcements_sent ON public.platform_announcements(sent_at DESC);

-- Enable RLS on platform_announcements
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view announcements
DROP POLICY IF EXISTS "Authenticated users can read announcements" ON public.platform_announcements;
CREATE POLICY "Authenticated users can read announcements"
  ON public.platform_announcements
  FOR SELECT
  TO authenticated
  USING (true);

-- Only SuperAdmin can insert or manage announcements
DROP POLICY IF EXISTS "Only SuperAdmin can manage announcements" ON public.platform_announcements;
CREATE POLICY "Only SuperAdmin can manage announcements"
  ON public.platform_announcements
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 3. Global Platform Settings Table
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global_settings',
  app_name TEXT NOT NULL DEFAULT 'RoomMate',
  support_email TEXT NOT NULL DEFAULT 'admin@roommate.app',
  support_phone TEXT NOT NULL DEFAULT '+91 98765 43210',
  google_auth_enabled BOOLEAN NOT NULL DEFAULT true,
  email_verification_required BOOLEAN NOT NULL DEFAULT true,
  session_timeout_minutes INT NOT NULL DEFAULT 1440,
  max_room_members INT NOT NULL DEFAULT 12,
  default_join_policy TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  default_invite_policy TEXT NOT NULL DEFAULT 'ALL_MEMBERS',
  qr_expiration_hours INT NOT NULL DEFAULT 72,
  max_expense_amount NUMERIC(12, 2) NOT NULL DEFAULT 200000.00,
  default_split_method TEXT NOT NULL DEFAULT 'EQUAL',
  currency_code TEXT NOT NULL DEFAULT 'INR',
  global_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  maintenance_mode BOOLEAN NOT NULL DEFAULT false,
  maintenance_message TEXT NOT NULL DEFAULT 'RoomMate is undergoing scheduled maintenance. Back online shortly!',
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Insert default row if not exists
INSERT INTO public.platform_settings (id) VALUES ('global_settings') ON CONFLICT (id) DO NOTHING;

-- Enable RLS on platform_settings
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;
CREATE POLICY "Anyone can read platform settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Only SuperAdmin can update platform settings" ON public.platform_settings;
CREATE POLICY "Only SuperAdmin can update platform settings"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
