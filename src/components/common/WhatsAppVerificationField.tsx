import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, MessageCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  DEFAULT_WHATSAPP_COUNTRY,
  formatWhatsAppNationalNumber,
  getWhatsAppCountryCallingCode,
  getWhatsAppCountryOptions,
  normalizeRequiredWhatsAppNationalNumber,
  splitStoredWhatsAppNumber,
  type CountryCode,
} from '../../utils/whatsappNumber';

const WHATSAPP_COUNTRY_OPTIONS = getWhatsAppCountryOptions();

type WhatsAppOtpRequest = {
  requestId: string;
  maskedPhone: string;
  resendAvailableAt: number;
};

type WhatsAppVerificationFieldProps = {
  idPrefix: string;
  value: string | null;
  verifiedNumber: string | null;
  onChange: (phoneNumber: string) => void;
  onVerified: (phoneNumber: string) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
};

const digitsOnly = (value: string | null) => String(value || '').replace(/\D/g, '');

function composeWhatsAppNumber(country: CountryCode, nationalNumber: string): string {
  const nationalDigits = digitsOnly(nationalNumber);
  return nationalDigits ? `${getWhatsAppCountryCallingCode(country)}${nationalDigits}` : '';
}

export function WhatsAppVerificationField({
  idPrefix,
  value,
  verifiedNumber,
  onChange,
  onVerified,
  disabled = false,
  required = false,
  label = 'Número do WhatsApp',
}: WhatsAppVerificationFieldProps) {
  const initialValue = splitStoredWhatsAppNumber(value || '', DEFAULT_WHATSAPP_COUNTRY);
  const [country, setCountry] = useState<CountryCode>(initialValue.country);
  const [nationalNumber, setNationalNumber] = useState(initialValue.nationalNumber);
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpRequest, setOtpRequest] = useState<WhatsAppOtpRequest | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);

  const currentNumber = useMemo(
    () => composeWhatsAppNumber(country, nationalNumber),
    [country, nationalNumber],
  );
  const isVerified = Boolean(currentNumber && digitsOnly(verifiedNumber) === currentNumber);
  const isBusy = disabled || requesting || verifying;

  useEffect(() => {
    const externalNumber = digitsOnly(value);
    if (externalNumber === currentNumber) return;
    const nextValue = splitStoredWhatsAppNumber(externalNumber, DEFAULT_WHATSAPP_COUNTRY);
    setCountry(nextValue.country);
    setNationalNumber(nextValue.nationalNumber);
    setOtpRequest(null);
    setOtpCode('');
    setError('');
  }, [currentNumber, value]);

  useEffect(() => {
    if (!otpRequest) {
      setResendSeconds(0);
      return;
    }

    const updateCountdown = () => {
      setResendSeconds(Math.max(0, Math.ceil((otpRequest.resendAvailableAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [otpRequest]);

  const resetChallenge = () => {
    setOtpRequest(null);
    setOtpCode('');
    setError('');
  };

  const emitNumber = (nextCountry: CountryCode, nextNationalNumber: string) => {
    onChange(composeWhatsAppNumber(nextCountry, nextNationalNumber));
  };

  const requestCode = async () => {
    setError('');
    try {
      const normalizedNumber = normalizeRequiredWhatsAppNationalNumber(nationalNumber, country);
      setRequesting(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sua sessão não está disponível. Faça login novamente.');

      const response = await fetch('/api/onboarding/whatsapp-verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phoneNumber: normalizedNumber }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o código pelo WhatsApp.');

      onChange(normalizedNumber);
      if (payload.alreadyVerified === true) {
        onVerified(normalizedNumber);
        resetChallenge();
        return;
      }
      if (!payload.requestId) throw new Error('A solicitação do código não foi identificada. Tente novamente.');

      setOtpCode('');
      setOtpRequest({
        requestId: String(payload.requestId),
        maskedPhone: String(payload.maskedPhone || normalizedNumber),
        resendAvailableAt: Date.now() + (Number(payload.resendAfterSeconds) || 60) * 1000,
      });
    } catch (requestError: any) {
      setError(requestError.message || 'Não foi possível enviar o código pelo WhatsApp.');
    } finally {
      setRequesting(false);
    }
  };

  const verifyCode = async () => {
    if (!otpRequest) return;
    const normalizedCode = otpCode.replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError('Informe o código de 6 dígitos enviado pelo WhatsApp.');
      return;
    }

    setError('');
    try {
      setVerifying(true);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sua sessão não está disponível. Faça login novamente.');

      const response = await fetch('/api/onboarding/whatsapp-verification/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: otpRequest.requestId, code: normalizedCode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível confirmar o código.');

      const verifiedPhone = String(
        payload.phoneNumber || normalizeRequiredWhatsAppNationalNumber(nationalNumber, country),
      );
      onChange(verifiedPhone);
      onVerified(verifiedPhone);
      resetChallenge();
    } catch (verificationError: any) {
      setError(verificationError.message || 'Não foi possível confirmar o código.');
    } finally {
      setVerifying(false);
    }
  };

  const helpId = `${idPrefix}-help`;
  const errorId = `${idPrefix}-error`;

  return (
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-number`} className="block text-xs font-bold uppercase tracking-wider text-brand-text">
        {label}{required ? ' *' : ''}
      </label>

      <div className={`flex w-full overflow-hidden rounded-xl border bg-white shadow-sm transition-colors focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary ${error && !otpRequest ? 'border-red-400' : 'border-brand-border'}`}>
        <div className="relative flex shrink-0 items-center border-r border-brand-border bg-brand-bg/60">
          <div className="pointer-events-none flex min-w-[92px] items-center justify-center gap-1.5 px-3 text-sm font-semibold text-brand-text" aria-hidden="true">
            <span className="text-lg leading-none">
              {WHATSAPP_COUNTRY_OPTIONS.find((option) => option.code === country)?.flag}
            </span>
            <span>+{getWhatsAppCountryCallingCode(country)}</span>
            <ChevronDown className="h-3.5 w-3.5 text-brand-text-muted" />
          </div>
          <select
            id={`${idPrefix}-country`}
            aria-label="País do WhatsApp"
            title="Selecionar país e DDI"
            value={country}
            disabled={isBusy || Boolean(otpRequest)}
            onChange={(event) => {
              const nextCountry = event.target.value as CountryCode;
              const nextNationalNumber = formatWhatsAppNationalNumber(nationalNumber, nextCountry);
              setCountry(nextCountry);
              setNationalNumber(nextNationalNumber);
              emitNumber(nextCountry, nextNationalNumber);
              resetChallenge();
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          >
            {WHATSAPP_COUNTRY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag} {option.name} (+{option.callingCode})
              </option>
            ))}
          </select>
        </div>

        <input
          id={`${idPrefix}-number`}
          type="tel"
          required={required}
          inputMode="tel"
          autoComplete="tel"
          value={nationalNumber}
          onChange={(event) => {
            const nextNationalNumber = formatWhatsAppNationalNumber(event.target.value, country);
            setNationalNumber(nextNationalNumber);
            emitNumber(country, nextNationalNumber);
            resetChallenge();
          }}
          placeholder={country === 'BR' ? '(99) 99999-9999' : 'Número do WhatsApp'}
          disabled={isBusy || Boolean(otpRequest)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helpId}
          className="min-w-0 flex-1 border-0 bg-white px-3 py-3 text-sm text-brand-text outline-none ring-0 placeholder:text-brand-text-muted/70 focus:border-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={helpId} className="text-[10px] leading-relaxed text-brand-text-muted">
          A verificação por código confirma que este número pertence a você.
        </p>
        {isVerified && !otpRequest ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 size={14} /> WhatsApp verificado
          </span>
        ) : !otpRequest ? (
          <button
            type="button"
            onClick={() => void requestCode()}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requesting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {requesting ? 'Enviando...' : 'Verificar WhatsApp'}
          </button>
        ) : null}
      </div>

      {otpRequest && (
        <div className="space-y-3 rounded-xl border border-brand-primary/20 bg-brand-primary/[0.04] p-3">
          <div className="flex items-start gap-2 text-brand-text">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
            <p className="text-[11px] leading-relaxed">
              Código enviado para <strong>{otpRequest.maskedPhone}</strong>. Ele expira em 5 minutos.
            </p>
          </div>
          <input
            id={`${idPrefix}-otp`}
            aria-label="Código de verificação do WhatsApp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={otpCode}
            onChange={(event) => {
              setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6));
              if (error) setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && otpCode.length === 6 && !verifying) {
                event.preventDefault();
                void verifyCode();
              }
            }}
            placeholder="000000"
            disabled={verifying || disabled}
            className="w-full rounded-xl border border-brand-border bg-white px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.35em] text-brand-text outline-none transition focus:border-brand-primary focus:ring-1 focus:ring-brand-primary disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={resetChallenge}
              disabled={isBusy}
              className="text-[11px] font-semibold text-brand-text-muted hover:text-brand-text disabled:opacity-60"
            >
              Alterar número
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void requestCode()}
                disabled={isBusy || resendSeconds > 0}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary disabled:cursor-not-allowed disabled:text-brand-text-muted"
              >
                <RotateCcw size={13} className={requesting ? 'animate-spin' : ''} />
                {resendSeconds > 0 ? `Reenviar em ${resendSeconds}s` : 'Reenviar código'}
              </button>
              <button
                type="button"
                onClick={() => void verifyCode()}
                disabled={isBusy || otpCode.length !== 6}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {verifying ? 'Confirmando...' : 'Confirmar código'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p id={errorId} className="rounded-lg bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
