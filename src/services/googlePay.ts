/**
 * Serviço de Configuração da Google Pay API
 * Define as especificações padrão para pagamentos via Google Pay em ambiente de teste (sandbox) e produção.
 */

// Chaves de configuração via variáveis de ambiente
export const GOOGLE_PAY_MERCHANT_ID = import.meta.env.VITE_GOOGLE_PAY_MERCHANT_ID || '01234567890123456789';
export const GOOGLE_PAY_MERCHANT_NAME = import.meta.env.VITE_GOOGLE_PAY_MERCHANT_NAME || 'Evolução Clínica';
export const GOOGLE_PAY_ENVIRONMENT = (import.meta.env.VITE_GOOGLE_PAY_ENVIRONMENT as 'TEST' | 'PRODUCTION') || 'TEST';
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51P...'; // Substituir pela chave de teste/produção do Stripe

// Métodos de autenticação autorizados pelo Google Pay
const ALLOWED_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS'];

// Redes de cartões aceitas no Brasil/Internacional
const ALLOWED_CARD_NETWORKS = ['AMEX', 'DISCOVER', 'JCB', 'MASTERCARD', 'VISA'];

/**
 * Retorna as configurações básicas da API do Google Pay
 */
export function getBaseCardPaymentMethod() {
  return {
    type: 'CARD',
    parameters: {
      allowedAuthMethods: ALLOWED_AUTH_METHODS,
      allowedCardNetworks: ALLOWED_CARD_NETWORKS,
      billingAddressRequired: true,
      billingAddressParameters: {
        format: 'FULL',
        phoneNumberRequired: true
      }
    }
  };
}

/**
 * Retorna a especificação de tokenização para o Gateway de Pagamentos parceiro (Stripe é o padrão recomendado)
 */
export function getTokenizationSpecification() {
  return {
    type: 'PAYMENT_GATEWAY',
    parameters: {
      gateway: 'stripe',
      'stripe:version': '2020-08-27',
      'stripe:publishableKey': STRIPE_PUBLISHABLE_KEY,
    },
  };
}

/**
 * Gera o payload de requisição completo para ser consumido pelo botão do Google Pay
 * @param planPrice Preço do plano selecionado
 * @param currencyCode Código da moeda (padrão BRL)
 */
export function getGooglePayRequest(
  planPrice: number,
  currencyCode = 'BRL'
) {
  const cardPaymentMethod: any = getBaseCardPaymentMethod();
  cardPaymentMethod.tokenizationSpecification = getTokenizationSpecification();

  return {
    apiVersion: 2,
    apiVersionMinor: 0,
    allowedPaymentMethods: [cardPaymentMethod],
    transactionInfo: {
      totalPriceStatus: 'FINAL',
      totalPriceLabel: 'Total',
      totalPrice: planPrice.toFixed(2),
      currencyCode: currencyCode,
      countryCode: 'BR',
    },
    merchantInfo: {
      merchantId: GOOGLE_PAY_ENVIRONMENT === 'PRODUCTION' ? GOOGLE_PAY_MERCHANT_ID : undefined,
      merchantName: GOOGLE_PAY_MERCHANT_NAME,
    },
  };
}
