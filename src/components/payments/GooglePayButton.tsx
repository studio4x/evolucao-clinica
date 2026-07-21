import { useState } from 'react';
import GooglePayButton, { type ReadyToPayChangeResponse } from '@google-pay/button-react';
import { AlertTriangle } from 'lucide-react';
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
  const [nativePaymentSupported] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const isNativeApp = /EvolucaoClinicaApp/i.test(window.navigator.userAgent);
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
      buttonColor="black"
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
