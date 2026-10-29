const pool = require('../../../config/db');
const saldosService = require('../../saldo-contas-bancarias/saldos.service');
const rotinasService = require('../../saldo-contas-bancarias/rotinas.service');
const { RESUMO_SALDOS, contribuicaoConta } = require('../../saldo-contas-bancarias/resumoSaldos.calculo');
const { z, falha, r2, ferramenta } = require('../dfc/tools/comum');

// Ferramentas do módulo SALDO DAS CONTAS BANCÁRIAS do conector Horizon (só leitura) — a mesma base da
// tela Operações > Saldo Contas Bancárias: saldos.service.js::getSaldos (universo da grade) e
// resumoSaldos.calculo.js (Total geral = Liberado + Limite cheque; Liberado/Total bloqueado/Limite
// cheque/Saldo a cobrir — a mesma regra da
// grade, da planilha e do WhatsApp). Fechadas sobre a empresa do conector.

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : null);
const horaBR = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null);
const reais = (centavos) => r2(centavos / 100);

const ORIGEM = {
  API: 'Automático: buscado por integração (VanPix Extrato/Cobrança ou API Itaú) ao abrir o período',
  HERDADO: 'Automático: repetido do saldo anterior — nenhuma integração trouxe saldo e a classificação da conta está como "Buscar saldo anterior"',
  MANUAL: 'Manual: digitado ou colado na grade por alguém (inclusive quando sobrescreve um valor automático)',
};
const PRIORIDADE = {
  SALDO_ANTERIOR: 'Buscar saldo anterior (sem saldo da integração, repete o último saldo lançado — origem HERDADO)',
  SEM_SALDO: 'Não retornar nenhum saldo (sem saldo da integração, fica em branco pra ser informado à mão)',
};
const tipoSaldo = (libera) => (libera === true ? 'LIBERADO' : libera === false ? 'BLOQUEADO' : 'NÃO INFORMADO');

function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function diasEntre(inicio, fim) {
  const dias = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

async function periodoAberto(empresaId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(p.data, 'YYYY-MM-DD') AS data, u.nome AS aberto_por, p.aberto_em
       FROM saldos_periodos p LEFT JOIN usuarios u ON u.id = p.aberto_por
      WHERE p.empresa_id = $1 AND p.status = 'ABERTO'`,
    [empresaId]
  );
  return rows[0] || null;
}

// Dia padrão: o período aberto; sem ele, o último dia com saldo lançado.
async function diaPadrao(empresaId) {
  const aberto = await periodoAberto(empresaId);
  if (aberto) return aberto.data;
  const { rows } = await pool.query(
    `SELECT TO_CHAR(MAX(data), 'YYYY-MM-DD') AS data FROM saldos_contas_bancarias WHERE empresa_id = $1`,
    [empresaId]
  );
  if (!rows[0]?.data) throw falha('Nenhum saldo lançado ainda nesta empresa.');
  return rows[0].data;
}

async function intervalo(empresaId, { data, inicio, fim }, maxDias) {
  const de = data || inicio || (await diaPadrao(empresaId));
  const ate = data || fim || de;
  if (ate < de) throw falha('A data final precisa ser igual ou depois da inicial.');
  const dias = diasEntre(de, ate);
  if (dias.length > maxDias) throw falha(`Intervalo grande demais: no máximo ${maxDias} dias por consulta.`);
  return { de, ate, dias };
}

async function nomesBancos(empresaId) {
  try {
    const { bancos } = await saldosService.getFiltros(empresaId);
    return new Map(bancos.map((b) => [b.codigo, b.nome]));
  } catch {
    return new Map();
  }
}

async function classificacoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT nome, descricao, libera_saldo, prioridade_sem_saldo FROM classificacoes_bancarias WHERE empresa_id = $1 ORDER BY nome`,
    [empresaId]
  );
  return rows;
}

