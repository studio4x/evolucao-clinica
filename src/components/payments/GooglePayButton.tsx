import { useState } from 'react';
import GooglePayButton, { type ReadyToPayChangeResponse } from '@google-pay/button-react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { getGooglePayRequest, type PaymentSettings } from '../../services/googlePay';

declare global {
  interface Window {
    NativePaymentBridge?: {
      isPaymentRequestSupported?: () => boolean;
    };
  }
}

interface GooglePayButtonProps {
  planPrice: number;
  paymentSettings: PaymentSettings;
  onLoadPaymentData: (paymentData: google.payments.api.PaymentData) => void;
  onError: (error: Error | google.payments.api.PaymentsError) => void;
  onCancel?: (reason: google.payments.api.PaymentsError) => void;
  className?: string;
}

export function describeGooglePayError(error: unknown) {
  const candidate = error as {
    message?: unknown;
    statusMessage?: unknown;
    statusCode?: unknown;
  } | null;
  const message = String(candidate?.statusMessage || candidate?.message || '').trim();
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('merchant') ||
    normalizedMessage.includes('registration') ||
    normalizedMessage.includes('not completed') ||
    normalizedMessage.includes('merchantid')
  ) {
    return 'O Google Pay em produção ainda não está habilitado para este site. É necessário publicar e aprovar a integração no Google Pay & Wallet Console.';
  }

  if (
    normalizedMessage.includes('payment request') ||
    normalizedMessage.includes('not supported') ||
    normalizedMessage.includes('unsupported')
  ) {
    return 'Este dispositivo ou a versão atual do WebView não oferece suporte ao Google Pay. Atualize o Android System WebView e o Google Play Services.';
  }

  if (message) {
    const statusCode = candidate?.statusCode ? ` (${String(candidate.statusCode)})` : '';
    return `${message}${statusCode}`;
  }

  return 'Não foi possível iniciar o Google Pay. Verifique a carteira Google e tente novamente.';
}

function getUnavailableMessage(paymentSettings: PaymentSettings, nativePaymentSupported: boolean) {
  if (!nativePaymentSupported) {
    return 'O Google Pay não é compatível com o WebView instalado neste aparelho. Atualize o Android System WebView e o Google Play Services e instale a versão mais recente do aplicativo.';
  }

  if (paymentSettings.environment === 'PRODUCTION') {
    return 'O Google Pay em produção não está disponível neste momento. Verifique se a integração do site e do aplicativo foi publicada e aprovada no Google Pay & Wallet Console.';
  }

  return 'O Google Pay não está disponível neste dispositivo. Atualize o Google Play Services e o Android System WebView.';
}

export function GooglePayCheckoutButton({
  planPrice,
  paymentSettings,
  onLoadPaymentData,
  onError,
  onCancel,
  className = ''
}: GooglePayButtonProps) {
  const [availability, setAvailability] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const isNativeApp = typeof window !== 'undefined' && /EvolucaoClinicaApp/i.test(window.navigator.userAgent);

  const [nativePaymentSupported] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    if (!isNativeApp) return true;

    if (
      !window.NativePaymentBridge?.isPaymentRequestSupported ||
      typeof window.PaymentRequest !== 'function'
    ) {
      return false;
    }

    try {
      return window.NativePaymentBridge.isPaymentRequestSupported();
    } catch {
      return false;
    }
  });

  const handleReadyToPayChange = (result: ReadyToPayChangeResponse) => {
    setAvailability(result.isButtonVisible && result.isReadyToPay ? 'available' : 'unavailable');
  };

  const handleOpenExternal = () => {
    try {
      const url = new URL(window.location.href);
      const intentUrl = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;end`;
      window.location.href = intentUrl;
    } catch (err) {
      console.warn('[GooglePay] Falha ao redirecionar com intent:', err);
      window.location.reload();
    }
  };

  // If running inside the WebView of the native app, render the custom styled button
  // that instantly launches the system browser (where Google Pay runs natively and securely)
  if (isNativeApp) {
    return (
      <button
        onClick={handleOpenExternal}
        type="button"
        className={`flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-3 text-center text-sm font-medium text-gray-900 hover:bg-gray-50 transition-all cursor-pointer shadow-sm min-h-12 ${className}`}
        style={{ height: '48px' }}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.08z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
        </svg>
        <span className="font-semibold text-[15px]">Google Pay</span>
      </button>
    );
  }

  if (!nativePaymentSupported || availability === 'unavailable') {
    return (
      <div
        role="status"
        className={`flex min-h-12 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-950 ${className}`}
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <span>{getUnavailableMessage(paymentSettings, nativePaymentSupported)}</span>
      </div>
    );
  }

  return (
    <GooglePayButton
      environment={paymentSettings.environment}
      buttonType="subscribe"
      buttonColor="white"
      buttonBorderType="default_border"
      buttonSizeMode="fill"
      buttonLocale="pt"
      buttonRadius={8}
      paymentRequest={getGooglePayRequest(planPrice, paymentSettings)}
      onLoadPaymentData={onLoadPaymentData}
      onError={onError}
      onCancel={onCancel}
      onReadyToPayChange={handleReadyToPayChange}
      className={className}
      style={{ display: 'block', width: '100%', height: '48px' }}
    />
  );
}
