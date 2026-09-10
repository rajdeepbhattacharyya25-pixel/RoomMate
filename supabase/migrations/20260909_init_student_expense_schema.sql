-- ============================================================================
-- Student Expense App - Supabase Production Schema & RLS Policies
-- Target Project: pbzaaskftrmnvocczhat
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. PROFILES (Extends auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('SUPER_ADMIN', 'STUDENT')),
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for profile queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ----------------------------------------------------------------------------
-- 2. USER SUBSCRIPTIONS & EVENTS (SaaS Monetization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'FREE' CHECK (plan_code IN ('FREE', 'PRO', 'CAMPUS_MAX')),
  plan_name TEXT NOT NULL DEFAULT 'Free Campus Starter',
  price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED')),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now() + INTERVAL '30 days'),
  grace_period_until TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.user_subscriptions(status);

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user ON public.subscription_events(user_id);

-- ----------------------------------------------------------------------------
-- 3. ROOMS & INVITATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_rooms_created_by ON public.rooms(created_by);
CREATE INDEX IF NOT EXISTS idx_rooms_archived ON public.rooms(is_archived);

CREATE TABLE IF NOT EXISTS public.room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ROOM_ADMIN', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  left_at TIMESTAMPTZ,
  CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_room ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON public.room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_status ON public.room_members(status);

CREATE TABLE IF NOT EXISTS public.room_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  invite_code VARCHAR(12) NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.room_invitations(invite_code);
CREATE INDEX IF NOT EXISTS idx_invitations_room ON public.room_invitations(room_id);

-- ----------------------------------------------------------------------------
-- 4. PERSONAL EXPENSES (Private Vault)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personal_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN ('Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other')),
  notes TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_user_date ON public.personal_expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_personal_expenses_category ON public.personal_expenses(category);

