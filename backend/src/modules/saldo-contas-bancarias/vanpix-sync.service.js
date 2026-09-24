// Ao abrir um período de saldo, busca automaticamente na VanPix o saldo final das contas
// que já têm banco/conta/dígito cadastrados (contas_bancarias_sienge.banco_enriquecido +
// conta_enriquecida + digito) e grava direto em saldos_contas_bancarias — sem exigir digitação
// manual pra quem já tem a integração configurada.
//
// Relação de datas (confirmada com o usuário testando ao vivo): pedir o retorno da VanPix com
// data_pesquisa = D traz o saldo FINAL do dia ANTERIOR (D-1) — o extrato da CAIXA de um dia só
// fica pronto no dia seguinte. O saldo plotado no dia `data` (o período sendo aberto) é esse
// saldo final de `data - 1 dia`, que é também o saldo inicial de `data` — por isso consultamos
// a VanPix com a própria `data` (sem somar dia nenhum).
//
// Pra toda conta classificada + projetando saldo (o mesmo critério de saldos.service.js::
// getSaldos) que NÃO aparece em nenhum retorno da VanPix, olha a prioridade configurada na
// classificação dela (classificacoes_bancarias.prioridade_sem_saldo): SALDO_ANTERIOR repete o
// último saldo já lançado antes de `data` (origem HERDADO); SEM_SALDO deixa em branco.
const pool = require('../../config/db');
const vanpixService = require('../integracoes-vanpix/vanpix.service');
const classificacoesService = require('../classificacoes-bancarias/classificacoes.service');
const saldosService = require('./saldos.service');

function diaAnteriorISO(iso) {
  const d = new Date(`${iso}T12:00:00Z`); // meio-dia UTC evita virar o dia errado por fuso
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function paraDDMMYYYY(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${ano}`;
}

async function listarVanpixAtivasDaEmpresa(empresaId) {
  const { rows } = await pool.query('SELECT id FROM integracoes_vanpix WHERE empresa_id = $1 AND ativo = TRUE', [
    empresaId,
  ]);
  return rows;
}

// Mesmo critério de "conta alvo" usado em saldos.service.js::getSaldos (classificada +
// projetando saldo) — é o universo inteiro de contas que a grade mostra, não só as que a
// VanPix conseguir casar.
async function listarContasAlvo(empresaId) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, classificacao
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE`,
    [empresaId]
  );
  return rows;
}

// Mesmo critério de "banco efetivo" usado no resto do módulo de saldos (banco_enriquecido
// prevalece sobre o código bruto do Sienge).
async function buscarContasCorrespondentes(empresaId, banco, conta, digitoConta) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1
       AND conta_enriquecida = $2
       AND digito = $3
       AND COALESCE(NULLIF(banco_enriquecido, ''), REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g')) = $4`,
    [empresaId, conta, digitoConta, banco]
  );
  return rows;
}

// Último saldo já lançado (qualquer origem) antes de `data`, pra "herdar" quando a VanPix não
// retornou nada pra essa conta e a classificação prioriza isso.
async function ultimoSaldoAnterior(empresaId, companyId, numeroConta, data) {
  const { rows } = await pool.query(
    `SELECT saldo FROM saldos_contas_bancarias
     WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3 AND data < $4
     ORDER BY data DESC LIMIT 1`,
    [empresaId, companyId, numeroConta, data]
  );
  return rows[0] ? Number(rows[0].saldo) : null;
}

