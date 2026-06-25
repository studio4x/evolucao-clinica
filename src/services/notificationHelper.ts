import { supabase } from '../supabaseClient';

export interface NotificationPayload {
  userId?: string;
  title: string;
  content: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
  source?: 'manual' | 'platform';
}

/**
 * Envia uma notificação (In-App, Push e E-mail) chamando o backend do servidor.
 */
export async function sendNotification(payload: NotificationPayload) {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      console.warn('[NotificationHelper] Usuário não está logado. Notificação não disparada.');
      return;
    }

    const res = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        ...payload,
        source: payload.source || 'manual'
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[NotificationHelper] Erro do servidor ao enviar notificação:', errData.error || res.statusText);
    } else {
      console.log('[NotificationHelper] Notificação disparada com sucesso.');
    }
  } catch (err) {
    console.error('[NotificationHelper] Falha na rede ao enviar notificação:', err);
  }
}
