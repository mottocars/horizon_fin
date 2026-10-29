const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { corrigirArquivo } = require('../../utils/excelMarca');
const { planilhaPlanoContas } = require('../../utils/excelPlanoContas');
const service = require('./drePlanoContas.service');

// Exportar Excel da aba Plano de Contas da DRE (um plano aberto): espelho da tabela da tela
// (PlanoDeContasTab.jsx) — a árvore inteira com Código, Conta, Máscara DRE e Status (desenho em
// utils/excelPlanoContas.js). Busca e filtros de coluna da tela não entram: sai o plano todo.

const NAO_ENTRA = 'NÃO ENTRA NA DRE';

const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(v));

// `centroId` null = plano Global. Devolve { buffer, nome }.
async function gerar(empresaId, centroId, usuarioId) {
  const classificacoes = await service.list(empresaId, centroId); // 404 se o centro não tem versão
  const [{ rows: contas }, { rows: mascaras }, { rows: empresas }, { rows: centros }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT sienge_id, name, tp_conta, fl_ativa, mascara_nivel_1, mascara_nivel_2, mascara_nivel_3, mascara_nivel_4,
              mascara_nivel_5, mascara_nivel_6, mascara_nivel_7
         FROM planos_financeiros_sienge WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query('SELECT id, descricao FROM dre_mascaras WHERE empresa_id = $1', [empresaId]),
    pool.query('SELECT nome_fantasia, razao_social FROM empresas WHERE id = $1', [empresaId]),
    centroId
      ? pool.query('SELECT name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, centroId])
      : { rows: [] },
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = empresas[0]?.nome_fantasia?.trim() || empresas[0]?.razao_social || `Empresa ${empresaId}`;
  const plano = centroId ? centros[0]?.name || `Centro ${centroId}` : 'Global';
  const nomeMascara = new Map(mascaras.map((m) => [m.id, m.descricao]));
  const mascaraDe = new Map(
    classificacoes.map((c) => [String(c.sienge_id), c.nao_entra ? NAO_ENTRA : nomeMascara.get(c.mascara_id) || ''])
  );
  const analiticas = contas.filter((c) => c.tp_conta !== 'T');
  const classificadas = analiticas.filter((c) => mascaraDe.get(String(c.sienge_id))).length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  planilhaPlanoContas(workbook, {
    nomeAba: 'Plano de Contas DRE',
    titulo: 'Plano de Contas DRE',
    subtitulo: centroId ? 'Vale só para este centro de custo' : 'Vale para todos os centros sem plano próprio',
    filtros: [
      ['Empresa', empresa],
      ['Plano', plano],
      ['Contas analíticas com máscara', `${classificadas} de ${analiticas.length}`],
    ],
    gerado: `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHora(new Date())}`,
    contas,
    colunas: [{ titulo: 'Máscara DRE', largura: 40, campo: true, valor: (c) => mascaraDe.get(String(c.sienge_id)) }],
  });

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer());
  return { buffer, nome: `Plano de Contas DRE - ${empresa} - ${plano}.xlsx` };
}

module.exports = { gerar };
