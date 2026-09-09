import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Sparkles, CreditCard } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function TrialBanner() {
  const { user, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const [activationManaged, setActivationManaged] = useState(false);
  const [trialActivated, setTrialActivated] = useState(false);

  useEffect(() => {
    if (!user?.id || subscriptionPlan !== 'trial') return;
    let active = true;
    void supabase
      .from('professionals')
      .select('trial_activation_deadline_at, trial_activated_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error) return;
        setActivationManaged(Boolean(data?.trial_activation_deadline_at));
        setTrialActivated(Boolean(data?.trial_activated_at));
      });
    return () => { active = false; };
  }, [subscriptionPlan, user?.id]);

  if (subscriptionPlan !== 'trial' || subscriptionStatus !== 'trialing') {
    return null;
  }

  const now = new Date();
  const endsAtDate = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  const isExpired = endsAtDate ? endsAtDate < now : false;

  if (isExpired) {
    return null; // A tela de bloqueio da rota principal já vai tratar o redirecionamento.
  }

  let daysRemaining = 0;
  if (endsAtDate) {
    const diffTime = Math.abs(endsAtDate.getTime() - now.getTime());
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="bg-gradient-to-r from-brand-primary/95 to-brand-primary bg-brand-primary text-white py-2 px-3 sm:px-4 shadow-md flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs md:text-sm font-medium z-30 relative">
      <div className="flex items-center space-x-2 min-w-0">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse flex-shrink-0" />
        <span>
          {activationManaged && !trialActivated ? (
            <>Conclua sua <strong>primeira evolução</strong> para iniciar seus 7 dias completos. Você tem {daysRemaining === 1 ? <strong>1 dia</strong> : <strong>{daysRemaining} dias</strong>} para concluir esta etapa.</>
          ) : daysRemaining === 1 ? (
            <span>Resta apenas <strong>1 dia</strong> para conhecer as funcionalidades disponíveis no período de avaliação.</span>
          ) : daysRemaining === 0 ? (
            <span>Seu teste gratuito <strong>termina hoje</strong>!</span>
          ) : (
            <span>Restam <strong>{daysRemaining} dias</strong> para conhecer as funcionalidades disponíveis no período de avaliação.</span>
          )}
        </span>
      </div>
      
      <Link 
        to="/painel/subscription" 
        className="flex w-full sm:w-auto shrink-0 items-center justify-center space-x-1.5 bg-white text-brand-primary px-3 py-1.5 rounded-lg text-xs font-bold shadow hover:bg-brand-bg transition-colors duration-200"
      >
        <CreditCard className="w-3.5 h-3.5" />
        <span>Assinar Plano</span>
      </Link>
    </div>
  );
}
