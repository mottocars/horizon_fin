const pool = require('../../../config/db');
const projecoes = require('../../dre-projecoes/dreProjecoes.service');
const calculo = require('../../dre-projecoes/calculo');
const exportacao = require('../../dre-exportacao/exportacao.service');
const dreMascaras = require('../../dre-mascaras/dreMascaras.service');
const planoContas = require('../../dre-plano-contas/drePlanoContas.service');
const { fimDoMes, vespera, hojeIso, baseDoImposto } = require('../../dre-demonstrativo/demonstrativo.service');
const { ferramenta } = require('../dfc/tools/comum');
const { contaDaLinha, acumulado, NOME_FATOR } = require('./conta');
const { completar, ordemLinhas } = require('./demonstrativo');
const B = require('./base');

const { z, falha, r2, r8, pct, br, CENTROS, resolverCentros, resolverLinha, dados, memo } = B;

// Ferramentas da PROJEÇÃO DA DRE (Operações › DRE Construtoras › aba Projeções, e as colunas Projetado /
// Desvio % da aba DRE e do dashboard) no módulo DRE do conector Horizon, só leitura:
//   dre_projecao_guia        — FAQ completo: como a tela funciona (lista, assistente em 7 etapas,
//                              planilha, versões), as regras de cálculo, a comparação com o realizado e
//                              o estado desta empresa (versões, rascunhos, Origem Projeção do plano);
//   dre_projecao_orcamentos  — os orçamentos de uma versão (ou os rascunhos): ciclo, trava, quem
//                              concluiu, totais do ciclo, premissas resumidas, POCs;
//   dre_projecao_premissas   — o que entrou depois da trava num centro: vendas (unidade, mês, valor e de
//                              onde veio), naturezas por Origem Projeção mês a mês, correção, e o estoque
//                              que fica sem venda;
//   dre_projecao_explicar    — como um número projetado foi criado: a foto gravada, a conta do motor nos
//                              meses projetados (realizado até a trava + premissas, × POC projetada), a
//                              POC e as premissas que formam a base;
//   dre_projecao_desvio      — Realizado × Projetado como a aba DRE (Desvio % com as regras da tela), por
//                              linha e centro, mês a mês e os maiores desvios;
//   dre_projecao_auditoria   — refaz cada orçamento com o realizado de hoje e confere com o gravado (o
//                              que mudou desde o orçamento), POCs, e os alertas da projeção.
// Mesmas funções da tela: dreProjecoes.service (orcamentosDaFonte), calculo.js (prepararMotor/calcular),
// e as regras de linha da exportação de auditoria (regraDa).

