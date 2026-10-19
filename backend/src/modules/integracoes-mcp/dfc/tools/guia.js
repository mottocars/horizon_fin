const pool = require('../../../../config/db');
const { ferramenta } = require('./comum');
const { mesDeHoje } = require('../../../dfc-fluxo/fluxo.service');

// "Manual" do DFC Construtoras pro Claude: como o fluxo é montado, de onde vem cada número e qual
// ferramenta usar pra cada pergunta. Com a situação atual da empresa no topo.

const GUIA = `
# DFC Construtoras — como o fluxo de caixa é montado (Horizon Fin)

## Estrutura do fluxo (aba DFC)
Saldo inicial › Máscara nível 1 › ENTRADAS / SAÍDAS › Máscara nível 2 › natureza (conta do plano financeiro do Sienge) › Resultado do mês › Saldo final.
- Cada natureza pertence a uma Máscara DFC de nível 2 (aba Plano Contas). Um centro de custo pode ter versão própria do plano; sem ela, usa o plano Global.
- ENTRADAS/SAÍDAS vêm do sinal do valor (positivo = entrada, negativo = saída).
- Natureza sem Máscara DFC e lançamento sem natureza NÃO entram no fluxo (decisão do usuário).
- Colunas: do período escolhido; até o mês atual cada mês tem REALIZADO e PROJETADO; depois do mês atual, só PROJETADO.

## Saldos
- Realizado: saldo real das contas bancárias com "Projeta DFC" (aba Contas Correntes), pela soma do extrato do Sienge antes do dia 1º do mês. Meses fechados: saldo final = saldo real de abertura do mês seguinte (por isso pode não bater com inicial + resultado quando há lançamentos fora do DFC).
- Projetado: do mês atual em diante, parte do saldo real de abertura do mês atual e encadeia: saldo final = inicial + resultado; o final vira o inicial do mês seguinte.
- O extrato é buscado até o dia da última atualização (veja "Extrato bancário buscado até" na situação atual): o realizado do mês corrente traz os lançamentos até essa data — é parcial, não compare com o projetado do mês inteiro como se estivesse fechado. O Saldo final realizado do mês atual = saldo real até essa data.

## Realizado
Extrato bancário do Sienge (v1/accounts-statements) de todas as contas, rateado por centro de custo × natureza (budget categories do lançamento). Só as contas com Projeta DFC somam.
- Lançamento sem rateio herda centro/natureza de outro lançamento do MESMO título na MESMA data (ex.: pagamento por mútuo: a natureza está na perna da conta de mútuo).
- Valor no DFC = valor do lançamento × % do rateio; saída (Expense) negativa.

## Projetado = última versão salva do Orçamento (aba Orçamentos)
Cada valor (centro × natureza × mês) tem uma Origem Projeção, definida na natureza (aba Plano Contas):
- HORIZON - INFORMADO: digitado à mão na aba Orçamentos.
- SIENGE - AGING: parcelas do contas a receber (original − desconto + taxas) e a pagar (original + desconto − taxas, negativo), no mês do vencimento, pelo % de rateio natureza × centro. Previsões financeiras (documento PREVISÃO) não entram.
- SIENGE - EMPRESARIAL DESEMBOLSO: Orçamento Empresarial do Sienge (última versão de cada orçamento), deslocado pelo prazo médio de desembolso da natureza (ficha de desembolso; meses = prazo médio ÷ 30, arredondado). Saída, negativo.
- CEF - NOVO REGISTRO / MEDIÇÃO / CRÉDITO PJ / JUROS / AMORTIZAÇÃO: Projeção CEF da obra (motor da planilha), ver abaixo.
- O Orçamento só muda ao "Salvar Versão": as fontes podem ter mudado depois; o detalhamento mostra a diferença.

## Projeção CEF (por obra com contrato Caixa e Parâmetros)
- Parâmetros: CTO, Teto do financiamento PJ, % Amortização PJ, Taxa de juros ao mês, Data da Demanda Mínima (DM), ciclo, prazo assinatura → registro.
- % de obra acumulado: Caixa (DCD) até o mês anterior ao atual; Prevision (ou manual) do mês atual em diante; mês sem valor repete o anterior. Δ obra = % do mês − % do mês anterior.
- Repasses CEF (unidades do Geral, sem o 1º contrato, o da construtora): mês do registro = data de registro; sem ela, o mês informado à mão na aba Repasses (vale sobre o parâmetro e não é desfeito por importação), ou assinatura + prazo.
  VGF medição = financiamento − terreno + subsídio. Novo registro da unidade = terreno + FGTS + VGF medição × % obra no mês do registro.
  Demanda mínima: unidade assinada até a Data da DM — não amortiza.
- Novo Registro do mês = Σ novo registro das unidades registradas no mês.
- Medição = VGF medição acumulado (unidades registradas antes do mês, dentro do ciclo) × Δ obra.
- Crédito PJ: até o mês da DM = 0; mês seguinte = Teto × Δ; depois = CTO × Δ − Medição; nunca negativo; travado no teto.
- Juros = saldo devedor PJ do mês anterior × taxa. Amortização = (Novo Registro − parte de demanda mínima) × % amortização.
- Saldo devedor = anterior + Crédito PJ − Amortização. Juros e Amortização são saídas (negativas no fluxo).

## Dashboard Econômico Financeiro › Fluxo de Caixa
Painel de gestão sobre este mesmo DFC: 8 indicadores com etiquetas (verde/amarela/vermelha), colchão (1 mês de saídas operacionais), trajetória do caixa com simulador de cenário (Orçamento / Conservador / Estresse), entradas e saídas operacionais, fôlego de cada SPE sozinha (quando o caixa de cada empresa zera), quem gera e quem consome caixa, carteira e liquidez, onde o Orçamento erra, maiores saídas e dívida PJ. Filtros: histórico (meses antes do atual, padrão 1), horizonte (contando o mês atual, padrão 6) e centros/SPE.
- Para analisar ou explicar o painel como quem olha a tela: dfc_painel_fluxo_caixa (explicar=true traz o Sumário de cada análise).

## Qual ferramenta usar
- Dashboard (indicadores, etiquetas, fôlego por SPE, simulador, "o que a tela mostra"): dfc_painel_fluxo_caixa.
- Visão do fluxo (totais, saldos, resultado, por máscara/natureza): dfc_fluxo_caixa.
- "De onde veio este valor?" (títulos, parcelas, orçamento, rastreio CEF): dfc_detalhar_valor.
- Listas e filtros de lançamentos/itens, rankings (maiores fornecedores, por centro etc.): dfc_lancamentos.
- Saldos por conta bancária: dfc_saldos_bancarios.
- Conta completa da Projeção CEF de uma obra: dfc_projecao_cef.
- Versões do Orçamento e histórico de um valor: dfc_orcamento_versoes.
- Nomes/ids de centros, naturezas, máscaras, contas: dfc_cadastros.
- Qualquer outra pergunta: dfc_descrever_tabelas e depois dfc_consultar_sql (SQL de leitura).
Valores em reais (R$). Meses no formato AAAA-MM.
`;

