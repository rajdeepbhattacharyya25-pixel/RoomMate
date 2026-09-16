-- ============================================================================
-- Migration: Add onboarding_completed to profiles & Backfill Existing Profiles
-- Target: public.profiles
-- ============================================================================

-- 1. Add onboarding_completed column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for quick filtering by onboarding status
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
ON public.profiles(onboarding_completed);

-- 3. Backfill existing completed profiles:
-- If an existing profile already has both a valid name and phone number, mark onboarding as completed.
UPDATE public.profiles
SET onboarding_completed = true
WHERE name IS NOT NULL AND TRIM(name) != ''
  AND phone IS NOT NULL AND TRIM(phone) != '';

-- 4. Update handle_new_user() trigger function to extract given name if available,
-- default onboarding_completed = false, and preserve profile integrity.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
BEGIN
  -- Extract first name from Google/OAuth metadata if present
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'given_name',
    NEW.raw_user_meta_data->>'first_name',
    split_part(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), ' ', 1),
    split_part(NEW.email, '@', 1),
    'Resident'
  );

  INSERT INTO public.profiles (id, email, name, role, onboarding_completed)
  VALUES (
    NEW.id,
    NEW.email,
    v_first_name,
    'STUDENT',
    false
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
