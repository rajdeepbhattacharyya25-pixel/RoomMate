-- Migration: Add upi_id to profiles table
-- Supports extracted and verified UPI VPA storage associated with payment QR codes

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS upi_id TEXT DEFAULT NULL;

-- Index for fast lookup when querying roommates' payment addresses
CREATE INDEX IF NOT EXISTS idx_profiles_upi_id ON profiles(upi_id) WHERE upi_id IS NOT NULL;
