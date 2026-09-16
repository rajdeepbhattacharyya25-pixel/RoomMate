-- ==============================================================================
-- ROOMMATE OTA UPDATES - APP NAME & BUILD TIMESTAMP ENHANCEMENTS
-- ==============================================================================

-- 1. Add app_name and build_time columns to app_versions
ALTER TABLE public.app_versions ADD COLUMN IF NOT EXISTS app_name text NOT NULL DEFAULT 'RoomMate';
ALTER TABLE public.app_versions ADD COLUMN IF NOT EXISTS build_time timestamptz DEFAULT now();

-- 2. Update manage_ota_release to accept p_app_name and p_build_time
CREATE OR REPLACE FUNCTION public.manage_ota_release(
    p_action text, -- 'publish', 'promote', 'rollback'
    p_version text,
    p_channel text,
    p_bundle_url text default null,
    p_checksum text default null,
    p_changelog text default null,
    p_min_native_version text default '1.0.0',
    p_app_name text default 'RoomMate',
    p_build_time timestamptz default now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record json;
BEGIN
    IF p_action = 'publish' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = p_channel;

        INSERT INTO public.app_versions (
            app_name, version, channel, bundle_url, checksum, changelog, min_native_version, is_active, build_time, published_at
        ) VALUES (
            coalesce(p_app_name, 'RoomMate'), p_version, p_channel, p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, coalesce(p_build_time, now()), now()
        )
        RETURNING row_to_json(public.app_versions.*) INTO v_record;

        RETURN json_build_object('success', true, 'record', v_record);

    ELSIF p_action = 'promote' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = 'production';

        INSERT INTO public.app_versions (
            app_name, version, channel, bundle_url, checksum, changelog, min_native_version, is_active, build_time, published_at
        ) VALUES (
            coalesce(p_app_name, 'RoomMate'), p_version, 'production', p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, coalesce(p_build_time, now()), now()
        )
        RETURNING row_to_json(public.app_versions.*) INTO v_record;

        RETURN json_build_object('success', true, 'record', v_record);

    ELSIF p_action = 'rollback' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = p_channel;

        UPDATE public.app_versions
        SET is_active = true
        WHERE channel = p_channel AND version = p_version;

        RETURN json_build_object('success', true, 'version', p_version);
    ELSE
        RAISE EXCEPTION 'Unknown action: %', p_action;
    END IF;
END;
$$;

-- 3. Dedicated channel-isolated query function
CREATE OR REPLACE FUNCTION public.get_latest_release(
    p_channel text,
    p_native_version text DEFAULT '1.0.0'
)
RETURNS TABLE (
    id uuid,
    app_name text,
    version text,
    channel text,
    bundle_url text,
    checksum text,
    changelog text,
    min_native_version text,
    is_active boolean,
    build_time timestamptz,
    published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT 
        v.id,
        v.app_name,
        v.version,
        v.channel,
        v.bundle_url,
        v.checksum,
        v.changelog,
        v.min_native_version,
        v.is_active,
        v.build_time,
        v.published_at
    FROM public.app_versions v
    WHERE v.channel = p_channel
      AND v.is_active = true
    ORDER BY v.published_at DESC
    LIMIT 1;
$$;
