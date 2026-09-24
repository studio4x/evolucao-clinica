import assert from 'node:assert/strict';
import { fetchBrazilianAddress, formatPostalCode, isCompletePostalCode } from '../src/services/cep';

assert.equal(formatPostalCode('01310100'), '01310-100');
assert.equal(formatPostalCode('01310-100'), '01310-100');
assert.equal(isCompletePostalCode('01310-100'), true);
assert.equal(isCompletePostalCode('01310-10'), false);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  assert.equal(String(input), 'https://viacep.com.br/ws/01310100/json/');
  return new Response(JSON.stringify({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }), { status: 200 });
};

const address = await fetchBrazilianAddress('01310-100');
assert.deepEqual(address, {
  postal_code: '01310-100',
  street: 'Avenida Paulista',
  address_complement: '',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
});

globalThis.fetch = async () => new Response(JSON.stringify({ erro: true }), { status: 200 });
assert.equal(await fetchBrazilianAddress('00000000'), null);
globalThis.fetch = originalFetch;

console.log('CEP tests passed');
