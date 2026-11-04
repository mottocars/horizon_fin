// Leitura rápida, no navegador, de um arquivo de retorno CNAB 240 anexado na abertura do
// período (contas com convênio CNAB 240 manual) — só pra mostrar o que é antes de enviar e
// barrar arquivo no campo errado. A leitura de verdade é no servidor (backend/src/utils/cnab240.js,
// mesmas posições): Header de Lote posição 9 = E (extrato) ou T (cobrança).
export const TAMANHO_MAXIMO_CNAB = 10 * 1024 * 1024;

const dataBR = (ddmmaaaa) =>
  /^\d{8}$/.test(ddmmaaaa) ? `${ddmmaaaa.slice(0, 2)}/${ddmmaaaa.slice(2, 4)}/${ddmmaaaa.slice(4)}` : '';
const semZeros = (t) => t.replace(/^0+/, '') || '0';

function detectarTipo(linhas) {
  for (const l of linhas) {
    if (l[7] !== '1') continue;
    if (l[8] === 'E') return 'EXTRATO';
    if (l[8] === 'T') return 'COBRANCA';
  }
  for (const l of linhas) {
    if (l[7] !== '3') continue;
    if (l[13] === 'E') return 'EXTRATO';
    if (l[13] === 'T' || l[13] === 'U') return 'COBRANCA';
  }
  return null;
}

// -> { tipo: 'EXTRATO'|'COBRANCA'|null, descricao, erro }
export async function lerArquivoCnab(file) {
  if (file.size > TAMANHO_MAXIMO_CNAB) return { tipo: null, erro: 'Arquivo maior que 10 MB.' };
  const linhas = (await file.text()).split(/\r?\n/).filter((l) => l.trim());
  const header = linhas[0] || '';
  const tipo = header[7] === '0' && header.length >= 170 ? detectarTipo(linhas) : null;
  if (!tipo) return { tipo: null, erro: 'Não é um arquivo de retorno CNAB 240 (extrato ou cobrança).' };

  const geradoEm = dataBR(header.slice(143, 151));
  if (tipo === 'EXTRATO') {
    const contas = linhas.filter((l) => l[7] === '1').map((l) => `${semZeros(l.slice(58, 70).trim())}-${l[70]}`);
    const rotulo = contas.length === 1 ? `conta ${contas[0]}` : `${contas.length} contas`;
    return { tipo, descricao: `Extrato · ${rotulo}${geradoEm ? ` · gerado em ${geradoEm}` : ''}` };
  }
  const banco = header.slice(0, 3);
  if (banco !== '104') return { tipo, erro: `Retorno de cobrança do banco ${banco} — só o layout SIGCB da CAIXA (104) é lido.` };
  const titulos = linhas.filter((l) => l[7] === '3' && l[13] === 'T').length;
  return {
    tipo,
    descricao: `Cobrança · beneficiário ${header.slice(58, 64)}-${header[64]} · ${titulos} título(s)${geradoEm ? ` · gerado em ${geradoEm}` : ''}`,
  };
}
