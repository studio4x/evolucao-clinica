CREATE OR REPLACE FUNCTION public.process_whatsapp_opt_out(
  p_event_id text,
  p_phone_number text,
  p_phone_hash text,
  p_source text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_existing uuid; v_users uuid[]; v_user_id uuid; v_already boolean;
BEGIN
  IF p_event_id IS NOT NULL THEN
    INSERT INTO public.whatsapp_opt_out_events(event_id, phone_hash, source, reason, status, received_at)
    VALUES (p_event_id, p_phone_hash, p_source, p_reason, 'processing', now())
    ON CONFLICT (event_id) DO NOTHING RETURNING id INTO v_existing;
    IF v_existing IS NULL THEN RETURN jsonb_build_object('status', 'already_processed', 'alreadyProcessed', true); END IF;
  END IF;
  SELECT array_agg(user_id) INTO v_users FROM (SELECT user_id FROM public.communication_preferences WHERE whatsapp_number = p_phone_number LIMIT 2) found;
  IF coalesce(array_length(v_users, 1), 0) > 1 THEN
    IF p_event_id IS NOT NULL THEN UPDATE public.whatsapp_opt_out_events SET status='conflict', processed_at=now() WHERE id=v_existing; ELSE INSERT INTO public.whatsapp_opt_out_events(phone_hash,source,reason,status,received_at,processed_at) VALUES(p_phone_hash,p_source,p_reason,'conflict',now(),now()); END IF;
    RETURN jsonb_build_object('status','conflict','alreadyProcessed',false);
  END IF;
  v_user_id := v_users[1];
  IF v_user_id IS NULL THEN
    IF p_event_id IS NOT NULL THEN UPDATE public.whatsapp_opt_out_events SET status='not_found', processed_at=now() WHERE id=v_existing; ELSE INSERT INTO public.whatsapp_opt_out_events(phone_hash,source,reason,status,received_at,processed_at) VALUES(p_phone_hash,p_source,p_reason,'not_found',now(),now()); END IF;
    RETURN jsonb_build_object('status','not_found','alreadyProcessed',false);
  END IF;
  SELECT whatsapp_opt_in IS NOT TRUE AND whatsapp_enabled IS NOT TRUE INTO v_already FROM public.communication_preferences WHERE user_id=v_user_id;
  IF NOT v_already THEN UPDATE public.communication_preferences SET whatsapp_opt_in=false, whatsapp_enabled=false, whatsapp_opt_out_at=now(), whatsapp_opt_out_source=p_source, whatsapp_opt_out_reason=p_reason WHERE user_id=v_user_id; END IF;
  IF p_event_id IS NOT NULL THEN UPDATE public.whatsapp_opt_out_events SET user_id=v_user_id, status=CASE WHEN v_already THEN 'already_opted_out' ELSE 'processed' END, processed_at=now() WHERE id=v_existing; ELSE INSERT INTO public.whatsapp_opt_out_events(user_id,phone_hash,source,reason,status,received_at,processed_at) VALUES(v_user_id,p_phone_hash,p_source,p_reason,CASE WHEN v_already THEN 'already_opted_out' ELSE 'processed' END,now(),now()); END IF;
  RETURN jsonb_build_object('status', CASE WHEN v_already THEN 'already_opted_out' ELSE 'processed' END, 'alreadyProcessed', v_already);
END; $$;

ALTER TABLE public.whatsapp_opt_out_events DROP CONSTRAINT IF EXISTS whatsapp_opt_out_events_status_check;
ALTER TABLE public.whatsapp_opt_out_events ADD CONSTRAINT whatsapp_opt_out_events_status_check CHECK (status IN ('processing','processed','already_opted_out','not_found','conflict'));
REVOKE ALL ON FUNCTION public.process_whatsapp_opt_out(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_whatsapp_opt_out(text,text,text,text,text) TO service_role;