const ROTULO_ORIGEM = {
  NAO_POSSUI: 'NÃO POSSUI ORIGEM',
  HORIZON_ORCAMENTO_INFORMADO: 'HORIZON - INFORMADO',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'SIENGE - EMPRESARIAL',
  SIENGE_AGING: 'SIENGE - AGING',
};
const COMO_ORIGEM = {
  HORIZON_ORCAMENTO_INFORMADO: 'digitado no assistente (ou importado pela planilha), mês a mês',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'orçamento empresarial do Sienge do centro (última versão de cada orçamento), no mês orçado, com sinal de saída; não dá pra editar',
  SIENGE_AGING: 'títulos a pagar/receber do Sienge com EMISSÃO no mês; não dá pra editar',
};
const TOLERANCIA = 10; // % — neutro na tela
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const brl = (v) => (v === null || v === undefined ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pctTxt = (f) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`);
const rotMes = (m) => {
  const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return m ? `${n[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '—';
};
const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');

// ─── Entradas comuns ────────────────────────────────────────────────────────────────────────────
const FONTE = {
  fonte: z
    .enum(['versao', 'rascunhos'])
    .optional()
    .describe('"versao" (padrão: uma versão salva — a dos dashboards) ou "rascunhos" (os rascunhos de cada centro e, nos sem rascunho, a última versão — o que a aba DRE do Operações mostra com Versão = Rascunhos).'),
  versao: z.number().int().positive().optional().describe('Número da versão salva (padrão: a última).'),
};
const PERIODO_PROJ = {
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Início (AAAA-MM-DD). Padrão: 1º de janeiro do ano atual.'),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fim (AAAA-MM-DD). Padrão: 31 de dezembro do ano atual (a projeção vai além de hoje).'),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('Um mês inteiro (AAAA-MM), no lugar de de/ate.'),
  ano: z.number().int().min(2000).max(2100).optional().describe('Um ano inteiro, no lugar de de/ate.'),
};

// Período da projeção: mês/ano INTEIROS (o projetado é do mês todo; o realizado para em hoje sozinho).
function periodoProj(a = {}) {
  const hoje = hojeIso();
  if (a.mes) return { de: `${a.mes}-01`, ate: fimDoMes(`${a.mes}-01`) };
  if (a.ano) return { de: `${a.ano}-01-01`, ate: `${a.ano}-12-31` };
  const de = a.de || `${hoje.slice(0, 4)}-01-01`;
  const ate = a.ate || `${hoje.slice(0, 4)}-12-31`;
  if (de > ate) throw falha(`O início (${br(de)}) não pode ser depois do fim (${br(ate)}).`);
  return { de, ate };
}

// Rascunho só pra quem tem a tela DRE Construtoras (o dashboard só vê versão salva).
function fonteDe(a, ctx) {
  if (a.fonte === 'rascunhos') {
    if (!ctx.podeRascunho) throw falha('Os rascunhos da projeção só aparecem para quem tem a tela DRE Construtoras (Operações). Use a versão salva (fonte "versao").');
    return { fonte: 'atual', numero: null };
  }
  return { fonte: 'versao', numero: a.versao ?? null };
}

// Os orçamentos da fonte (com a foto inteira), cache curto.
function carregar(empresaId, { fonte, numero, centros = [] }) {
  return memo(`proj|${empresaId}|${fonte}|${numero}|${[...centros].sort().join(',')}`, () =>
    projecoes.orcamentosDaFonte(empresaId, { fonte, numero, centros, completo: true })
  );
}

// O motor refeito de um orçamento (realizado de HOJE até a trava + premissas da foto) e as regras de linha.
function motorDe(empresaId, orc) {
  return memo(`projm|${empresaId}|${orc.id}|${orc.atualizado_em}|${orc.status}`, async () => {
    const prep = await calculo.prepararMotor(empresaId, orc, { foto: orc.resultado });
    const regras = new Map(prep.motor.mascaras.map((x) => [x.id, exportacao.regraDa(x, prep.motor)]));
    const aliq = exportacao.aliquotas(prep.motor);
    const c = prep.d.unidadesCentros.find((x) => x.id === orc.centro_id);
    const naTrava = c ? calculo.unidadesNaTrava(c, prep.j.travaFim) : [];
    return { ...prep, regras, aliquotaEm: aliq, naTrava, dm: { m: prep.motor, regras } };
  });
}

const nomeCentro = (o) => `${o.centro_id} · ${o.centro_apelido || o.centro_nome}`;
const rotuloOrc = (o) => (o.origem === 'VERSAO' ? 'versão salva' : o.status === 'CONCLUIDO' ? 'rascunho concluído' : 'rascunho em andamento (calculado agora)');
const descreverFonte = (f) =>
  f.fonte === 'versao'
    ? f.versao
      ? `Versão ${f.versao.numero}, salva em ${quando(f.versao.criado_em)}${f.versao.usuario ? ` por ${f.versao.usuario}` : ''}`
      : 'nenhuma versão salva'
    : `Rascunhos (não salvos) + a última versão${f.versao ? ` (Versão ${f.versao.numero})` : ''} nos centros sem rascunho`;

function primeiroProjetado(o) {
  return calculo.janela(o).inicioProjecao;
}

// De onde veio o valor de uma venda projetada (a regra de vendaDaUnidade).
function comoDaVenda(v, orc, naTrava) {
  const e = orc.dados?.unidades?.[v.chave];
  if (e && e.valor !== null && e.valor !== undefined && e.valor !== '') return 'valor informado no assistente';
  const u = naTrava.find((x) => x.chave === v.chave);
  if (!e && u?.venda_registrada) return `venda registrada no Sienge depois da trava (contrato de ${rotMes(u.venda_registrada.mes)})`;
  if (u?.venda_registrada && u.venda_registrada.valor !== null && (!e?.mes || e.mes === u.venda_registrada.mes)) return 'valor do contrato registrado no Sienge depois da trava';
  if (u?.ticket !== null && u?.ticket !== undefined) return `ticket médio do tipo ${u.tipo || '—'} (${brl(u.ticket)})`;
  return 'ticket médio do tipo';
}

// Projetado gravado (a foto `mensal`) de um orçamento, por linha de nível 2, nos meses filtrados.
function somaGravada(orc, filtro) {
  const ms = orc.mensal;
  const out = {};
  if (!ms) return out;
  Object.entries(ms.valores).forEach(([mid, vs]) => {
    out[mid] = ms.meses.reduce((t, mes, i) => (filtro(mes) ? t + num(vs[i]) : t), 0);
  });
  return out;
}

// ═══ dre_projecao_guia ══════════════════════════════════════════════════════════════════════════
const guia = {
  name: 'dre_projecao_guia',
  description:
    'Comece por aqui para QUALQUER pergunta sobre a Projeção da DRE (orçamento da DRE por centro de custo). FAQ completo e o estado desta empresa: ' +
    'como a aba Projeções da DRE Construtoras funciona (lista, botões Layout / Importar / Novo orçamento / Salvar versão, o assistente em 7 etapas — centro e ciclo, histórico e trava, vendas das unidades, ' +
    'custos da POC, POC, demais contas, conclusão), rascunho × concluído × versão salva, a planilha de importação, as regras de cálculo (trava, vendas, Origem Projeção das naturezas: ' +
    'HORIZON - INFORMADO, SIENGE - EMPRESARIAL, SIENGE - AGING, NÃO POSSUI; correção monetária; POC), como a aba DRE e o dashboard comparam Realizado × Projetado (colunas, filtro Versão, ' +
    'Desvio %, meses em cinza, consolidado), o Excel de auditoria, perguntas frequentes e qual ferramenta usar.',
  inputSchema: {},
  handler: ferramenta(async (empresaId, a, ctx) => {
    const [{ rows: versoes }, { rows: rascunhos }, { rows: origens }, { rows: centros }, arvore] = await Promise.all([
      pool.query(
        `SELECT v.numero, v.criado_em, v.orcamentos, u.nome AS usuario FROM dre_projecao_versoes v
           LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.empresa_id = $1 ORDER BY v.numero DESC`,
        [empresaId]
      ),
      pool.query(
        `SELECT o.centro_id, c.name AS nome, NULLIF(TRIM(c.apelido), '') AS apelido, o.status, o.etapa, o.atualizado_em, u.nome AS usuario
           FROM dre_projecao_orcamentos o JOIN centros_custo_sienge c ON c.empresa_id = o.empresa_id AND c.sienge_id = o.centro_id
           LEFT JOIN usuarios u ON u.id = o.usuario_id
          WHERE o.empresa_id = $1 AND o.versao_id IS NULL ORDER BY c.dre_ordem NULLS LAST, c.sienge_id`,
        [empresaId]
      ),
      pool.query(
        `SELECT 'Global' AS plano, origem_projecao, COUNT(*)::int AS n FROM dre_plano_contas WHERE empresa_id = $1 GROUP BY 2
         UNION ALL
         SELECT 'Próprios dos centros', origem_projecao, COUNT(*)::int FROM dre_plano_contas_centro WHERE empresa_id = $1 GROUP BY 2`,
        [empresaId]
      ),
      pool.query(
        `SELECT c.sienge_id::int AS id, c.name AS nome, NULLIF(TRIM(c.apelido), '') AS apelido, c.natureza,
                EXISTS (SELECT 1 FROM dre_projecao_orcamentos o JOIN dre_projecao_versoes v ON v.id = o.versao_id
                         WHERE o.empresa_id = c.empresa_id AND o.centro_id = c.sienge_id
                           AND v.numero = (SELECT MAX(numero) FROM dre_projecao_versoes WHERE empresa_id = c.empresa_id)) AS na_versao
           FROM centros_custo_sienge c WHERE c.empresa_id = $1 AND c.realiza_dre ORDER BY c.dre_ordem NULLS LAST, c.sienge_id`,
        [empresaId]
      ),
      dreMascaras.list(empresaId),
    ]);
    const porPlano = (p) =>
      origens
        .filter((o) => o.plano === p)
        .map((o) => `${ROTULO_ORIGEM[o.origem_projecao] || 'não informada'}: ${o.n}`)
        .join('; ') || 'nenhuma conta';
    const md = [
      '# Projeção da DRE — guia e FAQ',
      `Hoje: ${br(hojeIso())}. Onde fica: **Operações › DRE Construtoras › aba Projeções** (montar o orçamento) e as colunas **Projetado / Desvio %** da aba DRE (Operações) e do dashboard **Econômico Financeiro › Demonstração do Resultado**.`,
      '',
      '## Estado desta empresa',
      `- Versões salvas: ${versoes.length ? versoes.map((v) => `Versão ${v.numero} (${quando(v.criado_em)}${v.usuario ? `, ${v.usuario}` : ''}, ${v.orcamentos} orçamentos)`).join('; ') : 'nenhuma — os dashboards ficam sem projeção'}.`,
      ctx.podeRascunho
        ? `- Rascunhos (não salvos): ${rascunhos.length ? rascunhos.map((r) => `${r.centro_id} ${r.apelido || r.nome} — ${r.status === 'CONCLUIDO' ? 'concluído, aguardando Salvar versão' : `em andamento (etapa ${r.etapa})`}, ${quando(r.atualizado_em)}${r.usuario ? ` por ${r.usuario}` : ''}`).join('; ') : 'nenhum'}.`
        : '- Rascunhos: só visíveis para quem tem a tela DRE Construtoras.',
      `- Centros com "Realiza DRE" (${centros.length}): ${centros.map((c) => `${c.id} ${c.apelido || c.nome} (${c.natureza === 'OBRA' ? 'obra' : c.natureza === 'ADMINISTRATIVO' ? 'administrativo' : 'SEM TIPO — não dá pra orçar'}${c.na_versao ? ', na última versão' : ''})`).join('; ')}.`,
      `- Origem Projeção no plano de contas da DRE — Global: ${porPlano('Global')}. Planos próprios: ${porPlano('Próprios dos centros')}.`,
      `- Linhas de nível 1 da DRE (colunas da lista): ${arvore.map((g) => g.descricao).join(', ')}.`,
      '',
      '## A aba Projeções',
      '- **Lista**: um orçamento por centro, com as colunas dos totalizadores da Máscara DRE (realizado + projetado no ciclo). A linha de cima diz a versão em vigor. Situação: **Em andamento** (rascunho sendo montado), **Concluído** (calculado, aguardando Salvar versão), **Na versão** (orçamento da última versão salva). Ações: continuar (abre o assistente na etapa em que parou), descartar o rascunho.',
      '- **Layout**: baixa a planilha preenchida da empresa inteira (abas Ciclos, Vendas, Custos da POC, Demais contas e uma oculta _horizon de controle; protegida com senha nas células que não se digitam). **Importar**: sobe a planilha, mostra a prévia (o que muda por centro, erros por aba e linha, avisos) e grava só os centros que mudaram — opcionalmente já concluindo. Ciclo em branco com valores preenchidos é ignorado.',
      '- **Novo orçamento**: abre o assistente. **Salvar versão**: cria uma versão da EMPRESA com todos os rascunhos CONCLUÍDOS e, nos centros sem rascunho concluído, o orçamento da versão anterior. **Tela cheia**.',
      '',
      '## O assistente (7 etapas)',
      '1. **Centro e ciclo**: o centro (precisa de "Realiza DRE" e do Tipo Obra/Administrativo na aba Centros Custos) e o ciclo (mês de início e de fim). Se o centro está na última versão, o rascunho começa com o que foi informado nela. Um rascunho por centro.',
      '2. **Histórico**: a DRE realizada do centro (a mesma tabela da aba DRE, anos em colunas) até a **trava** — o último mês realizado. A projeção começa no mês seguinte. Sugestão: o mês anterior ao atual; limite: o primeiro lançamento do centro. Trocar a trava recalcula tudo e volta o rascunho para Em andamento.',
      '3. **Vendas** (só obra): as unidades **disponíveis na trava** (sem contrato ativo nem permuta no fim do mês da trava — entram também as vendidas depois da trava, com a venda do Sienge sugerida, e as distratadas que voltaram ao estoque), com tipo, fração ideal, ticket médio do tipo (média dos contratos não cancelados do mesmo tipo) e valor editável. Informe o mês de venda de cada uma; atalhos: **ritmo fixo** (N unidades por mês a partir de um mês), **distribuir** (igual pelos meses), **limpar**; filtro por tipo; placar de unidades e valor.',
      '4. **Custos da POC** (só obra): as linhas do Financeiro com % POC e a máscara do custo da POC de Receita, aberta por natureza (drilldown, fechado por padrão; Abrir/Fechar todas). Só **HORIZON - INFORMADO** é digitável; SIENGE - EMPRESARIAL e SIENGE - AGING vêm prontas. Menu da célula: replicar, distribuir, limpar. Resumo da obra: orçamento vigente, custo realizado, POC na trava e aviso de obra sem orçamento (POC 0 = receita não reconhecida). A **Correção Monetária** entra aqui se a linha tiver % POC (digitada mês a mês). Planilha só desta etapa e deste centro no rodapé.',
      '5. **POC**: a POC de Receita e de Despesa projetadas mês a mês (e a POC de Despesa líquida dos distratos), com os indicadores.',
      '6. **Demais contas**: as linhas do Financeiro sem % POC (despesas e receitas administrativas, financeiras…), na mesma grade; planilha da etapa no rodapé.',
      '7. **Conclusão**: o fechamento do nível 1 (realizado no ciclo, projetado e total). **Concluir** calcula e grava a FOTO; o rascunho fica Concluído até alguém clicar em Salvar versão.',
      'Centro **administrativo** pula Vendas, Custos da POC e POC. O rascunho grava sozinho a cada mudança.',
      '',
      '## Regras de cálculo',
      '- **Mesmo motor da DRE realizada.** Até o fim do mês da trava vale o realizado (contratos, distratos, permutas, correção pelo vencimento, Financeiro pela emissão); depois, as premissas. O motor acumula, aplica as POCs e reconhece mês a mês exatamente como na DRE realizada.',
      '- **Vendas**: cada unidade com mês de venda vira um contrato novo naquele mês: valor informado → senão o do contrato registrado no Sienge depois da trava → senão o ticket médio do tipo; fração ideal inteira (participação 100%). Entra na Receita de Vendas (× POC de Receita) e na POC de Despesa (fração vendida).',
      `- **Naturezas** (linhas que calculam pelo Financeiro), pela Origem Projeção da natureza no plano de contas DO CENTRO (o próprio, se tiver; senão o Global): ${Object.entries(COMO_ORIGEM).map(([k, v]) => `**${ROTULO_ORIGEM[k]}** = ${v}`).join('; ')}; **NÃO POSSUI ORIGEM** = nada; natureza sem origem informada também fica de fora.`,
      '- **Correção monetária**: digitada mês a mês (não sai dos títulos).',
      '- **Calculado pelo motor**: receita de vendas e custo dos imóveis (pela POC), estorno de receita e de custo, receita com permuta e com distrato, RET (−alíquota vigente × a BASE do imposto: as linhas de nível 2 acima dele escolhidas em Máscaras › Informar histórico; sem escolha, todas as de cima). **Distratos futuros não são projetados.**',
      '- **POC de Receita** = |custo realizado até a trava + custo projetado| ÷ orçamento vigente da obra, até 100%. **POC de Despesa** = fração vendida (realizada + projetada) + permutas, sem trava (pode passar de 100% se as frações ideais somarem mais que 1).',
      '- **A foto (mensal)**: ao concluir, grava a DRE do orçamento mês a mês do PRIMEIRO lançamento do centro até o fim do ciclo (não só o ciclo): até a trava é o realizado daquele dia; depois, o projetado. É isso que as colunas Projetado mostram — e não muda quando o realizado muda.',
      '',
      '## Realizado × Projetado (aba DRE e dashboard)',
      '- Colunas: **Valor**, **AV %** (no mês a mês, **AH %**), **Projetado** (amarelo pastel) e **Desvio %**. Filtro **Colunas** liga/desliga cada uma. O realizado nunca passa de hoje.',
      '- Filtro **Versão** (Operações): por padrão a última versão salva; "Rascunhos (não salvos)" só aparece se houver rascunho (e vira o padrão quando não há versão). O **dashboard** usa só a versão salva (filtro "Análise" ao lado da tela cheia).',
      `- **Desvio %** = (Valor − Projetado) ÷ |Projetado|, com o realizado até hoje contra o projetado SÓ dos meses até o atual (o mês atual inteiro — regra do DFC). Positivo (verde) = melhor que o projetado; dentro de ±${TOLERANCIA}% fica neutro; abaixo, vermelho.`,
      '- **Consolidado**: o Projetado soma os centros com orçamento; o Desvio compara só o realizado dos centros COM projeção (a legenda diz quantos de quantos).',
      '- **Mês a mês** (clique no centro): meses até a trava em cinza (o projetado é o realizado da data do orçamento — o desvio deles mostra o que mudou no realizado depois); meses futuros só com a coluna Projetado; sem meses vazios nas pontas. Período por mês/ano (o campo aceita digitar "fev/2020").',
      '',
      '## Excel de auditoria',
      'Com projeção, o Excel (botão de download da aba DRE e do dashboard) ganha as abas **Projeção** (versão, orçamentos, totais do ciclo, premissas por origem, regras), **Projeção Mensal** (a foto gravada — o que a coluna Projetado soma), **Memória Projeção** (os meses projetados refeitos em fórmulas: realizado até a trava + premissas, × fator; com o gravado e a diferença), **POC Projeção** e **Premissas Projeção**. Na aba DRE, Projetado e Desvio % do consolidado e de cada centro, em fórmulas. Conferência "MUDOU" = o realizado até a trava mudou depois que o orçamento foi concluído.',
      '',
      '## Perguntas frequentes',
      '- **Por que o projetado de meses passados é igual ao realizado?** Até a trava o orçamento usa o realizado (é a base da projeção). O desvio desses meses só aparece se o realizado mudou depois do orçamento.',
      '- **Lancei algo no Sienge e o Projetado não mudou.** Correto: o Projetado é a foto do dia em que o orçamento foi concluído. Para atualizar, abra o centro, conclua de novo e salve outra versão.',
      '- **Concluir × Salvar versão?** Concluir calcula e grava a foto do rascunho de UM centro. Salvar versão junta os concluídos numa versão da empresa (o que o dashboard usa).',
      '- **Como corrijo um orçamento de uma versão salva?** Uma versão não muda. Crie o rascunho do centro (Novo orçamento — ele já vem com o que estava na versão), ajuste, conclua e salve uma nova versão; os outros centros são copiados da versão anterior.',
      '- **Por que a receita projetada saiu zero?** Obra sem orçamento (POC de Receita 0), unidades sem mês de venda, ou a máscara da POC de Receita não configurada. Veja dre_projecao_explicar e dre_projecao_auditoria.',
      '- **Por que a POC de Despesa passa de 100%?** Ela não tem trava: frações ideais somando mais que 1 ou permutas + vendas acima do total.',
      '- **Por que não consigo digitar uma natureza?** Só HORIZON - INFORMADO é digitável; SIENGE - EMPRESARIAL e SIENGE - AGING vêm do Sienge. Mude a Origem Projeção no Plano de Contas da DRE se precisar.',
      '- **Uma natureza não aparece no assistente.** Ela não tem Máscara DRE, é NÃO ENTRA NA DRE, está com NÃO POSSUI ORIGEM ou sem Origem Projeção no plano do centro.',
      '- **A unidade vendida depois da trava aparece?** Sim, como disponível na trava, com o mês e o valor do contrato sugeridos.',
      '- **Distratos futuros?** Não são projetados (estorno e receita de distrato só do realizado).',
      '- **Mudei a base do RET (Máscaras › Informar histórico) e o Projetado continua com o RET antigo.** Correto: o Projetado é a foto do dia em que o orçamento foi concluído, com a base que valia naquele dia; o realizado (coluna Valor) já usa a base nova. Para o Projetado usar a base nova, conclua cada centro de novo e salve outra versão (dre_projecao_auditoria mostra "MUDOU" enquanto isso).',
      '- **Por que o Desvio do consolidado não usa todos os centros?** Para não comparar o realizado de um centro sem orçamento com projetado nenhum.',
      '- **Por que mês futuro só tem Projetado?** Não há realizado no futuro (a DRE para em hoje).',
      '- **O que a planilha importa?** Ciclos (início, fim, trava), vendas (mês e valor por unidade), Custos da POC e Demais contas (só HORIZON - INFORMADO) e correção. Dentro do assistente, só o centro e a etapa abertos (recorte).',
      '- **Quem vê os rascunhos?** Só o Operações (tela DRE Construtoras). Dashboards só veem versão salva.',
      '- **Centro administrativo tem POC?** Não: só a etapa Demais contas (e a correção, se não tiver % POC).',
      '',
      '## Qual ferramenta usar',
      '- Os orçamentos de uma versão ou os rascunhos (ciclo, trava, quem concluiu, totais, POC): **dre_projecao_orcamentos**.',
      '- O que foi premissa num centro (vendas por unidade, naturezas por origem mês a mês, correção, estoque que sobra): **dre_projecao_premissas**.',
      '- "Como esse número projetado foi criado?" (linha, grupo ou total, por centro ou consolidado, num mês ou período): **dre_projecao_explicar**.',
      '- Realizado × Projetado com o Desvio % da tela (por linha, centro, mês a mês, maiores desvios): **dre_projecao_desvio**.',
      '- Conferir a projeção (refeita hoje × gravada, POCs, alertas, o que mudou no realizado desde o orçamento): **dre_projecao_auditoria**.',
      '- O realizado em si: dre_demonstrativo e dre_explicar_numero.',
    ];
    return md.join('\n');
  }),
};

// ═══ dre_projecao_orcamentos ════════════════════════════════════════════════════════════════════
const orcamentosTool = {
  name: 'dre_projecao_orcamentos',
  description:
    'Os orçamentos da projeção da DRE de uma versão salva (padrão: a última) ou os rascunhos: por centro, a situação, o ciclo, a trava (último mês realizado), o primeiro mês projetado, ' +
    'quem concluiu e quando, os totais do nível 1 no ciclo (realizado até a trava, projetado e total — a lista da aba Projeções), as premissas resumidas (vendas, naturezas por Origem Projeção, ' +
    'correção) e as POCs na trava e no fim do ciclo. Também lista as versões salvas.',
  inputSchema: { ...FONTE, ...CENTROS },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const centros = await resolverCentros(empresaId, a.centros);
    const f = await carregar(empresaId, { ...fonteDe(a, ctx), centros });
    return {
      fonte: descreverFonte(f),
      versoes_salvas: f.versoes.map((v) => ({ numero: v.numero, salva_em: quando(v.criado_em), por: v.usuario })),
      ...(f.avisos.length ? { fora_da_projecao: f.avisos } : {}),
      orcamentos: f.orcamentos.map((o) => {
        const r = o.resultado || {};
        const vendas = r.vendas || [];
        const porOrigem = {};
        (r.naturezas || []).forEach((n) => {
          const k = ROTULO_ORIGEM[n.origem] || n.origem;
          porOrigem[k] = r2((porOrigem[k] || 0) + Object.values(n.valores || {}).reduce((t, v) => t + num(v), 0));
        });
        const poc = r.poc;
        const fimCiclo = poc?.meses?.[poc.meses.length - 1];
        return {
          centro: nomeCentro(o),
          tipo: o.natureza,
          situacao: rotuloOrc(o),
          ciclo: `${rotMes(o.ciclo_inicio)} a ${rotMes(o.ciclo_fim)}`,
          trava: o.trava ? rotMes(o.trava) : `sem (realizado até ${rotMes(calculo.somarMeses(o.ciclo_inicio, -1))})`,
          projeta_a_partir_de: rotMes(primeiroProjetado(o)),
          concluido_em: quando(o.concluido_em),
          por: o.usuario,
          totais_do_ciclo: (r.niveis1 || []).map((g) => ({ linha: g.descricao, realizado_ate_trava: r2(g.realizado), projetado: r2(g.projetado), total: r2(g.total) })),
          premissas: {
            vendas: { unidades: vendas.length, valor: r2(vendas.reduce((t, v) => t + num(v.valor), 0)), meses: [...new Set(vendas.map((v) => v.mes))].sort().map(rotMes) },
            naturezas_por_origem: porOrigem,
            correcao_monetaria: r2(Object.values(r.correcao || {}).reduce((t, v) => t + num(v), 0)),
          },
          ...(poc
            ? {
                poc: {
                  na_trava: { receita_pct: pct(poc.trava?.receita), despesa_pct: pct(poc.trava?.despesa), custo: r2(poc.trava?.custo), orcamento: r2(poc.trava?.orcamento) },
                  fim_do_ciclo: fimCiclo ? { mes: rotMes(fimCiclo.mes), receita_pct: pct(fimCiclo.receita), despesa_pct: pct(fimCiclo.despesa), custo: r2(fimCiclo.custo), orcamento: r2(fimCiclo.orcamento) } : null,
                },
              }
            : {}),
        };
      }),
      proximo_passo: 'Premissas de um centro: dre_projecao_premissas. Um número: dre_projecao_explicar. Comparação com o realizado: dre_projecao_desvio.',
    };
  }),
};

