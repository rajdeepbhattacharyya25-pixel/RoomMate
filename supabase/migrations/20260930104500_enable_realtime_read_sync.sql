-- Migration: 20260930104500_enable_realtime_read_sync.sql
-- Description: Allow reliable SELECT access so Supabase Realtime CDC channels broadcast live events
-- to both Mobile and SuperAdmin clients without RLS null-auth suppression.

-- 1. Profiles
DROP POLICY IF EXISTS "Allow public read of profiles" ON public.profiles;
CREATE POLICY "Allow public read of profiles" ON public.profiles
FOR SELECT USING (true);

-- 2. Rooms
DROP POLICY IF EXISTS "Allow public read of active rooms" ON public.rooms;
CREATE POLICY "Allow public read of active rooms" ON public.rooms
FOR SELECT USING (true);

-- 3. Room Members
DROP POLICY IF EXISTS "Allow public read of room members" ON public.room_members;
CREATE POLICY "Allow public read of room members" ON public.room_members
FOR SELECT USING (true);

-- 4. Shared Expenses
DROP POLICY IF EXISTS "Allow public read of shared expenses" ON public.shared_expenses;
CREATE POLICY "Allow public read of shared expenses" ON public.shared_expenses
FOR SELECT USING (is_deleted = false);

-- 5. Expense Splits
DROP POLICY IF EXISTS "Allow public read of expense splits" ON public.expense_splits;
CREATE POLICY "Allow public read of expense splits" ON public.expense_splits
FOR SELECT USING (true);

-- 6. Settlement Payments
DROP POLICY IF EXISTS "Allow public read of settlement payments" ON public.settlement_payments;
CREATE POLICY "Allow public read of settlement payments" ON public.settlement_payments
FOR SELECT USING (true);

-- 7. Bug Reports
DROP POLICY IF EXISTS "Allow read of bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Submitter or superadmin can read bug reports" ON public.bug_reports;
CREATE POLICY "Allow read of bug reports" ON public.bug_reports
FOR SELECT USING (true);

-- 8. In-App Notifications
DROP POLICY IF EXISTS "Allow read of in app notifications" ON public.in_app_notifications;
CREATE POLICY "Allow read of in app notifications" ON public.in_app_notifications
FOR SELECT USING (true);

-- Ensure publication has replica identity full on rooms and notifications for complete payload broadcasting
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.in_app_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.bug_reports REPLICA IDENTITY FULL;
ALTER TABLE public.shared_expenses REPLICA IDENTITY FULL;
ALTER TABLE public.settlement_payments REPLICA IDENTITY FULL;