module.exports = {
  name: 'dfc_guia',
  description:
    'Explica como o DFC Construtoras (fluxo de caixa) é montado: estrutura, saldos, realizado, projetado, origens da projeção, ' +
    'regras da Projeção CEF e qual ferramenta usar para cada pergunta, com a situação atual da empresa (versão do Orçamento, ' +
    'extrato buscado até, mês atual). Chame primeiro, antes de responder perguntas sobre o DFC.',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const [{ rows: emp }, { rows: versao }, { rows: extrato }, { rows: centros }] = await Promise.all([
      pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
      pool.query(
        `SELECT v.numero, v.criado_em, u.nome AS usuario FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
          WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
        [empresaId]
      ),
      pool.query(
        `SELECT MIN(s.data_ate) AS ate FROM sie_extrato_contas_sincronizacoes s
           JOIN contas_bancarias_sienge c ON c.empresa_id = s.empresa_id AND c.company_id = s.company_id AND c.numero_conta = s.numero_conta AND c.projeta_dfc
          WHERE s.empresa_id = $1`,
        [empresaId]
      ),
      pool.query('SELECT name FROM centros_custo_sienge WHERE empresa_id = $1 AND projeta_dfc ORDER BY name', [empresaId]),
    ]);
    const v = versao[0];
    const situacao = [
      `## Situação atual`,
      `- Empresa: ${emp[0]?.nome || empresaId}`,
      `- Mês atual: ${mesDeHoje()}`,
      `- Orçamento (projetado): ${v ? `versão ${v.numero}, salva em ${new Date(v.criado_em).toISOString().slice(0, 16).replace('T', ' ')}${v.usuario ? ` por ${v.usuario}` : ''}` : 'nenhuma versão salva'}`,
      `- Extrato bancário buscado até: ${extrato[0]?.ate || '—'}`,
      `- Centros de custo com Projeta DFC (${centros.length}): ${centros.map((c) => c.name).join(', ')}`,
    ].join('\n');
    return `${situacao}\n${GUIA}`;
  }),
};