-- ----------------------------------------------------------------------------
-- 5. SHARED EXPENSES & SPLITS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  paid_by UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
  category TEXT NOT NULL CHECK (category IN ('Rent', 'Electricity', 'Groceries', 'Water', 'Wi-Fi', 'Gas', 'Cleaning', 'Food', 'Other')),
  split_method TEXT NOT NULL CHECK (split_method IN ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES')),
  notes TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_shared_expenses_room_date ON public.shared_expenses(room_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_paid_by ON public.shared_expenses(paid_by);

CREATE TABLE IF NOT EXISTS public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_expense_id UUID NOT NULL REFERENCES public.shared_expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_amount NUMERIC(12, 2) NOT NULL CHECK (share_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_splits_expense ON public.expense_splits(shared_expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user ON public.expense_splits(user_id);

-- ----------------------------------------------------------------------------
-- 6. SETTLEMENT PAYMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES public.profiles(id),
  payee_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI', 'CASH', 'BANK_TRANSFER', 'OTHER')),
  transaction_ref TEXT,
  notes TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_settlements_room_date ON public.settlement_payments(room_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_payer ON public.settlement_payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_settlements_payee ON public.settlement_payments(payee_id);

-- ----------------------------------------------------------------------------
-- 7. AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. TRIGGERS & UTILITY FUNCTIONS
-- ----------------------------------------------------------------------------

-- Universal updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_rooms_updated_at ON public.rooms;
CREATE TRIGGER set_rooms_updated_at
BEFORE UPDATE ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_personal_expenses_updated_at ON public.personal_expenses;
CREATE TRIGGER set_personal_expenses_updated_at
BEFORE UPDATE ON public.personal_expenses
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_shared_expenses_updated_at ON public.shared_expenses;
CREATE TRIGGER set_shared_expenses_updated_at
BEFORE UPDATE ON public.shared_expenses
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Auto create profile upon auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'STUDENT'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create default free subscription
  INSERT INTO public.user_subscriptions (user_id, plan_code, plan_name, price_inr, status)
  VALUES (
    NEW.id,
    'FREE',
    'Free Campus Starter',
    0.00,
    'TRIAL'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 9. SECURITY DEFINER HELPER FUNCTIONS FOR RLS (No Recursion)
-- ----------------------------------------------------------------------------

-- Check active room membership
CREATE OR REPLACE FUNCTION public.is_room_member(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = check_room_id
      AND user_id = check_user_id
      AND status = 'ACTIVE'
  );
$$;

-- Check room admin status
CREATE OR REPLACE FUNCTION public.is_room_admin(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = check_room_id
      AND user_id = check_user_id
      AND role = 'ROOM_ADMIN'
      AND status = 'ACTIVE'
  );
$$;

-- Check super admin status
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id
      AND role = 'SUPER_ADMIN'
  );
$$;

-- ----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

-- PERSONAL EXPENSES (Strict 100% Privacy Vault)
DROP POLICY IF EXISTS "Personal expenses are strictly isolated to owner" ON public.personal_expenses;
CREATE POLICY "Personal expenses are strictly isolated to owner"
ON public.personal_expenses FOR ALL
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- ROOMS
DROP POLICY IF EXISTS "Users can view rooms they are members of or created" ON public.rooms;
CREATE POLICY "Users can view rooms they are members of or created"
ON public.rooms FOR SELECT
TO authenticated
USING (
  created_by = (SELECT auth.uid()) OR
  public.is_room_member(id, (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Users can create rooms" ON public.rooms;
CREATE POLICY "Users can create rooms"
ON public.rooms FOR INSERT
TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Room admins or creators can update rooms" ON public.rooms;
CREATE POLICY "Room admins or creators can update rooms"
ON public.rooms FOR UPDATE
TO authenticated
USING (
  created_by = (SELECT auth.uid()) OR
  public.is_room_admin(id, (SELECT auth.uid()))
);

-- ROOM MEMBERS
DROP POLICY IF EXISTS "Members can view roommate roster" ON public.room_members;
CREATE POLICY "Members can view roommate roster"
ON public.room_members FOR SELECT
TO authenticated
USING (
  public.is_room_member(room_id, (SELECT auth.uid())) OR
  user_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Users can join rooms via valid invitation or creator" ON public.room_members;
CREATE POLICY "Users can join rooms via valid invitation or creator"
ON public.room_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid()) OR
  public.is_room_admin(room_id, (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admins or self can update member status" ON public.room_members;
CREATE POLICY "Admins or self can update member status"
ON public.room_members FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid()) OR
  public.is_room_admin(room_id, (SELECT auth.uid()))
);

-- ROOM INVITATIONS
DROP POLICY IF EXISTS "Room members can view room invitations" ON public.room_invitations;
CREATE POLICY "Room members can view room invitations"
ON public.room_invitations FOR SELECT
TO authenticated
USING (public.is_room_member(room_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Room admins can create invitations" ON public.room_invitations;
CREATE POLICY "Room admins can create invitations"
ON public.room_invitations FOR INSERT
TO authenticated
WITH CHECK (
  public.is_room_admin(room_id, (SELECT auth.uid())) OR
  created_by = (SELECT auth.uid())
);

-- SHARED EXPENSES
DROP POLICY IF EXISTS "Room members can view shared expenses" ON public.shared_expenses;
CREATE POLICY "Room members can view shared expenses"
ON public.shared_expenses FOR SELECT
TO authenticated
USING (public.is_room_member(room_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Room members can create shared expenses" ON public.shared_expenses;
CREATE POLICY "Room members can create shared expenses"
ON public.shared_expenses FOR INSERT
TO authenticated
WITH CHECK (
  public.is_room_member(room_id, (SELECT auth.uid())) AND
  created_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Creators or room admins can update shared expenses" ON public.shared_expenses;
CREATE POLICY "Creators or room admins can update shared expenses"
ON public.shared_expenses FOR UPDATE
TO authenticated
USING (
  (created_by = (SELECT auth.uid()) OR public.is_room_admin(room_id, (SELECT auth.uid()))) AND
  public.is_room_member(room_id, (SELECT auth.uid()))
);

-- EXPENSE SPLITS
DROP POLICY IF EXISTS "Room members can view splits of shared expenses" ON public.expense_splits;
CREATE POLICY "Room members can view splits of shared expenses"
ON public.expense_splits FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shared_expenses se
    WHERE se.id = expense_splits.shared_expense_id
      AND public.is_room_member(se.room_id, (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "Room members can insert splits" ON public.expense_splits;
CREATE POLICY "Room members can insert splits"
ON public.expense_splits FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shared_expenses se
    WHERE se.id = expense_splits.shared_expense_id
      AND public.is_room_member(se.room_id, (SELECT auth.uid()))
  )
);

-- SETTLEMENT PAYMENTS
DROP POLICY IF EXISTS "Room members can view settlements" ON public.settlement_payments;
CREATE POLICY "Room members can view settlements"
ON public.settlement_payments FOR SELECT
TO authenticated
USING (public.is_room_member(room_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Payers can record settlements" ON public.settlement_payments;
CREATE POLICY "Payers can record settlements"
ON public.settlement_payments FOR INSERT
TO authenticated
WITH CHECK (
  payer_id = (SELECT auth.uid()) AND
  public.is_room_member(room_id, (SELECT auth.uid()))
);

-- USER SUBSCRIPTIONS
DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
ON public.user_subscriptions FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- AUDIT LOGS
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);
