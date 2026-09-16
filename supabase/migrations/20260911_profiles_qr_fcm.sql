-- Migration: Add upi_qr_url and fcm_token to profiles
-- Supports payment QR code uploads and cross-device push notifications

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS upi_qr_url TEXT DEFAULT NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fcm_token TEXT DEFAULT NULL;

-- Index for FCM token lookups when dispatching pushes to room members
CREATE INDEX IF NOT EXISTS idx_profiles_fcm_token ON profiles(fcm_token) WHERE fcm_token IS NOT NULL;
