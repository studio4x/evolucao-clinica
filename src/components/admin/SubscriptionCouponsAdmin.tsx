import React, { useEffect, useState } from 'react';
import { Check, Loader2, Percent, Plus, Tag, XCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Coupon = {
  id: string; code: string; discount_type: 'percentage' | 'fixed_amount'; discount_value: number;
  duration: 'once' | 'forever' | 'repeating'; duration_in_months: number | null;
  applicable_plans: string[]; active: boolean; starts_at: string | null; expires_at: string | null; created_at: string;
};

const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

export default function SubscriptionCouponsAdmin() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', discountType: 'percentage' as Coupon['discount_type'], value: '', duration: 'once' as Coupon['duration'], months: '1', monthly: true, yearly: true, startsAt: '', expiresAt: '' });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('subscription_coupons').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message); else setCoupons((data || []) as Coupon[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setError('');
    const code = normalizeCode(form.code); const value = Number(form.value);
    const plans = [form.monthly && 'monthly', form.yearly && 'yearly'].filter(Boolean);
    if (code.length < 3) return setError('Informe um código com pelo menos 3 caracteres.');
    if (!Number.isFinite(value) || value <= 0 || (form.discountType === 'percentage' && value > 100)) return setError('Informe um desconto válido.');
    if (!plans.length) return setError('Selecione pelo menos um plano.');
    setSaving(true);
    const { error } = await supabase.from('subscription_coupons').insert({
      code, discount_type: form.discountType, discount_value: value, duration: form.duration,
      duration_in_months: form.duration === 'repeating' ? Number(form.months) : null,
      applicable_plans: plans, starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
    });
    setSaving(false);
    if (error) return setError(error.code === '23505' ? 'Este código já existe.' : error.message);
    setForm({ code: '', discountType: 'percentage', value: '', duration: 'once', months: '1', monthly: true, yearly: true, startsAt: '', expiresAt: '' });
    setMessage(`Cupom ${code} criado com sucesso.`); void load();
  };

  const setActive = async (coupon: Coupon) => {
    setError('');
    const { error } = await supabase.from('subscription_coupons').update({ active: !coupon.active, updated_at: new Date().toISOString() }).eq('id', coupon.id);
    if (error) setError(error.message); else void load();
  };
  const formatDiscount = (coupon: Coupon) => coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(coupon.discount_value);
  const durationText = (coupon: Coupon) => coupon.duration === 'once' ? 'Somente na 1ª cobrança' : coupon.duration === 'forever' ? 'Em todas as cobranças' : `Por ${coupon.duration_in_months} meses`;

  return <div className="space-y-6">
    <div className="card border border-brand-border/60 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-brand-primary/10 p-3 text-brand-primary"><Tag size={24} /></div><div><h2 className="text-xl font-display font-bold text-brand-primary">Cupons de desconto</h2><p className="mt-0.5 text-xs text-brand-text-muted">Crie códigos aplicados de forma segura no checkout da Stripe.</p></div></div>
      {message && <div className="mb-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><Check size={18} />{message}</div>}
      {error && <div className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><XCircle size={18} />{error}</div>}
      <form onSubmit={create} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-brand-text">Código<input required value={form.code} onChange={e => setForm({ ...form, code: normalizeCode(e.target.value) })} placeholder="EX: BEMVINDO20" className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 font-mono uppercase outline-none focus:border-brand-primary" /></label>
        <label className="text-xs font-semibold text-brand-text">Forma do desconto<select value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value as Coupon['discount_type'] })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5"><option value="percentage">Percentual (%)</option><option value="fixed_amount">Valor fixo (R$)</option></select></label>
        <label className="text-xs font-semibold text-brand-text">{form.discountType === 'percentage' ? 'Percentual' : 'Valor em reais'}<input required type="number" min="0.01" max={form.discountType === 'percentage' ? 100 : undefined} step="0.01" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5" /></label>
        <label className="text-xs font-semibold text-brand-text">Aplicação<select value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value as Coupon['duration'] })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5"><option value="once">Apenas primeira cobrança</option><option value="forever">Todas as cobranças</option><option value="repeating">Número de meses</option></select></label>
        {form.duration === 'repeating' && <label className="text-xs font-semibold text-brand-text">Quantidade de meses<input type="number" min="1" max="36" value={form.months} onChange={e => setForm({ ...form, months: e.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5" /></label>}
        <div className="text-xs font-semibold text-brand-text">Planos válidos<div className="mt-1.5 flex gap-4 rounded-xl border border-brand-border px-3 py-2.5"><label><input type="checkbox" checked={form.monthly} onChange={e => setForm({ ...form, monthly: e.target.checked })} /> Mensal</label><label><input type="checkbox" checked={form.yearly} onChange={e => setForm({ ...form, yearly: e.target.checked })} /> Anual</label></div></div>
        <label className="text-xs font-semibold text-brand-text">Início (opcional)<input type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5" /></label>
        <label className="text-xs font-semibold text-brand-text">Expiração (opcional)<input type="datetime-local" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5" /></label>
        <div className="flex items-end"><button disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}Criar cupom</button></div>
      </form>
    </div>
    <div className="card overflow-hidden border border-brand-border/60 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-brand-border/60 p-5"><Percent size={18} className="text-brand-primary" /><h3 className="font-bold text-brand-text">Cupons criados</h3></div>{loading ? <div className="p-10 text-center"><Loader2 className="mx-auto animate-spin text-brand-primary" /></div> : coupons.length === 0 ? <p className="p-8 text-center text-sm text-brand-text-muted">Nenhum cupom criado.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-brand-bg/50 text-brand-text-muted"><tr><th className="p-4">Código</th><th className="p-4">Desconto</th><th className="p-4">Aplicação</th><th className="p-4">Planos</th><th className="p-4">Validade</th><th className="p-4 text-right">Status</th></tr></thead><tbody>{coupons.map(coupon => <tr key={coupon.id} className="border-t border-brand-border/40"><td className="p-4 font-mono font-bold text-brand-primary">{coupon.code}</td><td className="p-4">{formatDiscount(coupon)}</td><td className="p-4">{durationText(coupon)}</td><td className="p-4">{coupon.applicable_plans.map(p => p === 'monthly' ? 'Mensal' : 'Anual').join(', ')}</td><td className="p-4">{coupon.expires_at ? new Date(coupon.expires_at).toLocaleString('pt-BR') : 'Sem expiração'}</td><td className="p-4 text-right"><button type="button" onClick={() => void setActive(coupon)} className={`rounded-full px-3 py-1 font-semibold ${coupon.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{coupon.active ? 'Ativo' : 'Inativo'}</button></td></tr>)}</tbody></table></div>}</div>
  </div>;
}
