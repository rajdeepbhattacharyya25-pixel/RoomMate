-- ==============================================================================
-- ROOMMATE OTA UPDATES - APP VERSIONS SCHEMA & STORAGE POLICIES
-- ==============================================================================

-- 1. Create table for tracking OTA live update releases
create table if not exists public.app_versions (
    id uuid primary key default gen_random_uuid(),
    version text not null,                          -- e.g. "1.0.1"
    channel text not null check (channel in ('staging', 'production')),
    bundle_url text not null,                       -- Public URL to the zipped dist bundle
    checksum text not null,                         -- SHA-256 hex string
    changelog text,
    min_native_version text not null default '1.0.0', -- Minimum APK version required
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    published_at timestamptz default now()
);

-- 2. Performance indexes
create index if not exists idx_app_versions_channel_active 
on public.app_versions (channel, is_active, published_at desc);

-- 3. Row Level Security (RLS)
alter table public.app_versions enable row level security;

-- Client-safe SELECT policy: Mobile apps can ONLY read versions marked active
drop policy if exists "Allow read access to active app versions" on public.app_versions;
create policy "Allow read access to active app versions"
on public.app_versions
for select
to anon, authenticated
using (is_active = true);

-- Write/update/delete operations are denied to anon/authenticated clients by default.
-- Only Service Role (used by our CLI release scripts) can insert or update releases.

-- 4. Storage Bucket: app-updates
insert into storage.buckets (id, name, public)
values ('app-updates', 'app-updates', true)
on conflict (id) do update set public = true;

-- Storage Read Policy: Allow anyone to download OTA bundles from public bucket
drop policy if exists "Allow public download of app-updates" on storage.objects;
create policy "Allow public download of app-updates"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'app-updates');

-- Storage Upload & Update Policy: Allow releases upload to app-updates
drop policy if exists "Allow upload to app-updates" on storage.objects;
create policy "Allow upload to app-updates"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'app-updates');

drop policy if exists "Allow update to app-updates" on storage.objects;
create policy "Allow update to app-updates"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'app-updates');

-- 5. Atomic release management RPC (publish, promote, rollback)
create or replace function public.manage_ota_release(
    p_action text, -- 'publish', 'promote', 'rollback'
    p_version text,
    p_channel text,
    p_bundle_url text default null,
    p_checksum text default null,
    p_changelog text default null,
    p_min_native_version text default '1.0.0'
)
returns json
language plpgsql
security definer
as $$
declare
    v_record json;
begin
    if p_action = 'publish' then
        update public.app_versions
        set is_active = false
        where channel = p_channel;

        insert into public.app_versions (
            version, channel, bundle_url, checksum, changelog, min_native_version, is_active, published_at
        ) values (
            p_version, p_channel, p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, now()
        )
        returning row_to_json(public.app_versions.*) into v_record;

        return json_build_object('success', true, 'record', v_record);

    elsif p_action = 'promote' then
        update public.app_versions
        set is_active = false
        where channel = 'production';

        insert into public.app_versions (
            version, channel, bundle_url, checksum, changelog, min_native_version, is_active, published_at
        ) values (
            p_version, 'production', p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, now()
        )
        returning row_to_json(public.app_versions.*) into v_record;

        return json_build_object('success', true, 'record', v_record);

    elsif p_action = 'rollback' then
        update public.app_versions
        set is_active = false
        where channel = p_channel;

        update public.app_versions
        set is_active = true
        where channel = p_channel and version = p_version;

        return json_build_object('success', true, 'version', p_version);
    else
        raise exception 'Unknown action: %', p_action;
    end if;
end;
$$;