// ═══ dre_projecao_premissas ═════════════════════════════════════════════════════════════════════
async function orcamentoDoCentro(empresaId, a, ctx) {
  if (!a.centro) throw falha('Informe o centro de custo (id, nome ou apelido).');
  const [id] = await resolverCentros(empresaId, [a.centro]);
  const f = await carregar(empresaId, { ...fonteDe(a, ctx), centros: [id] });
  const o = f.orcamentos.find((x) => x.centro_id === id);
  if (!o) throw falha(`O centro ${id} não tem orçamento em ${descreverFonte(f)}.${f.avisos.length ? ` ${f.avisos.join(' ')}` : ''}`);
  return { f, o };
}

const premissasTool = {
  name: 'dre_projecao_premissas',
  description:
    'O que entrou na projeção de UM centro depois da trava: as vendas projetadas (unidade, tipo, fração ideal, mês, valor e de onde veio o valor — informado, contrato do Sienge ou ticket médio), ' +
    'o estoque que fica sem venda (unidades disponíveis na trava sem mês), as naturezas de cada linha da DRE por Origem Projeção (HORIZON - INFORMADO, SIENGE - EMPRESARIAL, SIENGE - AGING) mês a mês ' +
    'e a correção monetária digitada. Filtre por tipo, mês ou linha.',
  inputSchema: {
    centro: z.union([z.string(), z.number()]).describe('O centro de custo (id, nome ou apelido).'),
    ...FONTE,
    tipo: z.enum(['todas', 'vendas', 'naturezas', 'correcao']).optional().describe('Qual premissa (padrão: todas).'),
    mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().describe('Só um mês (AAAA-MM).'),
    linha: z.union([z.string(), z.number()]).optional().describe('Só as naturezas de uma linha da DRE (nome ou id).'),
    limite: z.number().int().min(1).max(500).optional().describe('Máximo de unidades/naturezas listadas (padrão 200).'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { f, o } = await orcamentoDoCentro(empresaId, a, ctx);
    const M = await motorDe(empresaId, o);
    const arvore = await dreMascaras.list(empresaId);
    const tipo = a.tipo || 'todas';
    const limite = a.limite || 200;
    const noMes = (mes) => !a.mes || mes === a.mes;
    let alvoLinha = null;
    if (a.linha) {
      const l = resolverLinha(arvore, a.linha);
      alvoLinha = new Set(l.tipo === 'linha' ? [l.no.id] : l.tipo === 'grupo' ? l.no.filhos.map((x) => x.id) : arvore.slice(0, arvore.indexOf(l.no)).flatMap((g) => g.filhos.map((x) => x.id)));
    }
    const mascaras = new Map(M.motor.mascaras.map((x) => [x.id, x.descricao]));
    const out = {
      centro: nomeCentro(o),
      fonte: descreverFonte(f),
      situacao: rotuloOrc(o),
      trava: o.trava ? rotMes(o.trava) : null,
      meses_projetados: `${rotMes(M.j.inicioProjecao)} a ${rotMes(M.j.cicloFim)}`,
      origem_dos_dados: M.usouFoto ? 'premissas gravadas no orçamento (a foto)' : 'premissas calculadas agora (orçamento sem foto completa)',
    };
    if (tipo === 'todas' || tipo === 'vendas') {
      const vendas = M.vendas.filter((v) => noMes(v.mes));
      const comVenda = new Set(M.vendas.map((v) => v.chave));
      out.vendas = {
        unidades: vendas.length,
        valor: r2(vendas.reduce((t, v) => t + num(v.valor), 0)),
        fracao_ideal_vendida: r8(vendas.reduce((t, v) => t + num(v.fracao_ideal), 0)),
        por_mes: Object.entries(
          vendas.reduce((acc, v) => {
            acc[v.mes] = acc[v.mes] || { unidades: 0, valor: 0 };
            acc[v.mes].unidades += 1;
            acc[v.mes].valor += num(v.valor);
            return acc;
          }, {})
        )
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([mes, x]) => ({ mes: rotMes(mes), unidades: x.unidades, valor: r2(x.valor) })),
        lista: vendas.slice(0, limite).map((v) => ({ unidade: v.unidade, tipo: v.tipo, fracao_ideal: r8(num(v.fracao_ideal)), mes: rotMes(v.mes), valor: r2(v.valor), de_onde_veio_o_valor: comoDaVenda(v, o, M.naTrava) })),
        estoque_sem_venda_no_ciclo: M.naTrava
          .filter((u) => !comVenda.has(u.chave))
          .slice(0, limite)
          .map((u) => ({ unidade: u.unidade, tipo: u.tipo, fracao_ideal: r8(num(u.fracao_ideal)), ticket_medio_do_tipo: r2(u.ticket) })),
        disponiveis_na_trava: M.naTrava.length,
      };
    }
    if (tipo === 'todas' || tipo === 'naturezas') {
      const nats = M.naturezas.filter((n) => !alvoLinha || alvoLinha.has(n.mascara_id));
      out.naturezas = nats
        .map((n) => {
          const vs = Object.entries(n.valores || {}).filter(([mes]) => noMes(mes));
          return {
            linha_dre: mascaras.get(n.mascara_id) || n.mascara_id,
            natureza: `${n.natureza_id} ${n.nome || ''}`.trim(),
            origem: ROTULO_ORIGEM[n.origem] || n.origem,
            como: COMO_ORIGEM[n.origem],
            total: r2(vs.reduce((t, [, v]) => t + num(v), 0)),
            meses: vs.sort(([x], [y]) => x.localeCompare(y)).map(([mes, v]) => ({ mes: rotMes(mes), valor: r2(v) })),
          };
        })
        .filter((n) => n.meses.length)
        .sort((x, y) => Math.abs(y.total) - Math.abs(x.total))
        .slice(0, limite);
      const porLinha = {};
      out.naturezas.forEach((n) => (porLinha[n.linha_dre] = r2((porLinha[n.linha_dre] || 0) + n.total)));
      out.total_por_linha = porLinha;
    }
    if (tipo === 'todas' || tipo === 'correcao') {
      out.correcao_monetaria = M.correcao.filter((c) => noMes(c.data.slice(0, 7))).map((c) => ({ mes: rotMes(c.data.slice(0, 7)), valor: r2(c.valor) }));
    }
    out.lembrete = 'Contratos, estornos, permutas, distratos e RET não são premissa: o motor calcula. Distratos futuros não são projetados.';
    return out;
  }),
};

