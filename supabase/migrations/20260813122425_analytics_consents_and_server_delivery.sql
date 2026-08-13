-- Consent recorded per authenticated account allows server-side billing events
-- to honor the same analytics decision as the web and Android clients.
create table if not exists public.analytics_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  analytics_granted boolean not null default false,
  marketing_granted boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.analytics_consents enable row level security;

drop policy if exists "users manage their own analytics consent" on public.analytics_consents;
create policy "users manage their own analytics consent"
  on public.analytics_consents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- This table is backend-only. event_key is an immutable provider-confirmed
-- idempotency key (Stripe invoice or subscription period), never a patient or
-- clinical identifier.
create table if not exists public.analytics_event_deliveries (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in ('purchase', 'subscription_started', 'subscription_renewed', 'subscription_cancelled')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider text not null default 'stripe',
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analytics_event_deliveries_retry_idx
  on public.analytics_event_deliveries (status, created_at);

alter table public.analytics_event_deliveries enable row level security;

revoke all on table public.analytics_event_deliveries from anon, authenticated;
