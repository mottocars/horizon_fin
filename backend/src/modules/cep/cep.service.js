const BRASIL_API_URL = 'https://brasilapi.com.br/api/cep/v2';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function consultarCep(cep) {
  const cepDigits = onlyDigits(cep);

  if (cepDigits.length !== 8) {
    const err = new Error('CEP inválido. Informe os 8 dígitos.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const response = await fetch(`${BRASIL_API_URL}/${cepDigits}`, {
    headers: { 'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)' },
  });

  if (response.status === 404) {
    const err = new Error('CEP não encontrado.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  if (!response.ok) {
    const err = new Error('Não foi possível consultar o CEP no momento.');
    err.status = 502;
    err.expose = true;
    throw err;
  }

  const data = await response.json();

  return {
    cep: cepDigits,
    cidade: data.city || '',
    estado: data.state || '',
    bairro: data.neighborhood || '',
    logradouro: data.street || '',
  };
}

module.exports = { consultarCep };
