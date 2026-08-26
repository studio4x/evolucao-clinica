create table if not exists public.acquisition_telemetry_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'acquisition_arrival',
    'consent_banner_shown',
    'marketing_consent_granted',
    'meta_config_loaded',
    'meta_config_failed',
    'meta_script_requested',
    'meta_pixel_initialized',
    'meta_pageview_queued'
  )),
  pathname text not null check (pathname ~ '^/[A-Za-z0-9/_-]{1,120}$'),
  channel text not null check (channel in (
    'google_ads', 'google_organic', 'meta_ads', 'youtube', 'whatsapp',
    'email', 'referral', 'direct', 'other', 'unknown'
  )),
  campaign_present boolean not null default false,
  platform text check (platform in ('web', 'pwa', 'android')),
  distribution text check (distribution in ('google_play')),
  created_at timestamptz not null default now()
);

create index if not exists acquisition_telemetry_events_created_at_idx
  on public.acquisition_telemetry_events (created_at desc);
create index if not exists acquisition_telemetry_events_event_name_idx
  on public.acquisition_telemetry_events (event_name, created_at desc);

alter table public.acquisition_telemetry_events enable row level security;
revoke all on public.acquisition_telemetry_events from anon, authenticated;
grant all on public.acquisition_telemetry_events to service_role;
