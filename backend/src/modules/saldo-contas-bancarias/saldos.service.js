const pool = require('../../config/db');
const bancosService = require('../bancos/bancos.service');

// Só dígitos do banco_numero que o Sienge devolve ("104", "001", "341"...).
const DIGITOS_BANCO_SQL = `REGEXP_REPLACE(c.banco_numero, '[^0-9]', '', 'g')`;

// Banco "de verdade" da conta: o que o usuário escolheu na edição da conta
// (banco_enriquecido) ou, na falta dele, o código que o Sienge traz. É o mesmo
// critério que a tela de edição usa pra pré-preencher o banco.
const BANCO_EFETIVO_SQL = `COALESCE(
  NULLIF(c.banco_enriquecido, ''),
  CASE WHEN c.banco_numero ~ '[0-9]' THEN
    CASE WHEN LENGTH(${DIGITOS_BANCO_SQL}) <= 3 THEN LPAD(${DIGITOS_BANCO_SQL}, 3, '0') ELSE ${DIGITOS_BANCO_SQL} END
  END
)`;

const SEM_CLASSIFICACAO = 'SEM_CLASSIFICACAO';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Master enxerga todas as empresas; os demais só as vinculadas ao próprio cadastro
// (mesma regra que o frontend usa em useEmpresaTravada).
async function assertAcessoEmpresa(usuarioId, empresaId) {
  const { rows } = await pool.query(
    `SELECT u.permissao,
            EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $2) AS vinculado
     FROM usuarios u
     WHERE u.id = $1 AND u.ativo = TRUE`,
    [usuarioId, empresaId]
  );
  const usuario = rows[0];
  if (!usuario || (usuario.permissao !== 'MASTER' && !usuario.vinculado)) {
    throw erro(403, 'Você não tem acesso a esta empresa.');
  }
}

// Opções do filtro "Empresa da conta" e de Banco — sempre a lista completa (não a já
// filtrada, senão as opções encolheriam conforme o usuário filtra). Só entram empresas que
// têm ao menos 1 conta CLASSIFICADA (pedido do usuário): a matriz de saldos já esconde
// conta sem classificação, então uma empresa que só tem contas assim não teria nenhuma
// linha pra mostrar — a opção ficaria "morta" no filtro. Isso é específico desta tela; o
// cadastro de Contas Bancárias (contas.service.js) continua listando TODAS as empresas,
// já que é lá que uma conta ganha a primeira classificação.
async function getFiltros(empresaId) {
  const { rows: empresas } = await pool.query(
    `SELECT company_id, MAX(company_name) AS company_name
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND classificacao IS NOT NULL
     GROUP BY company_id
     ORDER BY MAX(company_name) ASC NULLS LAST, company_id ASC`,
    [empresaId]
  );

  const { rows: usados } = await pool.query(
    `SELECT codigo, MAX(banco_nome) AS banco_nome
     FROM (SELECT ${BANCO_EFETIVO_SQL} AS codigo, c.banco_nome
           FROM contas_bancarias_sienge c
           WHERE c.empresa_id = $1) t
     WHERE codigo IS NOT NULL
     GROUP BY codigo
     ORDER BY codigo`,
    [empresaId]
  );

  // Opções do filtro "Conta bancária" — só as que realmente aparecem na grade (classificada +
  // projetando saldo), mesmo critério de getSaldos abaixo. `value` é composto
  // ("company_id:numero_conta") porque numero_conta sozinho não é garantidamente único entre
  // empresas Sienge diferentes dentro da mesma empresa Horizon.
  const { rows: contasFiltro } = await pool.query(
    `SELECT company_id, numero_conta, COALESCE(NULLIF(nome, ''), numero_conta) AS nome
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE
     ORDER BY nome ASC NULLS LAST, numero_conta ASC`,
    [empresaId]
  );

  // Nome do banco: o da lista oficial (BrasilAPI + internos, com a logomarca customizada do
  // cadastro de Bancos por cima da oficial onde existir uma — ver bancos.service.js); se ela
  // estiver fora do ar ou não conhecer o código (ex.: 901 "Escritório 01" do Sienge), cai no
  // nome que o Sienge mandou, e por último no próprio código. A logomarca só existe pros
  // bancos que têm uma (a tela mostra o código do banco no lugar quando não tem).
  let oficiais = new Map();
  try {
    oficiais = new Map((await bancosService.listarTodosComLogo()).map((b) => [b.codigo, b]));
  } catch {
    // segue só com os nomes vindos do Sienge
  }
  const bancos = usados.map((b) => ({
    codigo: b.codigo,
    nome: oficiais.get(b.codigo)?.nome || b.banco_nome || b.codigo,
    logo: oficiais.get(b.codigo)?.logo || null,
  }));

  return {
    empresas,
    bancos,
    contas: contasFiltro.map((c) => ({ value: `${c.company_id}:${c.numero_conta}`, label: c.nome })),
  };
}

