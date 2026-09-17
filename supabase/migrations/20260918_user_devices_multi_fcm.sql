-- Migration: Multi-Device FCM Device Tokens
-- Supports multiple simultaneous devices per user (phone, tablet, web) with Row Level Security

CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    fcm_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_devices_user_device_unique UNIQUE (user_id, device_id)
);

-- Index for speedy recipient token resolution in send-push
CREATE INDEX IF NOT EXISTS idx_user_devices_lookup 
ON public.user_devices(user_id, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_devices_token 
ON public.user_devices(fcm_token);

-- Row Level Security
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 1. Users can select their own devices
CREATE POLICY "Users can view own registered devices"
ON public.user_devices
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 2. Users can insert their own devices
CREATE POLICY "Users can register own devices"
ON public.user_devices
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own devices
CREATE POLICY "Users can update own devices"
ON public.user_devices
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Users can delete/deactivate their own devices
CREATE POLICY "Users can delete own devices"
ON public.user_devices
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 5. Service role has full management access (for backend Edge Function queries)
CREATE POLICY "Service role full access on user_devices"
ON public.user_devices
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant permissions
GRANT ALL ON TABLE public.user_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_devices TO authenticated;
