import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

export default function Unsubscribe() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    void fetch('/api/communication/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).then((response) => response.json()).then((payload) => setMessage(payload.message || 'Sua solicitação foi processada.')).catch(() => setMessage('Sua solicitação foi processada.')).finally(() => setLoading(false));
  }, []);
  return <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4"><div className="max-w-lg w-full bg-white rounded-2xl border border-brand-border shadow-sm p-8 text-center">{loading ? <Loader2 className="mx-auto animate-spin text-brand-primary" /> : <CheckCircle2 size={46} className="mx-auto text-emerald-600" />}<h1 className="text-2xl font-bold text-brand-text mt-4">Preferências atualizadas</h1><p className="text-brand-text-muted mt-2">{message}</p></div></div>;
}
