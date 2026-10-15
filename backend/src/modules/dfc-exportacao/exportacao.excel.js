const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { corrigirArquivo } = require('../../utils/excelMarca');
const exportacao = require('./exportacao.service');
const planilhaFluxo = require('./planilhas/fluxo');
const planilhaSaldos = require('./planilhas/saldos');
const bases = require('./planilhas/bases');
const planilhaCef = require('./planilhas/cef');

// Monta o .xlsx da exportação da aba DFC: Fluxo de Caixa, Saldos das Contas, Base Realizado, Base
// Projetado e um dossiê por obra com Projeção CEF. Devolve { buffer, nome }.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));
const dataBr = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10).split('-').reverse().join('/') : '—');

async function gerar(empresaId, { inicio, fim, centros = [] }, usuarioId) {
  const d = await exportacao.dados(empresaId, { inicio, fim, centros });
  const [{ rows: empresas }, { rows: usuarios }] = await Promise.all([
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const versao = d.fluxo.versao;
  const nomesCentros = centros.map((id) => d.centros.get(Number(id))?.name || `Centro ${id}`);
  const meta = {
    filtros: [
      ['Empresa', empresa],
      ['Período', `${rotuloMes(inicio)} a ${rotuloMes(fim)}`],
      ['Centros de custo', nomesCentros.length ? nomesCentros.join(', ') : 'Todos'],
      ['Orçamento', versao ? `versão ${versao.numero}, salva em ${dataHora(versao.criado_em)}${versao.usuario ? ` por ${versao.usuario}` : ''}` : 'nenhuma versão salva'],
      ['Extrato bancário até', dataBr(d.fluxo.extratoAte)],
    ],
    gerado: `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHora(new Date())}`,
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // Nomes das abas dos dossiês antes (a Base Projetado aponta pra elas).
  const abasCef = new Map();
  const nomesUsados = new Set();
  d.obras.forEach((o) => {
    let nome = planilhaCef.nomeAba(o.obra.name);
    if (nomesUsados.has(nome)) nome = `${nome.slice(0, 26)} ${o.obra.sienge_id}`;
    nomesUsados.add(nome);
    abasCef.set(o.obra.sienge_id, nome);
  });

  planilhaFluxo(workbook, d, meta);
  planilhaSaldos(workbook, d, meta);
  bases.realizado(workbook, d, meta);
  bases.projetado(workbook, d, meta, abasCef);
  const slugs = new Set();
  d.obras.forEach((o) => planilhaCef(workbook, o, d, meta, slugs, abasCef.get(o.obra.sienge_id)));

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  const nome = `Fluxo de Caixa - ${empresa} - ${rotuloMes(inicio).replace('/', '-')} a ${rotuloMes(fim).replace('/', '-')}.xlsx`;
  return { buffer, nome };
}

module.exports = { gerar };