// Contas + o saldo informado de cada dia do período. Contas inativas (DISABLED) só
// aparecem se tiverem algum saldo lançado no período — senão são 130 linhas de ruído —,
// assim nenhum lançamento antigo some da tela.
async function getSaldos(empresaId, { dataInicio, dataFim, companyIds = [], classificacoes = [], bancos = [], contas: contasFiltro = [] }) {
  const params = [empresaId, dataInicio, dataFim];
  let filtros = '';
  if (companyIds.length) {
    params.push(companyIds);
    filtros += ` AND c.company_id = ANY($${params.length}::int[])`;
  }
  if (classificacoes.length) {
    params.push(classificacoes);
    filtros += ` AND COALESCE(c.classificacao, '${SEM_CLASSIFICACAO}') = ANY($${params.length}::text[])`;
  }
  if (bancos.length) {
    params.push(bancos);
    filtros += ` AND ${BANCO_EFETIVO_SQL} = ANY($${params.length}::text[])`;
  }
  if (contasFiltro.length) {
    params.push(contasFiltro);
    filtros += ` AND (c.company_id::text || ':' || c.numero_conta) = ANY($${params.length}::text[])`;
  }

  // Só entra na grade quem está classificada E marcada pra projetar saldo (pedido do
  // usuário) — sem os dois, a conta fica de fora mesmo tendo saldo lançado no período.
  const { rows: contas } = await pool.query(
    `SELECT c.numero_conta, c.company_id, c.company_name, c.nome, c.classificacao, c.status,
            ${BANCO_EFETIVO_SQL} AS banco_codigo
     FROM contas_bancarias_sienge c
     WHERE c.empresa_id = $1
       AND c.classificacao IS NOT NULL AND c.projeta_saldo = TRUE
       AND (c.status = 'ENABLED' OR EXISTS (
             SELECT 1 FROM saldos_contas_bancarias s
             WHERE s.empresa_id = c.empresa_id AND s.company_id = c.company_id
               AND s.numero_conta = c.numero_conta AND s.data BETWEEN $2 AND $3))
       ${filtros}
     ORDER BY c.nome ASC NULLS LAST, c.numero_conta ASC, c.company_id ASC`,
    params
  );

  const { rows: saldos } = await pool.query(
    `SELECT s.company_id, s.numero_conta, TO_CHAR(s.data, 'YYYY-MM-DD') AS data, s.saldo, s.origem
     FROM saldos_contas_bancarias s
     WHERE s.empresa_id = $1 AND s.data BETWEEN $2 AND $3`,
    [empresaId, dataInicio, dataFim]
  );

  // `origens` é um mapa paralelo a `saldos` (mesmas chaves de data) — só pra grade colorir a
  // célula (API/HERDADO/MANUAL); os totais/soma continuam olhando só pra `saldos` (números
  // puros), sem precisar saber nada de origem.
  const porConta = new Map();
  for (const s of saldos) {
    const chave = `${s.company_id}|${s.numero_conta}`;
    if (!porConta.has(chave)) porConta.set(chave, { saldos: {}, origens: {} });
    porConta.get(chave).saldos[s.data] = Number(s.saldo);
    porConta.get(chave).origens[s.data] = s.origem;
  }

  return {
    contas: contas.map((c) => {
      const dados = porConta.get(`${c.company_id}|${c.numero_conta}`);
      return { ...c, saldos: dados?.saldos || {}, origens: dados?.origens || {} };
    }),
  };
}

const brData = (iso) => iso.split('-').reverse().join('/');