// Conta por número, nome (parte) ou "company_id:numero_conta" — entre as da grade.
async function resolverConta(empresaId, termo) {
  const t = String(termo || '').trim();
  if (!t) throw falha('Informe a conta (número, nome ou parte do nome).');
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, nome, company_name FROM contas_bancarias_sienge
      WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE`,
    [empresaId]
  );
  const alvo = t.toLowerCase();
  const exatos = rows.filter((r) => `${r.company_id}:${r.numero_conta}` === t || r.numero_conta === t || (r.nome || '').toLowerCase() === alvo);
  const achados = exatos.length ? exatos : rows.filter((r) => (r.nome || '').toLowerCase().includes(alvo) || r.numero_conta.includes(t));
  if (!achados.length) throw falha(`Nenhuma conta da grade com "${t}". Use saldos_contas para ver a lista.`);
  if (achados.length > 1) {
    const lista = achados.slice(0, 15).map((r) => `${r.company_id}:${r.numero_conta} ${r.nome || ''}`).join('; ');
    throw falha(`"${t}" corresponde a ${achados.length} contas: ${lista}. Use o "company_id:numero_conta".`);
  }
  return achados[0];
}

// Quem gravou cada saldo e cada bloqueio (o sistema guarda só a última versão de cada dia).
async function autoria(empresaId, de, ate) {
  const [{ rows: saldos }, { rows: bloqueios }] = await Promise.all([
    pool.query(
      `SELECT s.company_id, s.numero_conta, TO_CHAR(s.data, 'YYYY-MM-DD') AS data, u.nome AS por, s.atualizado_em, s.criado_em,
              CASE WHEN s.origem = 'API' THEN COALESCE(s.fonte, 'VANPIX') END AS fonte
         FROM saldos_contas_bancarias s LEFT JOIN usuarios u ON u.id = s.atualizado_por
        WHERE s.empresa_id = $1 AND s.data BETWEEN $2 AND $3`,
      [empresaId, de, ate]
    ),
    pool.query(
      `SELECT b.company_id, b.numero_conta, TO_CHAR(b.data, 'YYYY-MM-DD') AS data, u.nome AS por, b.registrado_em
         FROM saldos_bloqueios b LEFT JOIN usuarios u ON u.id = b.registrado_por
        WHERE b.empresa_id = $1 AND b.data BETWEEN $2 AND $3`,
      [empresaId, de, ate]
    ),
  ]);
  const chave = (r) => `${r.company_id}|${r.numero_conta}|${r.data}`;
  return { saldos: new Map(saldos.map((r) => [chave(r), r])), bloqueios: new Map(bloqueios.map((r) => [chave(r), r])) };
}

function resumirComposicao(c, maxTitulos = 10) {
  if (!c) return null;
  const out = {};
  if (c.extrato) out.extrato = c.extrato;
  if (c.herdado) out.herdado = c.herdado;
  if (c.cobranca) {
    const titulos = c.cobranca.titulos || [];
    out.cobranca = { ...c.cobranca, quantidade_titulos: titulos.length, titulos: titulos.slice(0, maxTitulos) };
    if (titulos.length > maxTitulos) out.cobranca.titulos_omitidos = titulos.length - maxTitulos;
  }
  if (!c.extrato && !c.herdado && !c.cobranca && c.fonte) out.fonte = c.fonte;
  return out;
}

// ─── Guia ────────────────────────────────────────────────────────────────────────────────────────

const GUIA = `
# Saldo Contas Bancárias — como funciona (Horizon Fin, Operações > Saldo Contas Bancárias)

## Quais contas entram
Contas bancárias do Sienge com Classificação preenchida E "Projeta saldo" marcado (aba Contas Bancárias). Contas inativas só aparecem se tiverem saldo lançado no período consultado. Cada conta tem um saldo por dia (um valor por conta × dia); dia sem saldo = "não informado" (diferente de zero).

## Classificações (aba Classificação)
Cadastro por empresa. Cada classificação tem:
- Descrição: o motivo, por que é necessária e o que ela classifica (texto do administrador — use para explicar a classificação).
- Tipo de saldo: LIBERADO (o saldo das contas dela pode ser usado) ou BLOQUEADO (retido). Pode estar "não informado" em classificações antigas.
- Sem saldo na API, priorizar: "Buscar saldo anterior" (repete o último saldo, origem HERDADO) ou "Não retornar nenhum saldo" (fica em branco para informar à mão).

## Período (cadeado)
Só se lança saldo no dia com período ABERTO (um por vez). Abrir o período dispara a busca automática do saldo de todas as contas; encerrar trava o dia e dispara o "Comunicar Saldos" (WhatsApp com o resumo e a planilha). Reabrir um dia encerrado é possível.

## De onde vem cada saldo (origem)
- API (automático, ícone de raio): buscado ao abrir o período.
  · VanPix Extrato Bancário: para as contas com "Código cedente extrato" — usa o fechamento mais recente ANTES do dia (numa segunda, o de sexta). Na primeira abertura de cada conta olha até 1 ano para trás (carga inicial); depois só 10 dias, e conta que não aparece nesses 10 dias repete o último saldo (sem movimento = saldo igual; a composição mostra "repetidoDe").
  · VanPix Cobrança: para as contas com "Código cedente cobrança" — soma ao saldo o Vl Pago dos boletos liquidados com Dt Crédito depois do fechamento usado até o dia (composição "cobranca", com os títulos).
  · API Itaú: saldo em conta em tempo real, para contas Itaú casadas com uma conexão Itaú (agência/conta/dígito).
- HERDADO (automático): nenhuma integração trouxe saldo e a classificação está como "Buscar saldo anterior" — repete o último saldo lançado (composição "herdado" diz de qual dia).
- MANUAL: digitado ou colado na grade. Digitar por cima de um valor automático vira MANUAL.
- Sábado e domingo: a busca automática não roda.
- Quem gravou: no MANUAL, quem digitou; no API/HERDADO, quem abriu o período (disparou a busca). O sistema guarda só a ÚLTIMA versão de cada saldo (quem e quando), não o histórico de valores anteriores.

## Bloqueio de saldo
Registrado na célula (botão direito > Registrar bloqueio), por conta e dia: parte do saldo que está retida. A grade mostra "Saldo bloqueado" e "Saldo disponível" (= saldo − bloqueado) abaixo da conta.

## Cheque especial
Limite cadastrado na conta (Cadastros > Contas Bancárias). Nos dias com abertura de período a grade mostra "Limite total" e "Limite restante": saldo negativo → limite + saldo (limite 100.000 e saldo −500 → 99.500); saldo zero ou positivo → o limite inteiro.

## Totais (rodapé da grade), por dia, só contas com saldo lançado
- Total da classificação (linha de cada classificação): soma dos saldos (com sinal) das contas dela no dia.
- TOTAL GERAL = LIBERADO + LIMITE CHEQUE: tudo que dá para usar no dia (o dinheiro liberado + o que ainda resta de cheque especial). NÃO é a soma das classificações (essa soma está em "soma_dos_saldos" no saldos_resumo).
- Abaixo do Total geral, o Resumo dos saldos (1ª seção da planilha e corpo do WhatsApp):
  · Liberado = nas contas de classificação LIBERADA, saldo − bloqueio, só se positivo. NÃO inclui o cheque especial. Saldo negativo não entra (aparece no Saldo a cobrir).
  · Total bloqueado = saldo inteiro das contas de classificação BLOQUEADA + bloqueios registrados nas demais contas.
  · Limite cheque = soma dos limites restantes do cheque especial (todas as contas).
  · Saldo a cobrir = soma dos saldos negativos (todas as contas).
  · Ex.: conta liberada com −500 e limite 100 mil → Liberado 0, Limite cheque 99.500, Saldo a cobrir −500, Total geral 99.500. Com 500 e limite 100 mil → Liberado 500, Limite cheque 100.000, Total geral 100.500.
  · Classificação com tipo "não informado": o saldo não entra nem no Liberado nem no Total bloqueado (só o bloqueio registrado entra no bloqueado).
- Na planilha, a seção "Resumo dos saldos" traz o TOTAL GERAL (Liberado + Limite cheque) e as 4 linhas; os "TOTAL" das outras seções são a soma das linhas de cada seção (= soma dos saldos).

## Rotinas e Comunicar Saldos (aba Configurações)
- Gerar Rotinas: divide as contas entre responsáveis (por classificação ou por banco); o período só encerra depois que todos encerram a própria rotina.
- Comunicar Saldos: ao encerrar o período, manda WhatsApp aos destinatários com o resumo (Liberado — sem o cheque —, Bloqueado, Limite cheque, Saldo a cobrir; sem centavos e sem o Total geral), a mensagem do administrador e a planilha da semana.

## Ferramentas
- saldos_resumo: totais do dia (ou intervalo) e quem compõe cada total (conta a conta).
- saldos_contas: cada conta no dia — saldo, origem/automação, composição, quem gravou, bloqueio, cheque especial.
- saldos_historico_conta: uma conta dia a dia (até 92 dias).
- saldos_classificacoes: classificações com descrição, tipo e contas.
- saldos_automacoes: configuração de automação de cada conta (VanPix, Itaú, herdar) e conexões da empresa.
- saldos_periodos: aberturas/encerramentos (quem e quando) e situação das rotinas.
Valores em R$ com sinal; datas AAAA-MM-DD.
`.trim();

const guia = {
  name: 'saldos_guia',
  description:
    'COMECE POR AQUI para perguntas sobre saldo das contas bancárias: manual da tela Saldo Contas Bancárias (classificações, origem de cada saldo — automático VanPix/Itaú, herdado do dia anterior ou manual —, bloqueios, cheque especial, como cada total é calculado) e a situação atual da empresa (período aberto, último dia com saldo, classificações).',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const [aberto, ultimo, ultimoEncerrado, classes, contas, { rows: [rotinas] }, comunicar] = await Promise.all([
      periodoAberto(empresaId),
      pool.query(`SELECT TO_CHAR(MAX(data), 'YYYY-MM-DD') AS data FROM saldos_contas_bancarias WHERE empresa_id = $1`, [empresaId]),
      pool.query(
        `SELECT TO_CHAR(p.data, 'YYYY-MM-DD') AS data, u.nome AS por, p.encerrado_em FROM saldos_periodos p
           LEFT JOIN usuarios u ON u.id = p.encerrado_por
          WHERE p.empresa_id = $1 AND p.status = 'ENCERRADO' ORDER BY p.data DESC LIMIT 1`,
        [empresaId]
      ),
      classificacoes(empresaId),
      pool.query(
        `SELECT classificacao, COUNT(*)::int AS contas, COUNT(*) FILTER (WHERE status = 'ENABLED')::int AS ativas
           FROM contas_bancarias_sienge WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE
          GROUP BY classificacao`,
        [empresaId]
      ),
      pool.query('SELECT gerar_rotinas, dividir_por FROM saldos_rotinas_config WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT COUNT(*)::int AS n FROM saldos_comunicar_usuarios WHERE empresa_id = $1', [empresaId]),
    ]);
    const porClasse = new Map(contas.rows.map((r) => [r.classificacao, r]));
    const enc = ultimoEncerrado.rows[0];
    const situacao = [
      '# Situação atual',
      aberto
        ? `- Período ABERTO: ${brData(aberto.data)} (aberto por ${aberto.aberto_por || '—'} em ${horaBR(aberto.aberto_em)}).`
        : '- Nenhum período aberto.',
      enc ? `- Último período encerrado: ${brData(enc.data)} (por ${enc.por || '—'} em ${horaBR(enc.encerrado_em)}).` : '- Nenhum período encerrado ainda.',
      `- Último dia com saldo lançado: ${brData(ultimo.rows[0]?.data) || 'nenhum'}.`,
      `- Rotinas: ${rotinas?.gerar_rotinas ? `ligadas, divididas por ${rotinas.dividir_por === 'BANCO' ? 'banco' : 'classificação'}` : 'desligadas'}. Comunicar Saldos: ${comunicar.rows[0].n} destinatário(s).`,
      '- Classificações:',
      ...classes.map((c) => {
        const n = porClasse.get(c.nome);
        return `  · ${c.nome} — ${tipoSaldo(c.libera_saldo)}; ${n ? `${n.contas} conta(s), ${n.ativas} ativa(s)` : 'nenhuma conta'}; sem saldo na API: ${c.prioridade_sem_saldo === 'SALDO_ANTERIOR' ? 'buscar saldo anterior' : 'não retornar saldo'}.${c.descricao ? ` Descrição: ${c.descricao.replace(/\s+/g, ' ')}` : ''}`;
      }),
    ].join('\n');
    return `${GUIA}\n\n${situacao}`;
  }),
};

// ─── Resumo ──────────────────────────────────────────────────────────────────────────────────────

const resumo = {
  name: 'saldos_resumo',
  description:
    'Totais do saldo das contas por dia: Total geral (= Liberado + Limite cheque, tudo que dá para usar no dia), total por classificação (com o tipo liberado/bloqueado), a soma dos saldos e o Resumo dos saldos (Liberado sem o cheque especial, Total bloqueado, Limite cheque, Saldo a cobrir). Para UM dia, traz também quem compõe cada total, conta a conta (saldo, bloqueio, limite restante e quanto entrou em cada total), e as contas sem saldo lançado. Sem data: o período aberto ou o último dia com saldo.',
  inputSchema: {
    data: dataSchema.optional().describe('Um dia (AAAA-MM-DD).'),
    inicio: dataSchema.optional().describe('Início de um intervalo (até 31 dias; sem o detalhamento conta a conta).'),
    fim: dataSchema.optional().describe('Fim do intervalo.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const { de, ate, dias } = await intervalo(empresaId, args, 31);
    const { contas, periodos } = await saldosService.getSaldos(empresaId, { dataInicio: de, dataFim: ate });
    const comPeriodo = new Set(periodos);
    const tipos = new Map((await classificacoes(empresaId)).map((c) => [c.nome, c.libera_saldo]));

    const porDia = dias.map((iso) => {
      const partes = contas.map((c) => ({ c, p: contribuicaoConta(c, iso, comPeriodo) })).filter((x) => x.p);
      if (!partes.length) return { data: iso, sem_saldo_lancado: true };
      const porClasse = {};
      for (const { c, p } of partes) {
        const g = (porClasse[c.classificacao] ||= { classificacao: c.classificacao, tipo_saldo: tipoSaldo(tipos.get(c.classificacao)), total: 0, contas: 0 });
        g.total += p.saldo;
        g.contas += 1;
      }
      const soma = (k) => reais(partes.reduce((t, x) => t + x.p[k], 0));
      return {
        data: iso,
        periodo_teve_abertura: comPeriodo.has(iso),
        total_geral: soma('totalGeral'),
        total_geral_regra: 'Liberado + Limite cheque',
        soma_dos_saldos: soma('saldo'),
        por_classificacao: Object.values(porClasse)
          .sort((a, b) => a.classificacao.localeCompare(b.classificacao, 'pt-BR'))
          .map((g) => ({ ...g, total: reais(g.total) })),
        resumo: {
          liberado: soma('liberado'),
          total_bloqueado: soma('bloqueado'),
          limite_cheque: soma('limiteCheque'),
          saldo_a_cobrir: soma('aCobrir'),
        },
        contas_com_saldo: partes.length,
        _partes: partes,
      };
    });

    if (dias.length > 1) return { de, ate, dias: porDia.map(({ _partes, ...d }) => d) };

    // Um dia: quem compõe cada total.
    const [dia] = porDia;
    if (dia.sem_saldo_lancado) return { data: de, sem_saldo_lancado: true, contas_na_grade: contas.length };
    const nome = (c) => c.nome || c.numero_conta;
    const linhas = (filtro, mapa) => dia._partes.filter(filtro).map(mapa);
    const semSaldo = contas.filter((c) => c.saldos[de] === undefined || c.saldos[de] === null);
    const { _partes, ...cabecalho } = dia;
    return {
      ...cabecalho,
      rotulos_na_tela: { total_geral: 'Total geral (Liberado + Limite cheque)', ...Object.fromEntries(RESUMO_SALDOS.map((r) => [r.chave, r.rotulo])) },
      composicao: {
        total_geral: 'Liberado + Limite cheque — some as duas composições abaixo',
        liberado: linhas(
          ({ p }) => p.liberado !== 0,
          ({ c, p }) => ({ conta: nome(c), classificacao: c.classificacao, saldo: reais(p.saldo), bloqueio: reais(p.bloqueio), entrou: reais(p.liberado) })
        ),
        total_bloqueado: linhas(
          ({ p }) => p.bloqueado !== 0,
          ({ c, p }) => ({
            conta: nome(c),
            classificacao: c.classificacao,
            motivo: c.classificacao_libera_saldo === false ? 'classificação bloqueada (saldo inteiro)' : 'bloqueio registrado na conta',
            entrou: reais(p.bloqueado),
          })
        ),
        limite_cheque: linhas(
          ({ p }) => p.limiteCheque !== 0 || p.restante !== 0,
          ({ c, p }) => ({ conta: nome(c), limite_total: c.valor_cheque_especial, saldo: reais(p.saldo), limite_restante: reais(p.restante) })
        ),
        saldo_a_cobrir: linhas(({ p }) => p.aCobrir !== 0, ({ c, p }) => ({ conta: nome(c), classificacao: c.classificacao, saldo: reais(p.saldo) })),
      },
      contas_sem_saldo_lancado: semSaldo.map((c) => ({ conta: nome(c), classificacao: c.classificacao, status: c.status })),
    };
  }),
};

// ─── Contas no dia ───────────────────────────────────────────────────────────────────────────────

const contasDia = {
  name: 'saldos_contas',
  description:
    'Cada conta bancária da grade num dia: empresa, banco, classificação (tipo liberado/bloqueado), saldo, ORIGEM (API automático / HERDADO do dia anterior / MANUAL) com a fonte (VanPix ou Itaú) e a composição do automático (extrato, herdado, cobrança com os boletos), quem gravou e quando, bloqueio (valor, quem registrou), saldo disponível e cheque especial (limite e restante). Filtros por classificação, banco, origem ou parte do nome/número.',
  inputSchema: {
    data: dataSchema.optional().describe('Dia (AAAA-MM-DD). Sem ele: o período aberto ou o último dia com saldo.'),
    classificacao: z.string().optional().describe('Só as contas desta classificação.'),
    banco: z.string().optional().describe('Código do banco (ex.: 104) ou parte do nome.'),
    origem: z.enum(['API', 'HERDADO', 'MANUAL', 'SEM_SALDO']).optional().describe('Só as contas com esta origem no dia (SEM_SALDO = sem saldo lançado).'),
    busca: z.string().optional().describe('Parte do nome ou do número da conta.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const data = args.data || (await diaPadrao(empresaId));
    const [{ contas, periodos }, bancos, aut] = await Promise.all([
      saldosService.getSaldos(empresaId, { dataInicio: data, dataFim: data }),
      nomesBancos(empresaId),
      autoria(empresaId, data, data),
    ]);
    const comPeriodo = new Set(periodos);
    const tipos = new Map((await classificacoes(empresaId)).map((c) => [c.nome, c.libera_saldo]));
    const termo = (args.busca || '').toLowerCase();
    const banco = (args.banco || '').toLowerCase();
    const lista = contas
      .filter((c) => !args.classificacao || c.classificacao.toLowerCase() === args.classificacao.toLowerCase())
      .filter((c) => !banco || c.banco_codigo === args.banco || (bancos.get(c.banco_codigo) || '').toLowerCase().includes(banco))
      .filter((c) => !termo || (c.nome || '').toLowerCase().includes(termo) || c.numero_conta.includes(args.busca))
      .filter((c) => !args.origem || (args.origem === 'SEM_SALDO' ? c.saldos[data] === undefined : c.origens[data] === args.origem))
      .map((c) => {
        const k = `${c.company_id}|${c.numero_conta}|${data}`;
        const s = aut.saldos.get(k);
        const b = aut.bloqueios.get(k);
        const p = contribuicaoConta(c, data, comPeriodo);
        const origem = c.origens[data] || null;
        return {
          conta: c.nome || c.numero_conta,
          id: `${c.company_id}:${c.numero_conta}`,
          empresa: c.company_name,
          banco: c.banco_codigo ? `${c.banco_codigo} — ${bancos.get(c.banco_codigo) || c.banco_codigo}` : null,
          classificacao: c.classificacao,
          tipo_saldo: tipoSaldo(tipos.get(c.classificacao)),
          status: c.status === 'ENABLED' ? 'ativa' : 'inativa',
          saldo: p ? reais(p.saldo) : null,
          origem,
          origem_explicacao: origem ? ORIGEM[origem] : 'Sem saldo lançado neste dia',
          ...(s?.fonte ? { fonte: s.fonte } : {}),
          ...(c.composicoes[data] ? { composicao: resumirComposicao(c.composicoes[data]) } : {}),
          ...(c.cobrancas[data] !== undefined ? { parte_da_cobranca: c.cobrancas[data] } : {}),
          ...(s
            ? { gravado_por: s.por || null, gravado_em: horaBR(s.atualizado_em), quem_gravou_significa: origem === 'MANUAL' ? 'quem digitou' : 'quem abriu o período (disparou a busca automática)' }
            : {}),
          ...(p && p.bloqueio
            ? { bloqueio: { valor: reais(p.bloqueio), disponivel: reais(p.saldo - p.bloqueio), registrado_por: b?.por || null, registrado_em: horaBR(b?.registrado_em) } }
            : {}),
          ...(c.valor_cheque_especial > 0
            ? { cheque_especial: { limite: c.valor_cheque_especial, limite_restante: p && comPeriodo.has(data) ? reais(p.restante) : null } }
            : {}),
          ...(p
            ? {
                entra_no_resumo: {
                  total_geral: reais(p.totalGeral),
                  liberado: reais(p.liberado),
                  bloqueado: reais(p.bloqueado),
                  limite_cheque: reais(p.limiteCheque),
                  a_cobrir: reais(p.aCobrir),
                },
              }
            : {}),
        };
      });
    if (!lista.length) throw falha('Nenhuma conta com esses filtros neste dia.');
    return { data, periodo_teve_abertura: comPeriodo.has(data), contas: lista.length, lista };
  }),
};

// ─── Histórico de uma conta ──────────────────────────────────────────────────────────────────────

const historico = {
  name: 'saldos_historico_conta',
  description:
    'Uma conta bancária dia a dia (até 92 dias): saldo, origem (API/HERDADO/MANUAL), fonte, quem gravou e quando, bloqueio e limite restante do cheque especial. Bom para "por que o saldo mudou", "quem alterou", "desde quando está repetindo".',
  inputSchema: {
    conta: z.string().describe('Número, nome (ou parte) ou "company_id:numero_conta" da conta.'),
    inicio: dataSchema.optional().describe('Início (AAAA-MM-DD). Sem ele: 30 dias antes do fim.'),
    fim: dataSchema.optional().describe('Fim (AAAA-MM-DD). Sem ele: o período aberto ou o último dia com saldo.'),
  },
  handler: ferramenta(async (empresaId, { conta, inicio, fim }) => {
    const alvo = await resolverConta(empresaId, conta);
    const ate = fim || (await diaPadrao(empresaId));
    const de = inicio || somarDias(ate, -30);
    if (ate < de) throw falha('A data final precisa ser igual ou depois da inicial.');
    if (diasEntre(de, ate).length > 92) throw falha('No máximo 92 dias por consulta.');
    const filtro = { dataInicio: de, dataFim: ate, contas: [`${alvo.company_id}:${alvo.numero_conta}`] };
    const [{ contas, periodos }, aut] = await Promise.all([saldosService.getSaldos(empresaId, filtro), autoria(empresaId, de, ate)]);
    const c = contas[0];
    if (!c) throw falha('Conta fora da grade no período (inativa sem saldo).');
    const comPeriodo = new Set(periodos);
    const dias = diasEntre(de, ate)
      .filter((iso) => c.saldos[iso] !== undefined || c.bloqueios[iso] !== undefined)
      .map((iso) => {
        const k = `${c.company_id}|${c.numero_conta}|${iso}`;
        const p = contribuicaoConta(c, iso, comPeriodo);
        const s = aut.saldos.get(k);
        return {
          data: iso,
          saldo: p ? reais(p.saldo) : null,
          origem: c.origens[iso] || null,
          ...(s?.fonte ? { fonte: s.fonte } : {}),
          ...(c.composicoes[iso]?.herdado ? { herdado_de: c.composicoes[iso].herdado.de } : {}),
          ...(c.composicoes[iso]?.extrato?.repetidoDe ? { extrato_repetido_de: c.composicoes[iso].extrato.repetidoDe } : {}),
          gravado_por: s?.por || null,
          gravado_em: horaBR(s?.atualizado_em),
          ...(p?.bloqueio ? { bloqueio: reais(p.bloqueio) } : {}),
          ...(c.valor_cheque_especial > 0 && comPeriodo.has(iso) && p ? { limite_restante: reais(p.restante) } : {}),
        };
      });
    return {
      conta: c.nome || c.numero_conta,
      id: `${c.company_id}:${c.numero_conta}`,
      empresa: c.company_name,
      classificacao: c.classificacao,
      cheque_especial_limite: c.valor_cheque_especial,
      de,
      ate,
      dias_com_saldo: dias.length,
      dias,
      observacao: 'O sistema guarda só a última versão de cada dia (quem e quando gravou); valores sobrescritos antes não ficam registrados.',
    };
  }),
};

// ─── Classificações ──────────────────────────────────────────────────────────────────────────────

const classificacoesTool = {
  name: 'saldos_classificacoes',
  description:
    'Classificações bancárias da empresa: descrição (motivo, necessidade e o que classifica), tipo de saldo (LIBERADO/BLOQUEADO), o que fazer sem saldo na API (buscar saldo anterior ou deixar em branco) e as contas de cada uma.',
  inputSchema: {
    com_contas: z.boolean().optional().describe('Listar as contas de cada classificação (padrão: sim).'),
  },
  handler: ferramenta(async (empresaId, { com_contas: comContas = true }) => {
    const [classes, { rows: contas }] = await Promise.all([
      classificacoes(empresaId),
      pool.query(
        `SELECT classificacao, company_id, numero_conta, nome, status, projeta_saldo, valor_cheque_especial
           FROM contas_bancarias_sienge WHERE empresa_id = $1 AND classificacao IS NOT NULL ORDER BY nome`,
        [empresaId]
      ),
    ]);
    const cadastradas = new Set(classes.map((c) => c.nome));
    const orfas = [...new Set(contas.map((c) => c.classificacao).filter((n) => !cadastradas.has(n)))];
    return {
      classificacoes: classes.map((c) => {
        const daClasse = contas.filter((x) => x.classificacao === c.nome);
        return {
          nome: c.nome,
          descricao: c.descricao || null,
          tipo_saldo: tipoSaldo(c.libera_saldo),
          sem_saldo_na_api: PRIORIDADE[c.prioridade_sem_saldo] || c.prioridade_sem_saldo,
          contas_na_grade: daClasse.filter((x) => x.projeta_saldo).length,
          contas_sem_projeta_saldo: daClasse.filter((x) => !x.projeta_saldo).length,
          ...(comContas
            ? {
                contas: daClasse.map((x) => ({
                  conta: x.nome || x.numero_conta,
                  id: `${x.company_id}:${x.numero_conta}`,
                  status: x.status === 'ENABLED' ? 'ativa' : 'inativa',
                  projeta_saldo: x.projeta_saldo,
                  ...(x.valor_cheque_especial > 0 ? { cheque_especial: Number(x.valor_cheque_especial) } : {}),
                })),
              }
            : {}),
        };
      }),
      ...(orfas.length ? { nomes_em_contas_sem_cadastro: orfas } : {}),
    };
  }),
};

// ─── Automações ──────────────────────────────────────────────────────────────────────────────────

const automacoes = {
  name: 'saldos_automacoes',
  description:
    'Como o saldo de cada conta é buscado automaticamente: VanPix Extrato (código cedente extrato e se a carga inicial de 1 ano já foi feita), VanPix Cobrança (código cedente cobrança), API Itaú (conexão casada), o que acontece sem saldo (herdar o anterior ou deixar em branco, pela classificação) e quantos dias recentes vieram de cada origem. Traz também as conexões VanPix/Itaú ativas da empresa.',
  inputSchema: {
    busca: z.string().optional().describe('Parte do nome ou número da conta (sem ela: todas as contas da grade).'),
    dias: z.number().int().min(1).max(120).optional().describe('Janela para contar as origens (padrão 30 dias até o último saldo).'),
  },
  handler: ferramenta(async (empresaId, { busca, dias = 30 }) => {
    const ate = await diaPadrao(empresaId).catch(() => new Date().toISOString().slice(0, 10));
    const de = somarDias(ate, -(dias - 1));
    const [{ rows: contas }, classes, { rows: vanpix }, { rows: itau }, { rows: origens }] = await Promise.all([
      pool.query(
        `SELECT company_id, numero_conta, nome, company_name, classificacao, status, codigo_cedente_extrato, codigo_cedente_cobranca,
                extrato_carga_inicial_apelido, extrato_carga_inicial_em, valor_cheque_especial,
                agencia_enriquecida, conta_enriquecida, digito
           FROM contas_bancarias_sienge WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE ORDER BY nome`,
        [empresaId]
      ),
      classificacoes(empresaId),
      pool.query(
        `SELECT i.nome_conexao, i.finalidade, i.ativo, ARRAY_REMOVE(ARRAY_AGG(c.apelido ORDER BY c.apelido), NULL) AS apelidos
           FROM integracoes_vanpix i LEFT JOIN integracoes_vanpix_convenios c ON c.integracao_id = i.id
          WHERE i.empresa_id = $1 GROUP BY i.id ORDER BY i.finalidade, i.nome_conexao`,
        [empresaId]
      ),
      pool.query(
        `SELECT c.nome, c.agencia, c.conta, c.dac, c.ativo, TO_CHAR(c.data_validade_certificado, 'YYYY-MM-DD') AS certificado_valido_ate,
                s.company_id, s.numero_conta
           FROM conexoes_itau c
           LEFT JOIN contas_bancarias_sienge s
             ON s.empresa_id = c.empresa_id
            AND LTRIM(s.agencia_enriquecida, '0') = LTRIM(c.agencia, '0')
            AND LTRIM(s.conta_enriquecida, '0') = LTRIM(c.conta, '0')
            AND s.digito = c.dac
          WHERE c.empresa_id = $1`,
        [empresaId]
      ),
      pool.query(
        `SELECT company_id, numero_conta, origem, COALESCE(fonte, CASE WHEN origem = 'API' THEN 'VANPIX' END) AS fonte,
                COUNT(*)::int AS dias, TO_CHAR(MAX(data), 'YYYY-MM-DD') AS ultimo
           FROM saldos_contas_bancarias WHERE empresa_id = $1 AND data BETWEEN $2 AND $3
          GROUP BY 1, 2, 3, 4`,
        [empresaId, de, ate]
      ),
    ]);
    const prioridade = new Map(classes.map((c) => [c.nome, c.prioridade_sem_saldo]));
    const itauPorConta = new Map(itau.filter((i) => i.numero_conta).map((i) => [`${i.company_id}|${i.numero_conta}`, i]));
    const termo = (busca || '').toLowerCase();
    const lista = contas
      .filter((c) => !termo || (c.nome || '').toLowerCase().includes(termo) || c.numero_conta.includes(busca))
      .map((c) => {
        const k = `${c.company_id}|${c.numero_conta}`;
        const it = itauPorConta.get(k);
        const minhas = origens.filter((o) => o.company_id === c.company_id && o.numero_conta === c.numero_conta);
        return {
          conta: c.nome || c.numero_conta,
          id: `${c.company_id}:${c.numero_conta}`,
          empresa: c.company_name,
          classificacao: c.classificacao,
          status: c.status === 'ENABLED' ? 'ativa' : 'inativa',
          vanpix_extrato: c.codigo_cedente_extrato
            ? {
                apelido: c.codigo_cedente_extrato,
                carga_inicial_1_ano: c.extrato_carga_inicial_apelido === c.codigo_cedente_extrato ? `feita em ${horaBR(c.extrato_carga_inicial_em)}` : 'ainda não feita (a próxima abertura olha até 1 ano para trás)',
              }
            : null,
          vanpix_cobranca: c.codigo_cedente_cobranca || null,
          itau: it ? { conexao: it.nome, ativa: it.ativo, certificado_valido_ate: it.certificado_valido_ate } : null,
          sem_saldo_da_integracao: PRIORIDADE[prioridade.get(c.classificacao)] || 'classificação sem cadastro',
          automatica: Boolean(c.codigo_cedente_extrato || c.codigo_cedente_cobranca || it),
          origens_na_janela: minhas.map((o) => ({ origem: o.origem, ...(o.fonte ? { fonte: o.fonte } : {}), dias: o.dias, ultimo_dia: o.ultimo })),
        };
      });
    return {
      janela_origens: { de, ate },
      conexoes_vanpix: vanpix.map((v) => ({ nome: v.nome_conexao, finalidade: v.finalidade, ativa: v.ativo, apelidos: v.apelidos })),
      conexoes_itau: itau.map((i) => ({
        nome: i.nome,
        ativa: i.ativo,
        certificado_valido_ate: i.certificado_valido_ate,
        conta_casada: i.numero_conta ? `${i.company_id}:${i.numero_conta}` : null,
      })),
      contas: lista.length,
      lista,
    };
  }),
};

// ─── Períodos ────────────────────────────────────────────────────────────────────────────────────

const periodos = {
  name: 'saldos_periodos',
  description:
    'Aberturas e encerramentos de período (dia liberado para lançar saldo): quem abriu e quando, quem encerrou e quando; e, com Rotinas ligadas, quem já encerrou a própria rotina no período aberto.',
  inputSchema: {
    inicio: dataSchema.optional().describe('Início (AAAA-MM-DD). Sem ele: últimos 30 dias.'),
    fim: dataSchema.optional().describe('Fim (AAAA-MM-DD).'),
  },
  handler: ferramenta(async (empresaId, { inicio, fim }, ctx) => {
    const ate = fim || new Date().toISOString().slice(0, 10);
    const de = inicio || somarDias(ate, -30);
    const { rows } = await pool.query(
      `SELECT TO_CHAR(p.data, 'YYYY-MM-DD') AS data, p.status, ua.nome AS aberto_por, p.aberto_em, ue.nome AS encerrado_por, p.encerrado_em
         FROM saldos_periodos p
         LEFT JOIN usuarios ua ON ua.id = p.aberto_por
         LEFT JOIN usuarios ue ON ue.id = p.encerrado_por
        WHERE p.empresa_id = $1 AND p.data BETWEEN $2 AND $3 ORDER BY p.data DESC`,
      [empresaId, de, ate]
    );
    const rotinas = await rotinasService.getStatus(empresaId, ctx.usuarioId).catch(() => null);
    return {
      de,
      ate,
      periodos: rows.map((p) => ({
        data: p.data,
        status: p.status,
        aberto_por: p.aberto_por,
        aberto_em: horaBR(p.aberto_em),
        encerrado_por: p.encerrado_por,
        encerrado_em: horaBR(p.encerrado_em),
      })),
      ...(rotinas?.gerar
        ? {
            rotinas_do_periodo_aberto: rotinas.responsaveis.map((r) => ({
              responsavel: r.nome,
              contas: r.contas,
              com_saldo: r.preenchidas,
              encerrada: r.encerrada,
            })),
          }
        : {}),
    };
  }),
};

const TOOLS_SALDOS = [guia, resumo, contasDia, historico, classificacoesTool, automacoes, periodos];

module.exports = { TOOLS_SALDOS };
