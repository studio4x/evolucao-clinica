import { supabase } from '../supabaseClient';

export async function convertEvolutionToTemplate(text: string, templateId: string | null): Promise<string> {
  // "Sem template" significa restaurar a transcrição recebida exatamente como
  // foi registrada, sem envolver IA nem tentar reescrever o conteúdo.
  if (!templateId) return text;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sua sessão expirou. Faça login novamente.');

  const response = await fetch('/api/ai/convert-evolution-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ text, templateId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.text) throw new Error(result.error || 'Não foi possível converter a evolução.');
  return result.text;
}
