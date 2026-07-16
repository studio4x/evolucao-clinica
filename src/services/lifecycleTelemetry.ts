import { supabase } from '../supabaseClient';

export type LifecycleFrontendEvent = 'patient_history_viewed' | 'feature_discovered' | 'document_area_viewed' | 'subscription_page_viewed' | 'support_opened';

export async function trackLifecycleEvent(
  eventName: LifecycleFrontendEvent,
  options: { entityType?: string; entityId?: string; metadata?: Record<string, unknown>; dedupeKey?: string } = {}
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    await fetch('/api/lifecycle/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ eventName, ...options })
    });
  } catch (error) {
    console.warn('[LifecycleTelemetry] evento ignorado:', error);
  }
}
