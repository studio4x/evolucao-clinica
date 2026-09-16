-- Fase 2C. Staging hwkdwinfckmjoriqxbjk ONLY; apply via Management API.
-- No external transport/cron/Stripe/production changes.
BEGIN;
ALTER TABLE public.organization_invitations ADD COLUMN token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0);
CREATE TABLE private.organization_invitation_deliveries (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.organization_invitations(id) ON DELETE CASCADE,
  actor_professional_id uuid NOT NULL REFERENCES public.professionals(id),
  delivery_attempt integer NOT NULL CHECK (delivery_attempt > 0),
  provider text NOT NULL CHECK (provider IN ('smtp', 'mock')),
  provider_message_id text CHECK (char_length(provider_message_id) <= 200),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at timestamptz, failed_at timestamptz,
  error_code text CHECK (error_code IS NULL OR error_code IN ('transport_failed', 'transport_unavailable')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (invitation_id, delivery_attempt)
);
CREATE INDEX invitation_deliveries_actor ON private.organization_invitation_deliveries(actor_professional_id, created_at);
CREATE TABLE private.organization_invitation_handoffs (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.organization_invitations(id) ON DELETE CASCADE,
  invitation_version integer NOT NULL,
  handoff_secret_hash bytea NOT NULL UNIQUE CHECK (octet_length(handoff_secret_hash) = 32),
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX invitation_handoffs_invitation ON private.organization_invitation_handoffs(invitation_id, expires_at);
ALTER TABLE private.organization_invitation_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.organization_invitation_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.organization_invitation_deliveries, private.organization_invitation_handoffs FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE private.organization_admin_events DROP CONSTRAINT organization_admin_events_event_type_check;
ALTER TABLE private.organization_admin_events ADD CONSTRAINT organization_admin_events_event_type_check CHECK(event_type IN (
 'organization_created','organization_rollout_enabled','organization_rollout_disabled','owner_transferred',
 'member_suspended','member_reactivated','member_removed','member_role_changed','member_clinical_access_enabled','member_clinical_access_disabled',
 'invitation_created','invitation_revoked','invitation_accepted','invitation_expired',
 'invitation_resent','invitation_delivery_sent','invitation_delivery_failed'
));
-- This server-only gate does not depend on auth.uid() for unauthenticated
-- handoff. Actor authorization is checked separately on every admin/accept RPC.
CREATE FUNCTION private.invitation_feature_enabled(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
 SELECT EXISTS(SELECT 1 FROM private.runtime_environment WHERE id=true AND environment_name='staging')
 AND private.is_clinic_global_enabled()
 AND EXISTS(SELECT 1 FROM public.organization_feature_flags WHERE organization_id=p_org AND feature_key='clinic' AND enabled=true);
$$;
REVOKE ALL ON FUNCTION private.invitation_feature_enabled(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Lock order everywhere: organization -> subscription -> invitation -> handoff.
CREATE FUNCTION private.invitation_assert_admin(p_org uuid, p_actor uuid, p_role text, p_expand boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE v_role text; v_status text;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM private.organization_subscriptions WHERE organization_id=p_org FOR UPDATE;
 SELECT membership_role INTO v_role FROM public.organization_memberships
 WHERE organization_id=p_org AND professional_id=p_actor AND status='active' FOR SHARE;
 SELECT operational_status INTO v_status FROM public.organizations WHERE id=p_org;
 IF v_role IS NULL OR v_role NOT IN ('owner','manager') OR (v_role='manager' AND p_role IS DISTINCT FROM 'professional')
 OR NOT private.invitation_feature_enabled(p_org)
 OR NOT private.is_organization_subscription_structurally_valid(p_org)
 OR private.organization_entitlement_mode(p_org)='none'
 OR (p_expand AND (v_status IS DISTINCT FROM 'active' OR private.organization_entitlement_mode(p_org)<>'full')) THEN
  RAISE EXCEPTION 'invitation authorization required' USING ERRCODE='42501';
 END IF;
END; $$;
-- Resends participate in the existing configured limits; no weaker alternate limit.
CREATE OR REPLACE FUNCTION private.enforce_clinic_invitation_rate_limit(p_organization_id uuid,p_actor_professional_id uuid,p_normalized_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE v private.clinic_invitation_rate_limits; n timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO v FROM private.clinic_invitation_rate_limits WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'rate limit unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('clinic_invitation_org:'||p_organization_id::text,0));
 IF (SELECT count(*) FROM (
   SELECT invited_by actor,created_at FROM public.organization_invitations WHERE organization_id=p_organization_id
   UNION ALL SELECT d.actor_professional_id,d.created_at FROM private.organization_invitation_deliveries d
   JOIN public.organization_invitations i ON i.id=d.invitation_id WHERE i.organization_id=p_organization_id AND d.delivery_attempt>1
 ) q WHERE actor=p_actor_professional_id AND created_at>=n-make_interval(secs=>v.actor_window_seconds))>=v.actor_limit
 OR (SELECT count(*) FROM (
   SELECT created_at FROM public.organization_invitations WHERE organization_id=p_organization_id
   UNION ALL SELECT d.created_at FROM private.organization_invitation_deliveries d JOIN public.organization_invitations i ON i.id=d.invitation_id
   WHERE i.organization_id=p_organization_id AND d.delivery_attempt>1
 ) q WHERE created_at>=n-make_interval(secs=>v.organization_window_seconds))>=v.organization_limit
 OR (SELECT count(*) FROM (
   SELECT created_at FROM public.organization_invitations WHERE organization_id=p_organization_id AND normalized_email=p_normalized_email
   UNION ALL SELECT d.created_at FROM private.organization_invitation_deliveries d JOIN public.organization_invitations i ON i.id=d.invitation_id
   WHERE i.organization_id=p_organization_id AND i.normalized_email=p_normalized_email AND d.delivery_attempt>1
 ) q WHERE created_at>=n-make_interval(secs=>v.recipient_window_seconds))>=v.recipient_limit THEN
  RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001';
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION private.issue_clinic_invitation(
  p_organization_id uuid,
  p_actor uuid,
  p_email text,
  p_intended_role text,
  p_intended_clinical_access boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := p_actor;
  v_actor_role text;
  v_token text;
  v_invitation public.organization_invitations;
  v_subscription private.organization_subscriptions;
  v_usage record;
  v_expired_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  PERFORM private.invitation_assert_admin(p_organization_id, v_actor, p_intended_role, true);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'organization cannot accept invitations' USING ERRCODE = '42501';
  END IF;
  SELECT m.membership_role INTO v_actor_role
    FROM public.organization_memberships AS m
   WHERE m.organization_id = p_organization_id
     AND m.professional_id = v_actor
     AND m.status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'manager')
     OR (v_actor_role = 'manager' AND p_intended_role <> 'professional') THEN
    RAISE EXCEPTION 'invitation issuer authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_intended_role IS NULL OR p_intended_role NOT IN ('manager', 'professional')
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR char_length(v_email) > 320 THEN
    RAISE EXCEPTION 'invitation input is invalid' USING ERRCODE = '22023';
  END IF;

  -- The subscription row serializes every operation that can consume a seat.
  SELECT * INTO v_subscription
    FROM private.organization_subscriptions
   WHERE organization_id = p_organization_id
   FOR UPDATE;
  PERFORM private.enforce_clinic_invitation_rate_limit(p_organization_id, v_actor, v_email);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || v_email, 0)
  );
  UPDATE public.organization_invitations
     SET status = 'expired', updated_at = clock_timestamp()
   WHERE organization_id = p_organization_id
     AND normalized_email = v_email
     AND status = 'pending'
     AND expires_at <= clock_timestamp()
  RETURNING id INTO v_expired_id;
  IF v_expired_id IS NOT NULL THEN
    PERFORM private.record_organization_admin_event(
      p_event_type => 'invitation_expired',
      p_organization_id => p_organization_id,
      p_actor_professional_id => v_actor,
      p_invitation_id => v_expired_id,
      p_old_status => 'pending',
      p_new_status => 'expired',
      p_reason => 'logical expiration during invitation issuance'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_invitations AS i
     WHERE i.organization_id = p_organization_id
       AND i.normalized_email = v_email
       AND i.status = 'pending'
       AND i.expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'pending invitation already exists' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.organization_memberships AS m
      JOIN auth.users AS u ON u.id = m.professional_id
     WHERE m.organization_id = p_organization_id
       AND lower(btrim(u.email)) = v_email
       AND m.status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'invitation cannot be issued for this recipient' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_intended_clinical_access, false) IS TRUE THEN
    SELECT * INTO v_usage FROM private.get_organization_seat_usage(p_organization_id);
    IF v_usage.available_seats < 1 THEN
      RAISE EXCEPTION 'no clinical seats available' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.organization_invitations (
    organization_id, normalized_email, intended_role, intended_clinical_access,
    token_hash, status, expires_at, invited_by
  )
  VALUES (
    p_organization_id, v_email, p_intended_role, coalesce(p_intended_clinical_access, false),
    extensions.digest(v_token, 'sha256'), 'pending', clock_timestamp() + interval '72 hours', v_actor
  )
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    'invitation_created', p_organization_id, 'authenticated', v_actor,
    NULL, NULL, v_invitation.id, NULL, NULL, NULL, 'pending', NULL
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'normalized_email', v_invitation.normalized_email,
    'intended_role', v_invitation.intended_role,
    'intended_clinical_access', v_invitation.intended_clinical_access,
    'expires_at', v_invitation.expires_at,
    'status', 'pending',
    'token', v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.accept_clinic_invitation(p_invitation_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private, public
AS $$
DECLARE
  v_actor uuid := p_actor;
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.organization_invitations;
  v_org public.organizations;
  v_subscription private.organization_subscriptions;
  v_existing public.organization_memberships;
  v_membership public.organization_memberships;
  v_usage record;
BEGIN
  IF v_actor IS NULL OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
    FROM auth.users AS u
   WHERE u.id = v_actor;
  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'email_unconfirmed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_invitation
    FROM public.organization_invitations
   WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  -- Preserve the established lock order. The invitation's valid pending row
  -- owns the reservation that is converted below.
  SELECT * INTO v_org
    FROM public.organizations
   WHERE id = v_invitation.organization_id
   FOR UPDATE;
  SELECT * INTO v_subscription
    FROM private.organization_subscriptions
   WHERE organization_id = v_invitation.organization_id
   FOR UPDATE;
  SELECT * INTO v_invitation
    FROM public.organization_invitations
   WHERE id = v_invitation.id
   FOR UPDATE;
  IF v_invitation.status = 'expired' THEN
    RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired', 'accepted', false);
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.expires_at <= clock_timestamp() THEN
    UPDATE public.organization_invitations
       SET status = 'expired', updated_at = clock_timestamp()
     WHERE id = v_invitation.id AND status = 'pending';
    PERFORM private.record_organization_admin_event(
      p_event_type => 'invitation_expired',
      p_organization_id => v_invitation.organization_id,
      p_actor_professional_id => v_actor,
      p_invitation_id => v_invitation.id,
      p_old_status => 'pending',
      p_new_status => 'expired',
      p_reason => 'logical expiration during invitation acceptance'
    );
    RETURN jsonb_build_object('invitation_id', v_invitation.id, 'status', 'expired', 'accepted', false);
  END IF;
  IF v_org.id IS NULL
     OR v_org.operational_status <> 'active'
     OR v_subscription.id IS NULL
     OR NOT private.is_organization_subscription_structurally_valid(v_invitation.organization_id)
     OR NOT private.invitation_feature_enabled(v_invitation.organization_id)
     OR private.organization_entitlement_mode(v_invitation.organization_id) <> 'full'
 THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;
  IF v_email <> v_invitation.normalized_email THEN
    RAISE EXCEPTION 'email_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE id = v_actor) THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '23503';
  END IF;
  SELECT m.* INTO v_existing
    FROM public.organization_memberships AS m
   WHERE m.organization_id = v_invitation.organization_id
     AND m.professional_id = v_actor
     AND m.status <> 'removed'
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  IF v_invitation.intended_clinical_access IS TRUE THEN
    SELECT * INTO v_usage
      FROM private.get_organization_seat_usage(v_invitation.organization_id);
    -- The pending invitation itself is already counted in reserved_seats.
    -- Validate the invariant, but never demand a second available seat.
    IF v_usage.contracted_seats IS NULL
       OR v_usage.active_seats + v_usage.reserved_seats > v_usage.contracted_seats
       OR v_usage.reserved_seats < 1 THEN
      RAISE EXCEPTION 'clinical invitation reservation is invalid' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.organization_memberships (
    organization_id, professional_id, membership_role, status, clinical_access_enabled, created_by
  )
  VALUES (
    v_invitation.organization_id, v_actor, v_invitation.intended_role, 'active',
    v_invitation.intended_clinical_access, v_invitation.invited_by
  )
  RETURNING * INTO v_membership;
  UPDATE public.organization_invitations
     SET status = 'accepted', accepted_by = v_actor, accepted_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = v_invitation.id
  RETURNING * INTO v_invitation;
  PERFORM private.record_organization_admin_event(
    'invitation_accepted', v_invitation.organization_id, 'authenticated', v_actor,
    v_actor, v_membership.id, v_invitation.id, NULL, NULL, 'pending', 'accepted', NULL
  );
  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'organization_id', v_membership.organization_id,
    'membership_id', v_membership.id,
    'membership_role', v_membership.membership_role,
    'status', v_invitation.status,
    'intended_clinical_access', v_invitation.intended_clinical_access,
    'clinical_access_enabled', v_membership.clinical_access_enabled
  );
END;
$$;


CREATE FUNCTION private.invitation_expire(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE i public.organization_invitations;
BEGIN
 UPDATE public.organization_invitations SET status='expired',updated_at=clock_timestamp()
 WHERE id=p_id AND status='pending' AND expires_at<=clock_timestamp() RETURNING * INTO i;
 IF FOUND THEN
  PERFORM private.record_organization_admin_event('invitation_expired',i.organization_id,'system',NULL,NULL,NULL,i.id,NULL,NULL,'pending','expired',NULL);
 END IF;
END; $$;
CREATE FUNCTION public.issue_organization_invitation_server(p_organization_id uuid,p_actor uuid,p_email text,p_intended_role text,p_intended_clinical_access boolean,p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE result jsonb; d uuid;
BEGIN
 IF p_provider NOT IN ('smtp','mock') OR p_provider IS NULL THEN RAISE EXCEPTION 'invalid provider' USING ERRCODE='22023'; END IF;
 result:=private.issue_clinic_invitation(p_organization_id,p_actor,p_email,p_intended_role,p_intended_clinical_access);
 INSERT INTO private.organization_invitation_deliveries(invitation_id,actor_professional_id,delivery_attempt,provider)
 VALUES((result->>'invitation_id')::uuid,p_actor,1,p_provider) RETURNING id INTO d;
 RETURN result||jsonb_build_object('delivery_id',d,'organization_name',(SELECT name FROM public.organizations WHERE id=p_organization_id));
END; $$;
CREATE FUNCTION public.resend_organization_invitation_server(p_organization_id uuid,p_actor uuid,p_invitation_id uuid,p_provider text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE i public.organization_invitations; t text; d uuid; attempt integer;
BEGIN
 PERFORM private.invitation_assert_admin(p_organization_id,p_actor,'professional',true);
 SELECT * INTO i FROM public.organization_invitations WHERE id=p_invitation_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM private.invitation_assert_admin(p_organization_id,p_actor,i.intended_role,true);
 PERFORM private.invitation_expire(i.id);
 SELECT * INTO i FROM public.organization_invitations WHERE id=i.id;
 IF i.status<>'pending' THEN RETURN jsonb_build_object('status',i.status); END IF;
 IF i.updated_at>clock_timestamp()-interval '60 seconds' THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001'; END IF;
 PERFORM private.enforce_clinic_invitation_rate_limit(p_organization_id,p_actor,i.normalized_email);
 t:=encode(extensions.gen_random_bytes(32),'hex');
 UPDATE public.organization_invitations SET token_hash=extensions.digest(t,'sha256'),token_version=token_version+1,
 expires_at=clock_timestamp()+interval '72 hours',updated_at=clock_timestamp() WHERE id=i.id RETURNING * INTO i;
 UPDATE private.organization_invitation_handoffs SET consumed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE invitation_id=i.id AND consumed_at IS NULL;
 SELECT coalesce(max(delivery_attempt),0)+1 INTO attempt FROM private.organization_invitation_deliveries WHERE invitation_id=i.id;
 INSERT INTO private.organization_invitation_deliveries(invitation_id,actor_professional_id,delivery_attempt,provider)
 VALUES(i.id,p_actor,attempt,p_provider) RETURNING id INTO d;
 PERFORM private.record_organization_admin_event('invitation_resent',p_organization_id,'authenticated',p_actor,NULL,NULL,i.id,NULL,NULL,'pending','pending',NULL);
 RETURN jsonb_build_object('invitation_id',i.id,'delivery_id',d,'token',t,'normalized_email',i.normalized_email,
 'organization_name',(SELECT name FROM public.organizations WHERE id=p_organization_id),'intended_role',i.intended_role,
 'intended_clinical_access',i.intended_clinical_access,'expires_at',i.expires_at,'status',i.status);
END; $$;
CREATE FUNCTION public.finish_organization_invitation_delivery_server(p_delivery_id uuid,p_status text,p_message_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE d private.organization_invitation_deliveries; org uuid;
BEGIN
 IF p_status NOT IN ('sent','failed') OR p_status IS NULL THEN RAISE EXCEPTION 'invalid delivery status' USING ERRCODE='22023'; END IF;
 -- The supplied ID is generated locally, not derived from a provider response containing a secret.
 IF p_message_id IS NOT NULL AND p_message_id!~'^[a-f0-9-]{36}@staging[.]evolucaoclinica[.]app[.]br$' THEN RAISE EXCEPTION 'invalid message id' USING ERRCODE='22023'; END IF;
 UPDATE private.organization_invitation_deliveries SET status=p_status,provider_message_id=p_message_id,
 sent_at=CASE WHEN p_status='sent' THEN clock_timestamp() END,failed_at=CASE WHEN p_status='failed' THEN clock_timestamp() END,
 error_code=CASE WHEN p_status='failed' THEN 'transport_failed' END,updated_at=clock_timestamp()
 WHERE id=p_delivery_id AND status='pending' RETURNING * INTO d;
 IF FOUND THEN
 SELECT organization_id INTO org FROM public.organization_invitations WHERE id=d.invitation_id;
 PERFORM private.record_organization_admin_event(CASE WHEN p_status='sent' THEN 'invitation_delivery_sent' ELSE 'invitation_delivery_failed' END,
 org,'system',NULL,NULL,NULL,d.invitation_id,NULL,NULL,'pending',p_status,NULL);
 END IF;
END; $$;
CREATE FUNCTION public.list_organization_invitations_server(p_organization_id uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE role text; result jsonb; item record;
BEGIN
 PERFORM private.invitation_assert_admin(p_organization_id,p_actor,'professional',false);
 SELECT membership_role INTO role FROM public.organization_memberships WHERE organization_id=p_organization_id AND professional_id=p_actor AND status='active';
 FOR item IN SELECT id FROM public.organization_invitations WHERE organization_id=p_organization_id AND status='pending' ORDER BY id FOR UPDATE LOOP
  PERFORM private.invitation_expire(item.id);
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('invitation_id',i.id,'normalized_email',i.normalized_email,'intended_role',i.intended_role,
 'intended_clinical_access',i.intended_clinical_access,'status',i.status,'expires_at',i.expires_at,
 'invited_by',i.invited_by,'delivery_status',coalesce(d.status,'pending'),'sent_at',d.sent_at,
 'delivery_attempt',d.delivery_attempt)),'[]'::jsonb) INTO result
 FROM public.organization_invitations i LEFT JOIN LATERAL (
 SELECT status,sent_at,delivery_attempt FROM private.organization_invitation_deliveries WHERE invitation_id=i.id ORDER BY delivery_attempt DESC LIMIT 1
 ) d ON true WHERE i.organization_id=p_organization_id AND i.status='pending' AND (role='owner' OR i.intended_role='professional');
 RETURN result;
END; $$;
CREATE FUNCTION public.revoke_organization_invitation_server(p_organization_id uuid,p_actor uuid,p_invitation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE i public.organization_invitations;
BEGIN
 PERFORM private.invitation_assert_admin(p_organization_id,p_actor,'professional',false);
 SELECT * INTO i FROM public.organization_invitations WHERE id=p_invitation_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM private.invitation_assert_admin(p_organization_id,p_actor,i.intended_role,false);
 PERFORM private.invitation_expire(i.id);
 SELECT * INTO i FROM public.organization_invitations WHERE id=i.id;
 IF i.status<>'pending' THEN RETURN jsonb_build_object('status',i.status); END IF;
 UPDATE public.organization_invitations SET status='revoked',revoked_by=p_actor,revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=i.id;
 UPDATE private.organization_invitation_handoffs SET consumed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE invitation_id=i.id AND consumed_at IS NULL;
 PERFORM private.record_organization_admin_event('invitation_revoked',p_organization_id,'authenticated',p_actor,NULL,NULL,i.id,NULL,NULL,'pending','revoked',NULL);
 RETURN jsonb_build_object('status','revoked');
END; $$;
CREATE FUNCTION private.invitation_lock(p_id uuid)
RETURNS public.organization_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE i public.organization_invitations;
BEGIN
 SELECT * INTO i FROM public.organization_invitations WHERE id=p_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.organizations WHERE id=i.organization_id FOR UPDATE;
 PERFORM 1 FROM private.organization_subscriptions WHERE organization_id=i.organization_id FOR UPDATE;
 SELECT * INTO i FROM public.organization_invitations WHERE id=p_id FOR UPDATE;
 PERFORM private.invitation_expire(i.id);
 SELECT * INTO i FROM public.organization_invitations WHERE id=p_id;
 RETURN i;
END; $$;
CREATE FUNCTION public.create_organization_invitation_handoff_server(p_token_hash text,p_secret_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE i public.organization_invitations; id uuid;
BEGIN
 IF p_token_hash!~'^[a-f0-9]{64}$' OR p_secret_hash!~'^[a-f0-9]{64}$' OR p_token_hash IS NULL OR p_secret_hash IS NULL THEN
 RAISE EXCEPTION 'invalid handoff' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.organization_invitations WHERE token_hash=decode(p_token_hash,'hex');
 i:=private.invitation_lock(i.id);
 IF i.id IS NULL OR i.status<>'pending' OR encode(i.token_hash,'hex')<>p_token_hash
 OR NOT private.invitation_feature_enabled(i.organization_id) OR private.organization_entitlement_mode(i.organization_id)<>'full' THEN
 RETURN jsonb_build_object('status','unavailable'); END IF;
 DELETE FROM private.organization_invitation_handoffs WHERE invitation_id=i.id AND (expires_at<=clock_timestamp() OR consumed_at IS NOT NULL);
 IF (SELECT count(*) FROM private.organization_invitation_handoffs WHERE invitation_id=i.id)>=10 THEN
 RETURN jsonb_build_object('status','unavailable'); END IF;
 INSERT INTO private.organization_invitation_handoffs(invitation_id,invitation_version,handoff_secret_hash,expires_at)
 VALUES(i.id,i.token_version,decode(p_secret_hash,'hex'),least(i.expires_at,clock_timestamp()+interval '45 minutes')) RETURNING private.organization_invitation_handoffs.id INTO id;
 RETURN jsonb_build_object('status','pending');
END; $$;
CREATE FUNCTION public.resolve_organization_invitation_handoff_server(p_secret_hash text,p_actor uuid DEFAULT NULL,p_accept boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public AS $$
DECLARE h private.organization_invitation_handoffs; i public.organization_invitations; result jsonb;
BEGIN
 IF p_secret_hash IS NULL OR p_secret_hash!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT * INTO h FROM private.organization_invitation_handoffs WHERE handoff_secret_hash=decode(p_secret_hash,'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 i:=private.invitation_lock(h.invitation_id);
 SELECT * INTO h FROM private.organization_invitation_handoffs WHERE id=h.id FOR UPDATE;
 IF i.id IS NULL OR h.id IS NULL OR h.consumed_at IS NOT NULL OR h.expires_at<=clock_timestamp()
 OR h.invitation_version<>i.token_version OR i.status<>'pending'
 OR NOT private.invitation_feature_enabled(i.organization_id) OR private.organization_entitlement_mode(i.organization_id)<>'full' THEN
 RETURN jsonb_build_object('status','unavailable'); END IF;
 IF p_accept THEN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  result:=private.accept_clinic_invitation(i.id,p_actor);
  UPDATE private.organization_invitation_handoffs SET consumed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=h.id;
  RETURN result;
 END IF;
 RETURN jsonb_build_object('status','pending','organization_name',(SELECT name FROM public.organizations WHERE id=i.organization_id),
 'intended_role',i.intended_role,'intended_clinical_access',i.intended_clinical_access,'expires_at',i.expires_at);
END; $$;

-- Remove all browser entrypoints carrying raw tokens and the old lock-order revoke.
REVOKE ALL ON FUNCTION public.create_organization_invitation(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.revoke_organization_invitation(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Raw issuance helpers execute only inside the trusted wrappers.
REVOKE ALL ON FUNCTION private.invitation_assert_admin(uuid,uuid,text,boolean),
 private.issue_clinic_invitation(uuid,uuid,text,text,boolean),private.accept_clinic_invitation(uuid,uuid),
 private.invitation_expire(uuid),private.invitation_lock(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.issue_organization_invitation_server(uuid,uuid,text,text,boolean,text),
 public.resend_organization_invitation_server(uuid,uuid,uuid,text),
 public.finish_organization_invitation_delivery_server(uuid,text,text),
 public.list_organization_invitations_server(uuid,uuid),public.revoke_organization_invitation_server(uuid,uuid,uuid),
 public.create_organization_invitation_handoff_server(text,text),
 public.resolve_organization_invitation_handoff_server(text,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue_organization_invitation_server(uuid,uuid,text,text,boolean,text),
 public.resend_organization_invitation_server(uuid,uuid,uuid,text),
 public.finish_organization_invitation_delivery_server(uuid,text,text),
 public.list_organization_invitations_server(uuid,uuid),public.revoke_organization_invitation_server(uuid,uuid,uuid),
 public.create_organization_invitation_handoff_server(text,text),
 public.resolve_organization_invitation_handoff_server(text,uuid,boolean) TO service_role;
COMMIT;
