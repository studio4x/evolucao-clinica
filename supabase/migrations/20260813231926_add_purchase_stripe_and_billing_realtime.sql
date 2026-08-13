-- purchase_stripe is a web-stream acquisition event emitted only for the
-- first positive Stripe payment of a subscription. Existing generic purchase
-- remains the provider-agnostic revenue event.
alter table public.analytics_event_deliveries
  drop constraint if exists analytics_event_deliveries_event_name_check;

alter table public.analytics_event_deliveries
  add constraint analytics_event_deliveries_event_name_check
  check (event_name in (
    'purchase',
    'purchase_stripe',
    'subscription_started',
    'subscription_renewed',
    'subscription_cancelled'
  ));

-- Postgres Changes only emits rows for tables present in this publication.
-- The catalog check makes the migration safe on projects where Dashboard or
-- an earlier migration already added billing_subscriptions.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'billing_subscriptions'
  ) then
    alter publication supabase_realtime add table public.billing_subscriptions;
  end if;
end
$$;
