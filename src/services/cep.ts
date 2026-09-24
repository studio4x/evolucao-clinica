export type BrazilianAddress = {
  postal_code: string;
  street: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ViaCepResponse = {
  erro?: boolean;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

const normalizePostalCode = (value: string) => value.replace(/\D/g, '').slice(0, 8);

export const formatPostalCode = (value: string) => {
  const digits = normalizePostalCode(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};

export const isCompletePostalCode = (value: string) => normalizePostalCode(value).length === 8;

export async function fetchBrazilianAddress(value: string, signal?: AbortSignal): Promise<BrazilianAddress | null> {
  const postalCode = normalizePostalCode(value);
  if (postalCode.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, { signal });
  if (!response.ok) throw new Error(`CEP lookup failed with HTTP ${response.status}`);

  const data = await response.json() as ViaCepResponse;
  if (data.erro) return null;

  return {
    postal_code: formatPostalCode(postalCode),
    street: data.logradouro || '',
    address_complement: data.complemento || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
  };
}
