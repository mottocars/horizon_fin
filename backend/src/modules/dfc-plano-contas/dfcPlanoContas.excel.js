const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { CORES, corrigirArquivo } = require('../../utils/excelMarca');
const { planilhaPlanoContas } = require('../../utils/excelPlanoContas');
const { ROTULO_ORIGEM } = require('../dfc-exportacao/exportacao.service');
const desembolso = require('../dfc-desembolso/desembolso.service');
const service = require('./dfcPlanoContas.service');

// Exportar Excel da aba Plano Contas do DFC Construtoras (um plano aberto): espelho da tabela da tela
// (DfcPlanoContasTab.jsx) — a árvore inteira com Código, Conta, Projeta DFC, Máscara DFC, Origem
// Projeção, Prazo Desemb. e Status (desenho em utils/excelPlanoContas.js). Conta sem linha no plano =
// Projeta DFC marcado, sem máscara e sem origem (como na tela). Prazo Desemb. só nas naturezas
// "SIENGE - EMPRESARIAL DESEMBOLSO", da ficha guardada. Busca e filtros de coluna da tela não
// entram: sai o plano todo.

const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));

// `centroId` null = plano Global. Devolve { buffer, nome }.
async function gerar(empresaId, centroId, usuarioId) {
  const classificacoes = await service.list(empresaId, centroId); // 404 se o centro não tem versão
  const [{ rows: contas }, { rows: mascaras }, fichas, { rows: empresas }, { rows: centros }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT sienge_id, name, tp_conta, fl_ativa, mascara_nivel_1, mascara_nivel_2, mascara_nivel_3, mascara_nivel_4,
              mascara_nivel_5, mascara_nivel_6, mascara_nivel_7
         FROM planos_financeiros_sienge WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query('SELECT id, descricao FROM dfc_mascaras WHERE empresa_id = $1', [empresaId]),
    desembolso.listar(empresaId),
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    centroId
      ? pool.query('SELECT name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, centroId])
      : { rows: [] },
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const plano = centroId ? centros[0]?.name || `Centro ${centroId}` : 'Global';
  const nomeMascara = new Map(mascaras.map((m) => [m.id, m.descricao]));
  const classificacao = new Map(classificacoes.map((c) => [String(c.sienge_id), c]));
  const ficha = new Map(fichas.map((f) => [String(f.sienge_id), f]));
  const de = (conta) => classificacao.get(String(conta.sienge_id)) || {};

  // Mesmo texto do Prazo Desemb. da tela.
  function prazo(conta) {
    if (de(conta).origem_projecao !== desembolso.ORIGEM) return '';
    const f = ficha.get(String(conta.sienge_id));
    if (!f) return '';
    return f.sem_historico || f.prazo_medio === null ? 'sem histórico' : `${Math.round(f.prazo_medio)} dias`;
  }

  const analiticas = contas.filter((c) => c.tp_conta !== 'T');
  const comMascara = analiticas.filter((c) => nomeMascara.get(de(c).mascara_id)).length;
  const comOrigem = analiticas.filter((c) => de(c).origem_projecao).length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  planilhaPlanoContas(workbook, {
    nomeAba: 'Plano de Contas DFC',
    titulo: 'Plano de Contas DFC',
    subtitulo: centroId ? 'Vale só para este centro de custo' : 'Vale para todos os centros sem plano próprio',
    filtros: [
      ['Empresa', empresa],
      ['Plano', plano],
      ['Contas analíticas com máscara', `${comMascara} de ${analiticas.length}`],
      ['com origem', `${comOrigem} de ${analiticas.length}`],
    ],
    gerado: `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHora(new Date())}`,
    contas,
    colunas: [
      { titulo: 'Projeta DFC', largura: 17, centro: true, valor: (c) => (de(c).projeta_dfc === false ? 'Não' : 'Sim') },
      { titulo: 'Máscara DFC', largura: 48, campo: true, valor: (c) => nomeMascara.get(de(c).mascara_id) },
      {
        titulo: 'Origem Projeção',
        largura: 34,
        campo: true,
        valor: (c) => (de(c).origem_projecao ? ROTULO_ORIGEM[de(c).origem_projecao] || de(c).origem_projecao : ''),
      },
      { titulo: 'Prazo Desemb.', largura: 19, centro: true, cor: CORES.AZUL, valor: prazo },
    ],
  });

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  return { buffer, nome: `Plano de Contas DFC - ${empresa} - ${plano}.xlsx` };
}

module.exports = { gerar };
