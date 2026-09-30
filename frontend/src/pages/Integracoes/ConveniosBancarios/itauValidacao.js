// Validações e prévia do subject da conexão API Itaú no navegador — mesmas regras de
// backend/src/modules/integracoes-itau/itau.validacao.js (que é quem vale: o backend revalida
// e sanitiza de novo antes de gerar o CSR). Aqui é só pra dar retorno imediato na tela.

export function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function validarUuid(valor) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(valor || '').trim());
}

export function validarCnpj(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

// Máscara progressiva 00.000.000/0000-00 enquanto digita.
export function mascararCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function sanitizarCampo(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[/\\=+,;"<>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .trim();
}

// Prévia do subject exatamente como vai no CSR.
export function previaSubject({ clientId, razaoSocial, cidade, uf }) {
  return {
    CN: String(clientId || '').trim(),
    OU: sanitizarCampo(razaoSocial),
    L: sanitizarCampo(cidade).toUpperCase(),
    ST: String(uf || '').trim().toUpperCase(),
    C: 'BR',
  };
}

export function subjectValido(s) {
  return validarUuid(s.CN) && Boolean(s.OU) && Boolean(s.L) && /^[A-Z]{2}$/.test(s.ST);
}
