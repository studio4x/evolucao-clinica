/**
 * Serviço de Configuração da Google Pay API
 * Define as especificações dinâmicas para pagamentos via Google Pay.
 */

export interface PaymentSettings {
  environment: 'TEST' | 'PRODUCTION';
  googleMerchantId: string;
  stripeProdPublishableKey: string;
  stripeProdSecretKey: string;
  stripeSandboxPublishableKey: string;
  stripeSandboxSecretKey: string;
}

// Chaves e configurações padrão fornecidas pelo usuário
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  environment: 'TEST',
  googleMerchantId: 'BCR2DN7TTCHMTFAJ',
  stripeProdPublishableKey: 'pk_live_wDyGJo2Rl2ikV2HaBXzZey1o',
  stripeProdSecretKey: '',
  stripeSandboxPublishableKey: 'pk_test_0b7fQSiyaxD7OjUH6lKL6Slh',
  stripeSandboxSecretKey: ''
};

const ALLOWED_AUTH_METHODS = ['PAN_ONLY', 'CRYPTOGRAM_3DS'];
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
 * Retorna a especificação de tokenização para o Stripe baseada nas chaves dinâmicas
 */
export function getTokenizationSpecification(publishableKey: string) {
  return {
    type: 'PAYMENT_GATEWAY',
    parameters: {
      gateway: 'stripe',
      'stripe:version': '2020-08-27',
      'stripe:publishableKey': publishableKey,
    },
  };
}

/**
 * Gera o payload de requisição completo de forma dinâmica
 * @param planPrice Preço do plano selecionado
 * @param settings Configurações de pagamento dinâmicas carregadas do banco de dados
 * @param currencyCode Código da moeda (padrão BRL)
 */
export function getGooglePayRequest(
  planPrice: number,
  settings: PaymentSettings,
  currencyCode = 'BRL'
) {
  const cardPaymentMethod: any = getBaseCardPaymentMethod();
  
  // Define qual chave pública usar com base no ambiente ativo
  const stripeKey = settings.environment === 'PRODUCTION' 
    ? settings.stripeProdPublishableKey 
    : settings.stripeSandboxPublishableKey;
    
  cardPaymentMethod.tokenizationSpecification = getTokenizationSpecification(stripeKey);

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
      // O Google Pay exige Merchant ID válido apenas em produção
      merchantId: settings.environment === 'PRODUCTION' ? settings.googleMerchantId : undefined,
      merchantName: 'Evolução Clínica',
    },
  };
}
