import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export const DEFAULT_WHATSAPP_COUNTRY: CountryCode = 'BR';

export type WhatsAppCountryOption = {
  code: CountryCode;
  callingCode: string;
  flag: string;
  name: string;
};

export class RequiredWhatsAppNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequiredWhatsAppNumberError';
  }
}

const digitsOnly = (value: string) => String(value || '').replace(/\D/g, '');

const countryFlag = (country: CountryCode): string => country
  .split('')
  .map((character) => String.fromCodePoint(127397 + character.charCodeAt(0)))
  .join('');

export function getWhatsAppCountryCallingCode(country: CountryCode): string {
  return getCountryCallingCode(country);
}

export function getWhatsAppCountryOptions(): WhatsAppCountryOption[] {
  const displayNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    : null;

  return getCountries()
    .map((code) => ({
      code,
      callingCode: getCountryCallingCode(code),
      flag: countryFlag(code),
      name: displayNames?.of(code) || code,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export function formatWhatsAppNationalNumber(value: string, country: CountryCode): string {
  return new AsYouType(country).input(digitsOnly(value));
}

export function normalizeRequiredWhatsAppNationalNumber(value: string, country: CountryCode): string {
  const nationalNumber = digitsOnly(value);
  if (!nationalNumber) {
    throw new RequiredWhatsAppNumberError('Informe seu número de WhatsApp para continuar.');
  }

  const parsed = parsePhoneNumberFromString(nationalNumber, country);
  if (!parsed?.isPossible()) {
    throw new RequiredWhatsAppNumberError('Informe um número de WhatsApp válido para o país selecionado.');
  }

  return parsed.number.slice(1);
}

export function splitStoredWhatsAppNumber(
  value: string,
  fallbackCountry: CountryCode = DEFAULT_WHATSAPP_COUNTRY,
): { country: CountryCode; nationalNumber: string } {
  const normalized = digitsOnly(value);
  if (!normalized) {
    return { country: fallbackCountry, nationalNumber: '' };
  }

  const parsed = parsePhoneNumberFromString(`+${normalized}`);
  if (parsed?.country) {
    return {
      country: parsed.country,
      nationalNumber: formatWhatsAppNationalNumber(parsed.nationalNumber, parsed.country),
    };
  }

  const fallbackCallingCode = getCountryCallingCode(fallbackCountry);
  const nationalNumber = normalized.startsWith(fallbackCallingCode)
    ? normalized.slice(fallbackCallingCode.length)
    : normalized;

  return {
    country: fallbackCountry,
    nationalNumber: formatWhatsAppNationalNumber(nationalNumber, fallbackCountry),
  };
}

export function normalizeRequiredWhatsAppNumber(value: string): string {
  const normalized = digitsOnly(value);
  if (!normalized) {
    throw new RequiredWhatsAppNumberError('Informe seu número de WhatsApp para continuar.');
  }
  if (normalized.length < 8 || normalized.length > 15) {
    throw new RequiredWhatsAppNumberError('Informe o WhatsApp com DDI, DDD e número. Exemplo: 5511999887766.');
  }
  return normalized;
}
