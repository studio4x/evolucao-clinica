import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Mail, XCircle } from 'lucide-react';

export default function Unsubscribe() {
  const [step, setStep] = useState<'confirm' | 'unsubscribing' | 'success' | 'cancelled' | 'error'>('confirm');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token') || '';
    setToken(t);
    if (!t) {
      setStep('error');
      setMessage('Token de descadastro ausente ou inválido.');
    }
  }, []);

  const handleConfirm = async () => {
    setStep('unsubscribing');
    try {
      const response = await fetch('/api/communication/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const payload = await response.json();
      if (response.ok) {
        setStep('success');
        setMessage(payload.message || 'Sua solicitação foi processada com sucesso. Você não receberá mais nossos e-mails de relacionamento.');
      } else {
        setStep('error');
        setMessage(payload.error || 'Não foi possível processar o descadastro. Tente novamente mais tarde.');
      }
    } catch (err) {
      setStep('error');
      setMessage('Falha na comunicação com o servidor.');
    }
  };

  const handleCancel = () => {
    setStep('cancelled');
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-brand-border/60 shadow-sm p-8 md:p-10 text-center space-y-6 animate-fade-in">
        {step === 'confirm' && (
          <>
            <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 border border-amber-100">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-brand-text">Confirmar descadastro</h1>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Você tem certeza que deseja parar de receber nossos e-mails de dicas, atualizações e jornada de ativação?
              </p>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleConfirm}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors text-sm shadow-sm"
              >
                Sim, descadastrar meu e-mail
              </button>
              <button
                onClick={handleCancel}
                className="w-full py-2.5 px-4 bg-brand-bg hover:bg-brand-border/40 text-brand-text font-medium rounded-xl border border-brand-border/60 transition-colors text-sm"
              >
                Não, manter meu cadastro
              </button>
            </div>
          </>
        )}

        {step === 'unsubscribing' && (
          <div className="py-8 space-y-4 animate-pulse">
            <Loader2 className="mx-auto animate-spin text-brand-primary w-12 h-12" />
            <p className="text-sm text-brand-text-muted">Processando seu descadastro...</p>
          </div>
        )}

        {step === 'success' && (
          <>
            <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100">
              <CheckCircle2 size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-brand-text">Preferências atualizadas</h1>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                {message}
              </p>
            </div>
            <div className="pt-2">
              <a
                href="/"
                className="inline-block w-full py-2.5 px-4 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-xl font-medium transition-colors text-sm shadow-sm text-center"
              >
                Ir para o Início
              </a>
            </div>
          </>
        )}

        {step === 'cancelled' && (
          <>
            <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 border border-emerald-100 animate-fade-in">
              <Mail size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-brand-text">Cadastro mantido!</h1>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                Obrigado por continuar conosco! Você continuará recebendo nossas dicas e atualizações de ativação da plataforma.
              </p>
            </div>
            <div className="pt-2">
              <a
                href="/"
                className="inline-block w-full py-2.5 px-4 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-xl font-medium transition-colors text-sm shadow-sm text-center"
              >
                Ir para o Início
              </a>
            </div>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-600 border border-red-100">
              <XCircle size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-brand-text">Erro ao processar</h1>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                {message}
              </p>
            </div>
            <div className="pt-2">
              <a
                href="/"
                className="inline-block w-full py-2.5 px-4 bg-brand-bg hover:bg-brand-border/40 text-brand-text font-medium rounded-xl border border-brand-border/60 transition-colors text-sm text-center"
              >
                Ir para o Início
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
