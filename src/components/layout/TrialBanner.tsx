import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Sparkles, CreditCard } from 'lucide-react';

export default function TrialBanner() {
  const { subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();

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
    <div className="bg-gradient-to-r from-brand-primary/95 to-brand-primary bg-brand-primary text-white py-2 px-4 shadow-md flex items-center justify-between text-xs md:text-sm font-medium z-40 relative">
      <div className="flex items-center space-x-2 mx-auto md:mx-0">
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse flex-shrink-0" />
        <span>
          Você está utilizando o <strong>teste gratuito de 7 dias</strong>.{' '}
          {daysRemaining === 1 ? (
            <span>Resta apenas <strong>1 dia</strong> antes do fim do trial.</span>
          ) : daysRemaining === 0 ? (
            <span>Seu teste gratuito <strong>termina hoje</strong>!</span>
          ) : (
            <span>Restam <strong>{daysRemaining} dias</strong> de acesso completo.</span>
          )}
        </span>
      </div>
      
      <Link 
        to="/painel/subscription" 
        className="hidden md:flex items-center space-x-1.5 bg-white text-brand-primary px-3 py-1 rounded-lg text-xs font-bold shadow hover:bg-brand-bg transition-colors duration-200"
      >
        <CreditCard className="w-3.5 h-3.5" />
        <span>Assinar Plano</span>
      </Link>
    </div>
  );
}