// Dia liberado pra lançar saldo nesta empresa AGORA — null se nenhum (cadeado trancado,
// nada é editável até alguém abrir um período explicitamente; ver abrirPeriodo).
async function getPeriodoAberto(empresaId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(data, 'YYYY-MM-DD') AS data FROM saldos_periodos WHERE empresa_id = $1 AND status = 'ABERTO'`,
    [empresaId]
  );
  return { data: rows[0]?.data || null };
}

// Abre um período (um dia) pra lançamento. Regras do usuário: só 1 aberto por vez (precisa
// encerrar o atual antes de abrir outro — o índice único parcial garante isso mesmo sob
// concorrência) e reabrir um dia já ENCERRADO exige confirmação explícita (`reabrirEncerrado`)
// — sem ela, devolve um erro com `code: 'PERIODO_ENCERRADO'` pra tela perguntar antes.
async function abrirPeriodo(empresaId, usuarioId, data, reabrirEncerrado) {
  const { rows: abertos } = await pool.query(
    `SELECT TO_CHAR(data, 'YYYY-MM-DD') AS data FROM saldos_periodos WHERE empresa_id = $1 AND status = 'ABERTO'`,
    [empresaId]
  );
  if (abertos[0] && abertos[0].data !== data) {
    throw erro(409, `Já existe um período aberto (${brData(abertos[0].data)}). Encerre-o antes de abrir outro.`);
  }

  const { rows: existente } = await pool.query(
    `SELECT status FROM saldos_periodos WHERE empresa_id = $1 AND data = $2`,
    [empresaId, data]
  );
  if (existente[0]?.status === 'ENCERRADO' && !reabrirEncerrado) {
    const err = erro(409, `Este período (${brData(data)}) já foi encerrado. Deseja reabri-lo?`);
    err.code = 'PERIODO_ENCERRADO';
    throw err;
  }

  await pool.query(
    `INSERT INTO saldos_periodos (empresa_id, data, status, aberto_por, aberto_em)
     VALUES ($1, $2, 'ABERTO', $3, NOW())
     ON CONFLICT (empresa_id, data) DO UPDATE SET
       status = 'ABERTO', aberto_por = EXCLUDED.aberto_por, aberto_em = NOW(),
       encerrado_por = NULL, encerrado_em = NULL`,
    [empresaId, data, usuarioId]
  );
  return { data };
}

// Encerra o período ABERTO desta empresa (se houver) — o cadeado volta a ficar trancado.
async function encerrarPeriodo(empresaId, usuarioId) {
  const { rows } = await pool.query(
    `UPDATE saldos_periodos SET status = 'ENCERRADO', encerrado_por = $2, encerrado_em = NOW()
     WHERE empresa_id = $1 AND status = 'ABERTO'
     RETURNING TO_CHAR(data, 'YYYY-MM-DD') AS data`,
    [empresaId, usuarioId]
  );
  if (!rows[0]) throw erro(400, 'Nenhum período está aberto.');
  return { data: null };
}

// Grava um lote de saldos numa transação só: saldo = null apaga o lançamento do dia
// ("não informado"), qualquer número (inclusive 0 e negativo — cheque especial) grava.
// Só aceita lançar no dia liberado (ver getPeriodoAberto) — é a trava de verdade por trás
// do botão de cadeado da tela: mesmo alguém batendo direto na API, sem passar pela grade
// (que já desabilita os outros dias), o servidor recusa.
async function salvarSaldos(empresaId, usuarioId, itens) {
  const { data: dataAberta } = await getPeriodoAberto(empresaId);
  const foraDoPeriodo = itens.some((i) => i.data !== dataAberta);
  if (foraDoPeriodo) {
    const msg = dataAberta
      ? `Só é possível lançar saldo no dia liberado (${brData(dataAberta)}). Abra o período para lançar em outro dia.`
      : 'Nenhum período está aberto para lançamento. Abra um período primeiro.';
    throw erro(409, msg);
  }

  // Mesmo (conta, dia) duas vezes no lote faria o ON CONFLICT tentar mexer na mesma
  // linha 2x e o Postgres recusa — vale o último.
  const porChave = new Map();
  for (const item of itens) porChave.set(`${item.company_id}|${item.numero_conta}|${item.data}`, item);
  const unicos = [...porChave.values()];

  const gravar = unicos.filter((i) => i.saldo !== null);
  const apagar = unicos.filter((i) => i.saldo === null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (gravar.length) {
      await client.query(
        `INSERT INTO saldos_contas_bancarias (empresa_id, company_id, numero_conta, data, saldo, origem, atualizado_por)
         SELECT $1, t.company_id, t.numero_conta, t.data, t.saldo, t.origem, $2
         FROM unnest($3::int[], $4::text[], $5::date[], $6::numeric[], $7::text[]) AS t(company_id, numero_conta, data, saldo, origem)
         ON CONFLICT (empresa_id, company_id, numero_conta, data)
         DO UPDATE SET saldo = EXCLUDED.saldo, origem = EXCLUDED.origem, atualizado_por = EXCLUDED.atualizado_por`,
        [
          empresaId,
          usuarioId,
          gravar.map((i) => i.company_id),
          gravar.map((i) => i.numero_conta),
          gravar.map((i) => i.data),
          gravar.map((i) => i.saldo.toFixed(2)),
          // Quem chama sem informar origem (a gravação manual da grade, via PUT público) cai
          // em MANUAL — é o único valor que o schema HTTP aceita hoje. A busca automática
          // VanPix (vanpix-sync.service.js) é quem informa 'API'/'HERDADO' explicitamente.
          gravar.map((i) => i.origem || 'MANUAL'),
        ]
      );
    }

    if (apagar.length) {
      await client.query(
        `DELETE FROM saldos_contas_bancarias s
         USING unnest($2::int[], $3::text[], $4::date[]) AS t(company_id, numero_conta, data)
         WHERE s.empresa_id = $1 AND s.company_id = t.company_id
           AND s.numero_conta = t.numero_conta AND s.data = t.data`,
        [empresaId, apagar.map((i) => i.company_id), apagar.map((i) => i.numero_conta), apagar.map((i) => i.data)]
      );
    }

    await client.query('COMMIT');
    return { gravados: gravar.length, apagados: apagar.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // 23503 = violação de FK: a conta informada não existe nesta empresa.
    if (err.code === '23503') throw erro(400, 'Conta bancária não encontrada nesta empresa.');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  assertAcessoEmpresa,
  getFiltros,
  getSaldos,
  salvarSaldos,
  getPeriodoAberto,
  abrirPeriodo,
  encerrarPeriodo,
  SEM_CLASSIFICACAO,
};