// ═══ dre_projecao_explicar ══════════════════════════════════════════════════════════════════════
// A conta de uma linha de nível 2 num orçamento, nos meses projetados de [de, ate] (motor refeito).
function contaProjetada(M, x, de, ate) {
  const regra = M.regras.get(x.id);
  const id = M.centro.id;
  if (!regra || (regra.tipo !== 'FIN' && regra.tipo !== 'RECEITA')) return { regra };
  const travaFim = M.j.travaFim;
  const conta = contaDaLinha(M.dm, x, id, de, ate);
  const real = (D) => acumulado(M.dm, regra, x, id, D < travaFim ? D : travaFim);
  return {
    regra,
    conta,
    base_realizada_ate_trava: real(ate),
    premissas_ate_o_fim: conta.base_ate_fim - real(ate),
    premissas_ate_a_vespera: conta.base_ate_vespera - real(vespera(de)),
  };
}

const explicarTool = {
  name: 'dre_projecao_explicar',
  description:
    'Explica como um número PROJETADO da DRE foi criado — de qualquer linha de nível 2, grupo ou totalizadora, no consolidado ou num centro, num mês ou período. Traz: o projetado gravado (a foto do orçamento) ' +
    'separado em meses até a trava (realizado da data do orçamento) e meses projetados; nos projetados, a conta do motor (base acumulada = realizado até a trava + premissas; × POC projetada; véspera e fim; ' +
    'avanço sobre a base antiga × base nova), a POC usada e de onde veio (orçamento, custo realizado + projetado, frações vendida/projetada), as premissas que formam a base (vendas, naturezas, correção), ' +
    'a conferência refeito hoje × gravado, o realizado ao lado e onde conferir no Excel.',
  inputSchema: {
    linha: z.union([z.string(), z.number()]).describe('A linha da DRE: nome (ex.: "receita com venda", "custo dos imóveis", "lucro bruto") ou id.'),
    ...PERIODO_PROJ,
    ...CENTROS,
    ...FONTE,
    mensal: z.boolean().optional().describe('Inclui o mês a mês (gravado e refeito).'),
    limite: z.number().int().min(1).max(50).optional().describe('Quantas premissas mostrar (padrão 10).'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const p = periodoProj(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const [f, arvore] = await Promise.all([carregar(empresaId, { ...fonteDe(a, ctx), centros }), dreMascaras.list(empresaId)]);
    if (!f.orcamentos.length) throw falha(`Nenhum orçamento em ${descreverFonte(f)}${centros.length ? ' para esses centros' : ''}.`);
    const alvo = resolverLinha(arvore, a.linha);
    const limite = a.limite || 10;
    const mesDe = p.de.slice(0, 7);
    const mesAte = p.ate.slice(0, 7);
    const noPeriodo = (m) => m >= mesDe && m <= mesAte;
    const realizado = await dados(empresaId, { ...p, centros: f.orcamentos.map((o) => o.centro_id) });
    const realPorCentro = new Map(realizado.resultado.por_centro.map((c) => [c.id, completar(arvore, c.valores)]));

    const porOrc = f.orcamentos.map((o) => {
      const trava = o.mensal.trava;
      const total = completar(arvore, somaGravada(o, noPeriodo));
      const ateTrava = completar(arvore, somaGravada(o, (m) => noPeriodo(m) && trava && m <= trava));
      const proj = completar(arvore, somaGravada(o, (m) => noPeriodo(m) && (!trava || m > trava)));
      const comp = completar(arvore, somaGravada(o, (m) => noPeriodo(m) && m <= hojeIso().slice(0, 7)));
      return { o, total, ateTrava, proj, comp };
    });
    const id = alvo.no.id;
    const somaDe = (k) => porOrc.reduce((t, x) => t + num(x[k][id]), 0);
    const out = {
      fonte: descreverFonte(f),
      periodo: `${br(p.de)} a ${br(p.ate)}`,
      linha: alvo.no.descricao,
      tipo: alvo.tipo,
      projetado_gravado: r2(somaDe('total')),
      partes: {
        meses_ate_a_trava_realizado_na_data_do_orcamento: r2(somaDe('ateTrava')),
        meses_projetados: r2(somaDe('proj')),
      },
      realizado_hoje: {
        valor_centros_com_projecao: r2(porOrc.reduce((t, x) => t + num(realPorCentro.get(x.o.centro_id)?.[id]), 0)),
        projetado_ate_o_mes_atual: r2(somaDe('comp')),
        desvio_pct: (() => {
          const c = somaDe('comp');
          const r = porOrc.reduce((t, x) => t + num(realPorCentro.get(x.o.centro_id)?.[id]), 0);
          return c ? pct((r - c) / Math.abs(c)) : null;
        })(),
      },
      por_centro: porOrc
        .map((x) => ({ centro: nomeCentro(x.o), trava: x.o.mensal.trava ? rotMes(x.o.mensal.trava) : null, projetado: r2(x.total[id]), ate_a_trava: r2(x.ateTrava[id]), projetados: r2(x.proj[id]) }))
        .filter((x) => x.projetado)
        .sort((x, y) => Math.abs(y.projetado) - Math.abs(x.projetado)),
    };

    if (alvo.tipo !== 'linha') {
      const i = arvore.indexOf(alvo.no);
      const partes = alvo.tipo === 'grupo' ? alvo.no.filhos : arvore.slice(0, i).filter((g) => !g.totalizadora);
      out.regra = alvo.tipo === 'grupo' ? 'Grupo de nível 1 = soma das linhas de nível 2 dele.' : 'Totalizadora = soma de todos os grupos acima dela.';
      out.composicao = partes.map((g) => ({ linha: g.descricao, projetado: r2(porOrc.reduce((t, x) => t + num(x.total[g.id]), 0)) }));
      out.proximo_passo = 'Para abrir cada parte, chame dre_projecao_explicar com a linha de nível 2.';
      return out;
    }

    // Linha de nível 2: a conta do motor nos meses projetados de cada orçamento.
    const x = alvo.no;
    const contas = [];
    for (const { o } of porOrc) {
      const mesesProj = calculo.janela(o).meses.filter(noPeriodo);
      if (!mesesProj.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const M = await motorDe(empresaId, o);
      const de = `${mesesProj[0]}-01`;
      const ate = fimDoMes(`${mesesProj[mesesProj.length - 1]}-01`);
      const mx = M.motor.mascaras.find((y) => y.id === x.id);
      if (!mx) continue;
      const c = contaProjetada(M, mx, de, ate);
      const regra = c.regra;
      const gravado = somaGravada(o, (m) => mesesProj.includes(m))[x.id] || 0;
      const item = { centro: nomeCentro(o), meses: `${rotMes(mesesProj[0])} a ${rotMes(mesesProj[mesesProj.length - 1])}`, regra: regra?.texto || '—', gravado: r2(gravado) };
      if (regra?.tipo === 'RET') {
        const ordem = M.motor.mascaras;
        const iR = ordem.findIndex((y) => y.id === x.id);
        const base = baseDoImposto(ordem, iR);
        item.formula = `−alíquota vigente × soma das linhas ${mx.imposto_base ? 'da base escolhida' : 'acima'} (${base.map((y) => y.descricao).join(', ')}), mês a mês`;
        item.meses_detalhe = mesesProj.map((mes) => {
          const idx = o.mensal.meses.indexOf(mes);
          const baseMes = base.reduce((t, y) => t + num(o.mensal.valores[y.id]?.[idx]), 0);
          const h = M.aliquotaEm(x.id, `${mes}-01`);
          const aliq = h ? h.aliquota : 0;
          const gravadoMes = num(o.mensal.valores[x.id]?.[idx]);
          return {
            mes: rotMes(mes),
            base_do_imposto: r2(baseMes),
            aliquota_pct: aliq,
            valor_gravado: r2(gravadoMes),
            pela_base_de_hoje: r2((-baseMes * aliq) / 100),
          };
        });
        // O orçamento foi gravado com outra base (ex.: concluído antes de a base do imposto ser escolhida
        // em Máscaras › Informar histórico): o gravado não bate com −alíquota × base de hoje.
        const diverge = item.meses_detalhe.filter((mm) => Math.abs(mm.valor_gravado - mm.pela_base_de_hoje) >= 0.01);
        item.base_do_imposto = mx.imposto_base ? 'escolhida em Máscaras › Informar histórico (só as linhas listadas)' : 'todas as linhas de nível 2 acima';
        if (diverge.length)
          item.atencao = `Em ${diverge.length} mês(es) o RET gravado no orçamento não é −alíquota × a base de hoje: o orçamento foi concluído com outra base do imposto (a regra que valia no dia). O Projetado mostra o gravado; para usar a base atual, conclua o centro de novo e salve outra versão.`;
      } else if (c.conta) {
        const k = c.conta;
        item.formula = regra.fator
          ? `valor = base acumulada até ${br(ate)} × ${NOME_FATOR[regra.fator]} em ${br(ate)} − base acumulada até ${br(vespera(de))} × ${NOME_FATOR[regra.fator]} em ${br(vespera(de))}`
          : 'valor = base acumulada até o fim − base acumulada até a véspera (= o projetado no período; fator 100%)';
        item.conta = {
          base_ate_vespera: r2(k.base_ate_vespera),
          base_ate_fim: r2(k.base_ate_fim),
          base_realizada_ate_a_trava: r2(c.base_realizada_ate_trava),
          premissas_ate_o_fim: r2(c.premissas_ate_o_fim),
          fator_vespera: r8(k.fator_vespera),
          fator_fim: r8(k.fator_fim),
          reconhecido_ate_vespera: r2(k.reconhecido_ate_vespera),
          reconhecido_ate_fim: r2(k.reconhecido_ate_fim),
          valor_refeito_hoje: r2(k.valor),
          avanco_sobre_base_antiga: r2(k.avanco_sobre_base_antiga),
          base_nova_x_fator: r2(k.base_nova_x_fator),
        };
        item.confere_com_o_gravado = Math.abs(k.valor - gravado) < 0.01 ? 'sim' : `não: diferença de ${brl(k.valor - gravado)} — o realizado até a trava mudou depois que o orçamento foi concluído`;
        if (regra.fator) {
          const D0 = vespera(de);
          const D1 = ate;
          const pocs = (D) => {
            const r = M.motor.pocEm ? M.motor.pocEm(o.centro_id, D) : null;
            const vend = M.motor.base.FRACAO_VENDAS(o.centro_id, D);
            const vendProj = M.vendas.filter((v) => `${v.mes}-01` <= D).reduce((t, v) => t + num(v.fracao_ideal), 0);
            return {
              data: br(D),
              poc_receita: r ? r8(r.poc) : null,
              orcamento_vigente: r ? r2(r.orcamento) : null,
              custo_acumulado: r ? r2(r.custo) : null,
              fracao_vendida_ate_a_trava: r8(vend - vendProj),
              fracao_vendida_projetada: r8(vendProj),
              fracao_permuta: r8(M.motor.base.FRACAO_PERMUTA(o.centro_id, D)),
              poc_despesa: r8(M.motor.pocDespesa(o.centro_id, D)),
              fracao_distratada: r8(M.motor.fracaoDistratada(o.centro_id, D)),
            };
          };
          item.pocs = { vespera: pocs(D0), fim: pocs(D1) };
        }
        // Premissas que formam a base nova (as do período projetado).
        const dentro = (mes) => mesesProj.includes(mes);
        if (regra.base?.fonte === 'FIN') {
          const ms = new Set(regra.base.mascaras);
          item.premissas_do_periodo = M.naturezas
            .filter((n) => ms.has(n.mascara_id))
            .map((n) => ({
              natureza: `${n.natureza_id} ${n.nome || ''}`.trim(),
              origem: ROTULO_ORIGEM[n.origem] || n.origem,
              valor: r2(Object.entries(n.valores || {}).reduce((t, [mes, v]) => (dentro(mes) ? t + num(v) : t), 0)),
            }))
            .filter((n) => n.valor)
            .sort((p1, p2) => Math.abs(p2.valor) - Math.abs(p1.valor))
            .slice(0, limite);
          if (regra.base.sinal < 0) item.sinal = 'a linha usa a base com o sinal invertido (estorno de custo × fração distratada)';
        } else if (regra.base?.fonte === 'CORR') {
          item.premissas_do_periodo = M.correcao.filter((cc) => dentro(cc.data.slice(0, 7))).map((cc) => ({ mes: rotMes(cc.data.slice(0, 7)), correcao: r2(cc.valor) }));
        } else if (regra.base?.coluna === 'venda') {
          const vs = M.vendas.filter((v) => dentro(v.mes));
          item.premissas_do_periodo = {
            unidades_vendidas: vs.length,
            valor: r2(vs.reduce((t, v) => t + num(v.valor), 0)),
            maiores: [...vs].sort((p1, p2) => num(p2.valor) - num(p1.valor)).slice(0, limite).map((v) => ({ unidade: v.unidade, tipo: v.tipo, mes: rotMes(v.mes), valor: r2(v.valor), de_onde_veio: comoDaVenda(v, o, M.naTrava) })),
          };
        } else {
          item.premissas_do_periodo = 'Nenhuma: esta linha só tem o realizado até a trava (permutas e distratos não são projetados); o valor nos meses projetados vem do avanço da POC sobre essa base.';
        }
        if (a.mensal) {
          item.mes_a_mes = mesesProj.map((mes) => {
            const k2 = contaDaLinha(M.dm, mx, o.centro_id, `${mes}-01`, fimDoMes(`${mes}-01`));
            const idx = o.mensal.meses.indexOf(mes);
            return { mes: rotMes(mes), gravado: r2(o.mensal.valores[x.id]?.[idx]), refeito_hoje: r2(k2.valor), avanco: r2(k2.avanco_sobre_base_antiga), base_nova: r2(k2.base_nova_x_fator), fator_fim: r8(k2.fator_fim) };
          });
        }
      } else {
        item.formula = 'Linha sem cálculo (traço na DRE).';
      }
      contas.push(item);
    }
    out.regra = contas[0]?.regra;
    out.meses_projetados_por_centro = contas.sort((p1, p2) => Math.abs(p2.gravado) - Math.abs(p1.gravado));
    const top = out.meses_projetados_por_centro.find((c) => c.conta);
    if (top) {
      const k = top.conta;
      out.exemplo = top.conta.fator_fim !== 1 || top.conta.fator_vespera !== 1
        ? `Em ${top.centro} (${top.meses}): base acumulada de ${brl(k.base_ate_vespera)} na véspera para ${brl(k.base_ate_fim)} no fim (${brl(k.base_realizada_ate_a_trava)} realizado até a trava + ${brl(k.premissas_ate_o_fim)} de premissas); fator de ${pctTxt(k.fator_vespera)} para ${pctTxt(k.fator_fim)}. ` +
          `Reconhecido até o fim ${brl(k.reconhecido_ate_fim)} − já reconhecido ${brl(k.reconhecido_ate_vespera)} = ${brl(k.valor_refeito_hoje)} (${brl(k.avanco_sobre_base_antiga)} de avanço sobre a base antiga + ${brl(k.base_nova_x_fator)} de base nova).`
        : `Em ${top.centro} (${top.meses}): projetado ${brl(k.valor_refeito_hoje)} = premissas do período (base de ${brl(k.base_ate_vespera)} para ${brl(k.base_ate_fim)}).`;
    }
    out.onde_conferir =
      'Excel de auditoria (com a mesma versão): aba Projeção Mensal (o gravado, filtre a linha e o centro), Memória Projeção (a conta mês a mês em fórmulas, com o gravado e a diferença), POC Projeção e Premissas Projeção.';
    return out;
  }),
};

// ═══ dre_projecao_desvio ════════════════════════════════════════════════════════════════════════
const desvioTool = {
  name: 'dre_projecao_desvio',
  description:
    'Realizado × Projetado como a aba DRE e o dashboard mostram: por linha (grupos, linhas e totais), o Valor realizado, o Projetado do período, o projetado comparável (só meses até o atual) e o Desvio % ' +
    '= (Valor − Projetado) ÷ |Projetado| (no consolidado, o realizado só dos centros com projeção; ±10% neutro). Opcional: por centro, mês a mês de um centro (meses até a trava marcados — realizado da data do orçamento) ' +
    'e o ranking dos maiores desvios (centro × linha) com o que olhar.',
  inputSchema: {
    ...PERIODO_PROJ,
    ...CENTROS,
    ...FONTE,
    por_centro: z.boolean().optional().describe('Inclui cada centro.'),
    mensal: z.boolean().optional().describe('Mês a mês (de um centro só: informe um centro).'),
    ranking: z.number().int().min(1).max(50).optional().describe('Quantos maiores desvios listar (padrão 10).'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const p = periodoProj(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const [f, d] = await Promise.all([carregar(empresaId, { ...fonteDe(a, ctx), centros }), dados(empresaId, { ...p, centros })]);
    const { arvore, resultado: R } = d;
    const mesDe = p.de.slice(0, 7);
    const mesAte = p.ate.slice(0, 7);
    const atual = hojeIso().slice(0, 7);
    const noPeriodo = (m) => m >= mesDe && m <= mesAte;
    const orcs = new Map(f.orcamentos.map((o) => [o.centro_id, o]));
    const desvio = (r, c) => (c ? pct((num(r) - c) / Math.abs(c)) : null);
    const leitura = (dv) => (dv === null ? 'sem projetado comparável' : Math.abs(dv) < TOLERANCIA ? 'neutro (dentro de ±10%)' : dv > 0 ? 'melhor que o projetado' : 'pior que o projetado');

    const colunas = R.por_centro.map((c) => {
      const o = orcs.get(c.id);
      return {
        c,
        o,
        real: completar(arvore, c.valores),
        proj: o ? completar(arvore, somaGravada(o, noPeriodo)) : null,
        comp: o ? completar(arvore, somaGravada(o, (m) => noPeriodo(m) && m <= atual)) : null,
      };
    });
    const comProj = colunas.filter((x) => x.o);
    const somaIds = (lista, k, id) => lista.reduce((t, x) => t + num(x[k]?.[id]), 0);
    const consolidado = completar(arvore, R.valores);
    const linhas = ordemLinhas(arvore).map((l) => {
      const id = l.no.id;
      const comp = somaIds(comProj, 'comp', id);
      const realD = somaIds(comProj, 'real', id);
      const dv = desvio(realD, comp);
      const o = {
        tipo: l.tipo,
        linha: l.no.descricao,
        valor: r2(consolidado[id]),
        projetado: r2(somaIds(comProj, 'proj', id)),
        projetado_ate_o_mes_atual: r2(comp),
        realizado_dos_centros_com_projecao: r2(realD),
        desvio_pct: dv,
        leitura: leitura(dv),
      };
      if (a.por_centro)
        o.centros = Object.fromEntries(
          colunas.map((x) => [
            `${x.c.id} · ${x.c.rotulo || x.c.nome}`,
            x.o ? { valor: r2(x.real[id]), projetado: r2(x.proj[id]), desvio_pct: desvio(x.real[id], x.comp[id]) } : { valor: r2(x.real[id]), projetado: 'sem orçamento' },
          ])
        );
      return o;
    });

    // Maiores desvios (centro × linha de nível 2), pela diferença em R$.
    const rank = [];
    comProj.forEach((x) =>
      arvore.forEach((g) =>
        g.filhos.forEach((fl) => {
          const r = num(x.real[fl.id]);
          const c = num(x.comp[fl.id]);
          if (Math.abs(r - c) < 0.01) return;
          rank.push({ centro: `${x.c.id} · ${x.c.rotulo || x.c.nome}`, linha: fl.descricao, realizado: r2(r), projetado_ate_o_mes_atual: r2(c), diferenca: r2(r - c), desvio_pct: desvio(r, c) });
        })
      )
    );
    rank.sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca));

    const out = {
      fonte: descreverFonte(f),
      periodo: `${br(p.de)} a ${br(p.ate)} (realizado até ${br(hojeIso())}; projetado comparável até ${rotMes(atual)})`,
      centros_com_projecao: `${comProj.length} de ${colunas.length}`,
      regra: `Desvio % = (Valor − Projetado) ÷ |Projetado|, com o realizado até hoje e o projetado só dos meses até o atual; no consolidado, o realizado só dos centros com projeção. Positivo = melhor (receita maior ou custo menor); ±${TOLERANCIA}% = neutro.`,
      linhas,
      maiores_desvios: rank.slice(0, a.ranking || 10).map((x) => ({ ...x, o_que_olhar: 'dre_projecao_explicar (linha + centro) para a premissa; dre_explicar_numero para o realizado.' })),
    };

    if (a.mensal) {
      if (colunas.length !== 1) throw falha('Para o mês a mês, informe um centro só (como na tela: clique no centro).');
      const x = colunas[0];
      if (!x.o) throw falha(`${x.c.id} não tem orçamento em ${descreverFonte(f)}.`);
      const trava = x.o.mensal.trava;
      out.mensal = {
        centro: `${x.c.id} · ${x.c.rotulo || x.c.nome}`,
        trava: trava ? rotMes(trava) : null,
        meses: x.o.mensal.meses.filter(noPeriodo).map((mes) => {
          const idx = x.o.mensal.meses.indexOf(mes);
          const real = (x.c.meses || []).find((mm) => mm.mes === mes);
          const realC = real ? completar(arvore, real.valores) : {};
          const projC = completar(arvore, Object.fromEntries(Object.entries(x.o.mensal.valores).map(([k, vs]) => [k, vs[idx]])));
          return {
            mes: rotMes(mes),
            situacao: mes > atual ? 'futuro (só projetado)' : trava && mes <= trava ? 'até a trava (projetado = realizado da data do orçamento)' : 'projetado',
            linhas: ordemLinhas(arvore)
              .map((l) => ({ linha: l.no.descricao, valor: mes > atual ? null : r2(realC[l.no.id]), projetado: r2(projC[l.no.id]), desvio_pct: mes > atual ? null : desvio(realC[l.no.id], projC[l.no.id]) }))
              .filter((l) => l.valor || l.projetado),
          };
        }),
      };
    }
    return out;
  }),
};

// ═══ dre_projecao_auditoria ═════════════════════════════════════════════════════════════════════
const auditoriaTool = {
  name: 'dre_projecao_auditoria',
  description:
    'Audita a projeção: refaz cada orçamento com o realizado de HOJE e as premissas gravadas e confere com a foto (o que mudou no realizado até a trava desde que o orçamento foi concluído — por linha e mês), ' +
    'confere as POCs gravadas, e traz os alertas: rascunhos em andamento, centros sem orçamento, naturezas sem Origem Projeção, obra sem orçamento (POC 0), vendas sem valor ou sem fração ideal, ' +
    'unidades disponíveis sem venda no ciclo, ciclo já vencido.',
  inputSchema: { ...FONTE, ...CENTROS },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const centros = await resolverCentros(empresaId, a.centros);
    const f = await carregar(empresaId, { ...fonteDe(a, ctx), centros });
    const arvore = await dreMascaras.list(empresaId);
    const nomes = new Map(arvore.flatMap((g) => g.filhos.map((x) => [x.id, x.descricao])));
    const atual = hojeIso().slice(0, 7);
    const alertas = [];
    const conferencias = [];
    for (const o of f.orcamentos) {
      // eslint-disable-next-line no-await-in-loop
      const r = await calculo.calcular(empresaId, o, { foto: o.resultado });
      const g = o.mensal;
      const difs = [];
      Object.entries(g.valores).forEach(([mid, vs]) => {
        vs.forEach((v, i) => {
          const mes = g.meses[i];
          const j = r.mensal.meses.indexOf(mes);
          const novo = j >= 0 ? r.mensal.valores[mid]?.[j] : null;
          const d = num(novo) - num(v);
          if (Math.abs(d) >= 0.01) difs.push({ mes, linha: nomes.get(Number(mid)) || mid, gravado: r2(v), refeito_hoje: r2(novo), diferenca: r2(d), parte: g.trava && mes <= g.trava ? 'até a trava (realizado mudou)' : 'projetado (base realizada mudou)' });
        });
      });
      difs.sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca));
      // POC gravada × refeita.
      let maiorPoc = 0;
      (o.resultado?.poc?.meses || []).forEach((pm) => {
        const n = (r.poc?.meses || []).find((x) => x.mes === pm.mes);
        if (n) maiorPoc = Math.max(maiorPoc, Math.abs(num(n.receita) - num(pm.receita)), Math.abs(num(n.despesa) - num(pm.despesa)));
      });
      conferencias.push({
        centro: nomeCentro(o),
        situacao: rotuloOrc(o),
        concluido_em: quando(o.concluido_em),
        refeito_hoje_x_gravado: difs.length ? `MUDOU em ${difs.length} linha×mês` : 'OK (bate centavo a centavo)',
        soma_das_diferencas_absolutas: r2(difs.reduce((t, x) => t + Math.abs(x.diferenca), 0)),
        maiores_diferencas: difs.slice(0, 10).map((x) => ({ ...x, mes: rotMes(x.mes) })),
        poc_refeita_x_gravada: maiorPoc < 1e-6 ? 'OK' : `MUDOU (maior diferença ${pct(maiorPoc, 4)} p.p.)`,
      });

      // Alertas do orçamento.
      const res = o.resultado || {};
      if (o.status !== 'CONCLUIDO') alertas.push({ nivel: 'Verificar', centro: nomeCentro(o), alerta: 'Rascunho em andamento: o projetado é calculado na hora e muda a cada edição (não está numa versão).' });
      if (o.natureza === 'OBRA' && res.poc && !(num(res.poc.meses?.[res.poc.meses.length - 1]?.orcamento) > 0))
        alertas.push({ nivel: 'Atenção', centro: nomeCentro(o), alerta: 'Obra sem orçamento vigente no ciclo: POC de Receita 0 — a receita projetada não é reconhecida. Cadastre o orçamento da obra (aba Orçamento do DRE Gerencial).' });
      const vendas = res.vendas || [];
      const semValor = vendas.filter((v) => !num(v.valor));
      if (semValor.length) alertas.push({ nivel: 'Verificar', centro: nomeCentro(o), alerta: `${semValor.length} venda(s) projetada(s) com valor zero (sem valor informado nem ticket médio do tipo).` });
      const semFracao = vendas.filter((v) => !num(v.fracao_ideal));
      if (semFracao.length) alertas.push({ nivel: 'Atenção', centro: nomeCentro(o), alerta: `${semFracao.length} venda(s) projetada(s) de unidade sem fração ideal: não entram na POC de Despesa (custo reconhecido a menos).` });
      if (o.ciclo_fim < atual) alertas.push({ nivel: 'Info', centro: nomeCentro(o), alerta: `O ciclo terminou em ${rotMes(o.ciclo_fim)}: depois disso não há projetado.` });
      const desvioPoc = res.poc?.meses?.find((pm) => num(pm.despesa) > 1);
      if (desvioPoc) alertas.push({ nivel: 'Verificar', centro: nomeCentro(o), alerta: `POC de Despesa projetada acima de 100% a partir de ${rotMes(desvioPoc.mes)} (frações vendidas + permutas > 1).` });
    }
    // Centros da DRE sem orçamento e naturezas sem Origem Projeção.
    const { rows: semOrc } = await pool.query(
      `SELECT sienge_id::int AS id, name AS nome, NULLIF(TRIM(apelido), '') AS apelido FROM centros_custo_sienge
        WHERE empresa_id = $1 AND realiza_dre AND NOT (sienge_id = ANY($2::int[])) AND (cardinality($3::int[]) = 0 OR sienge_id = ANY($3::int[]))`,
      [empresaId, f.orcamentos.map((o) => o.centro_id), centros]
    );
    if (semOrc.length) alertas.push({ nivel: 'Info', alerta: `Centros da DRE sem orçamento nesta fonte (Projetado com traço; fora do Desvio do consolidado): ${semOrc.map((c) => `${c.id} ${c.apelido || c.nome}`).join(', ')}.` });
    for (const o of f.orcamentos) {
      // eslint-disable-next-line no-await-in-loop
      const plano = await planoContas.planoDoCentro(empresaId, o.centro_id);
      const n = plano.contas.filter((c) => !c.nao_entra && c.mascara_id && !c.origem_projecao).length;
      if (n) alertas.push({ nivel: 'Verificar', centro: nomeCentro(o), alerta: `${n} natureza(s) com Máscara DRE e SEM Origem Projeção no plano ${plano.proprio ? 'próprio do centro' : 'Global'}: ficam fora da projeção.` });
    }
    if (f.avisos.length) alertas.push({ nivel: 'Atenção', alerta: `Orçamentos que não deu pra calcular: ${f.avisos.join(' · ')}` });
    return {
      fonte: descreverFonte(f),
      leitura:
        'Refeito hoje × gravado: a projeção gravada (a foto) não muda. Se o realizado até a trava mudou depois do orçamento (lançamento com data antiga, ajuste, contrato, unidade), a conta refeita hoje difere: "até a trava" = o realizado daquele mês mudou; "projetado" = a base realizada que a POC acumula mudou. Para atualizar a projeção, conclua o centro de novo e salve uma versão.',
      conferencias,
      alertas: alertas.length ? alertas : [{ nivel: 'OK', alerta: 'Nenhum alerta.' }],
    };
  }),
};

module.exports = { TOOLS_PROJECAO: [guia, orcamentosTool, premissasTool, explicarTool, desvioTool, auditoriaTool] };