// Contas que a VanPix já alimentou alguma vez (origem = 'API' em qualquer dia) — usado pra
// herdar o saldo sem depender da prioridade da classificação (ver comentário na segunda
// passada de buscarSaldosVanpix): segunda-feira, a VanPix devolve o saldo de sábado/domingo
// (quando devolve algo), que não bate com `diaAnterior` esperado e é descartado — sem essa
// garantia extra, a conta ficava em branco até alguém configurar a classificação certa.
async function listarContasAutomatizadas(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT company_id, numero_conta FROM saldos_contas_bancarias WHERE empresa_id = $1 AND origem = 'API'`,
    [empresaId]
  );
  return new Set(rows.map((r) => `${r.company_id}:${r.numero_conta}`));
}

// Roda todos os convênios VanPix ativos da empresa pra `data`, casa cada conta encontrada no
// retorno com o cadastro (banco+conta+dígito) e grava o saldo automaticamente (origem API).
// Toda conta-alvo que ficou de fora disso tenta herdar o saldo do dia anterior (origem
// HERDADO), se a classificação dela priorizar isso. Não lança exceção por causa de UM
// convênio com problema — cada um é reportado individualmente; só propaga erro se a própria
// gravação em lote falhar (ex.: período fechado por outra aba).
async function buscarSaldosVanpix(empresaId, usuarioId, data) {
  const dataPesquisa = paraDDMMYYYY(data);
  const diaAnterior = diaAnteriorISO(data);
  const integracoes = await listarVanpixAtivasDaEmpresa(empresaId);

  const relatorio = { convenios: [], atualizados: [], herdados: [], semCorrespondencia: [] };
  if (integracoes.length === 0) return relatorio;

  const itensParaGravar = [];
  const casadasNaApi = new Set(); // "company_id:numero_conta" já resolvidas via API nesta rodada

  for (const integracao of integracoes) {
    const cred = await vanpixService.getCredenciais(integracao.id);
    if (!cred || !cred.ativo || cred.apelidos.length === 0) continue;

    for (const apelido of cred.apelidos) {
      const resultado = await vanpixService.buscarRetorno(cred.serviceKey, cred.clientSecret, apelido, dataPesquisa);
      relatorio.convenios.push({ apelido, status: resultado.status, mensagem: resultado.mensagem });
      if (resultado.status !== 'ok_com_retorno') continue;

      for (const lote of resultado.lotes) {
        // o trailer traz a DATA do saldo final (deveria ser sempre `diaAnterior`, já que foi
        // isso que pedimos) — se vier outra coisa, é mais seguro ignorar que gravar errado.
        if (lote.saldoFinal.data !== diaAnterior) continue;

        const contas = await buscarContasCorrespondentes(empresaId, lote.banco, lote.conta, lote.digitoConta);
        if (contas.length === 0) {
          relatorio.semCorrespondencia.push({ apelido, banco: lote.banco, conta: lote.conta, digito: lote.digitoConta });
          continue;
        }

        const valor = Math.round(lote.saldoFinal.valorCentavos * (lote.saldoFinal.situacao === 'D' ? -1 : 1)) / 100;
        for (const conta of contas) {
          casadasNaApi.add(`${conta.company_id}:${conta.numero_conta}`);
          itensParaGravar.push({ company_id: conta.company_id, numero_conta: conta.numero_conta, data, saldo: valor, origem: 'API' });
          relatorio.atualizados.push({
            apelido,
            banco: lote.banco,
            conta: lote.conta,
            digito: lote.digitoConta,
            company_id: conta.company_id,
            numero_conta: conta.numero_conta,
            saldo: valor,
          });
        }
      }
    }
  }

  // Segunda passada: toda conta-alvo que a API não resolveu tenta herdar — conforme a
  // prioridade cadastrada na classificação dela OU, sempre, se a própria conta já é
  // automatizada (já recebeu algum saldo via VanPix antes): pra quem já é automatizado, herdar
  // não é uma preferência configurável, é a garantia de nunca ficar em branco por causa de um
  // dia sem movimentação bancária (fim de semana, feriado).
  const [contasAlvo, prioridadePorClassificacao, contasAutomatizadas] = await Promise.all([
    listarContasAlvo(empresaId),
    classificacoesService.mapaPorNome(empresaId),
    listarContasAutomatizadas(empresaId),
  ]);

  for (const conta of contasAlvo) {
    const chave = `${conta.company_id}:${conta.numero_conta}`;
    if (casadasNaApi.has(chave)) continue;
    const automatizada = contasAutomatizadas.has(chave);
    if (prioridadePorClassificacao.get(conta.classificacao) !== 'SALDO_ANTERIOR' && !automatizada) continue;

    const valorHerdado = await ultimoSaldoAnterior(empresaId, conta.company_id, conta.numero_conta, data);
    if (valorHerdado === null) continue; // nada lançado antes — não tem o que herdar, fica em branco

    itensParaGravar.push({ company_id: conta.company_id, numero_conta: conta.numero_conta, data, saldo: valorHerdado, origem: 'HERDADO' });
    relatorio.herdados.push({
      classificacao: conta.classificacao,
      company_id: conta.company_id,
      numero_conta: conta.numero_conta,
      saldo: valorHerdado,
    });
  }

  if (itensParaGravar.length > 0) {
    await saldosService.salvarSaldos(empresaId, usuarioId, itensParaGravar);
  }

  return relatorio;
}

module.exports = { buscarSaldosVanpix };
