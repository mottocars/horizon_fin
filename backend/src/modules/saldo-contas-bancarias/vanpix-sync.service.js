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
// Sábado e domingo não têm saldo bancário de verdade (banco não movimenta) — a função nem
// tenta a VanPix nesses dias, não grava nada (pedido do usuário). Segunda-feira (ou qualquer
// dia útil depois de um fim de semana/feriado) herda o saldo do último dia útil com dado —
// como esse valor É um saldo que veio da API em algum momento, ele entra com origem 'API', não
// 'HERDADO', pra toda conta automatizada (ver listarContasAutomatizadas): pro usuário, "o
// saldo não mudou" e "o saldo veio automático" são a mesma coisa.
//
// Pra toda conta classificada + projetando saldo (o mesmo critério de saldos.service.js::
// getSaldos) que NÃO aparece em nenhum retorno da VanPix, olha a prioridade configurada na
// classificação dela (classificacoes_bancarias.prioridade_sem_saldo): SALDO_ANTERIOR repete o
// último saldo já lançado antes de `data` (origem HERDADO); SEM_SALDO deixa em branco. Essa
// prioridade só decide quem NÃO é automatizado — quem é, sempre herda (ver acima).
const pool = require('../../config/db');
const vanpixService = require('../integracoes-vanpix/vanpix.service');
const itauService = require('../integracoes-itau/itau.service');
const classificacoesService = require('../classificacoes-bancarias/classificacoes.service');
const saldosService = require('./saldos.service');

function diaAnteriorISO(iso) {
  const d = new Date(`${iso}T12:00:00Z`); // meio-dia UTC evita virar o dia errado por fuso
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 0 = domingo, 6 = sábado (getUTCDay, meio-dia UTC pelo mesmo motivo de diaAnteriorISO).
function ehFimDeSemana(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

function paraDDMMYYYY(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${ano}`;
}

// Só as conexões de Extrato Bancário — as de Cobrança não trazem saldo de conta.
async function listarVanpixAtivasDaEmpresa(empresaId) {
  const { rows } = await pool.query("SELECT id FROM integracoes_vanpix WHERE empresa_id = $1 AND ativo = TRUE AND finalidade = 'EXTRATO'", [
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
// Devolve "company_id:numero_conta" → fonte do saldo API mais recente (VANPIX/ITAU; linhas
// antigas sem fonte eram todas VanPix), pra o saldo herdado manter a mesma fonte.
async function listarContasAutomatizadas(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (company_id, numero_conta) company_id, numero_conta, COALESCE(fonte, 'VANPIX') AS fonte
     FROM saldos_contas_bancarias WHERE empresa_id = $1 AND origem = 'API'
     ORDER BY company_id, numero_conta, data DESC`,
    [empresaId]
  );
  return new Map(rows.map((r) => [`${r.company_id}:${r.numero_conta}`, r.fonte]));
}

// Contas Itaú com agência + conta + dígito no cadastro casadas com a conexão API Itaú da mesma
// conta (agência/conta/DAC iguais). Só conexões ativas com certificado válido.
async function listarContasItau(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.id AS conexao_id, c.nome AS conexao, c.agencia, c.conta, c.dac, s.company_id, s.numero_conta
     FROM conexoes_itau c
     LEFT JOIN contas_bancarias_sienge s
       ON s.empresa_id = c.empresa_id
      AND LTRIM(s.agencia_enriquecida, '0') = LTRIM(c.agencia, '0')
      AND LTRIM(s.conta_enriquecida, '0') = LTRIM(c.conta, '0')
      AND s.digito = c.dac
      AND COALESCE(NULLIF(s.banco_enriquecido, ''), REGEXP_REPLACE(s.banco_numero, '[^0-9]', '', 'g')) IN ('341', '0341')
     WHERE c.empresa_id = $1 AND c.ativo = TRUE
       AND c.agencia IS NOT NULL AND c.conta IS NOT NULL AND c.dac IS NOT NULL
       AND c.certificado_pem IS NOT NULL AND c.data_validade_certificado > $2
     ORDER BY c.id`,
    [empresaId, new Date()]
  );
  return rows;
}

const ITAU_CONSULTAS_SIMULTANEAS = 4;

// Consulta o SALDO EM CONTA de cada conta Itaú (até 4 conexões ao mesmo tempo) e acrescenta
// os itens a gravar (origem API, fonte ITAU). Falha de UMA conexão vai pro relatório, não
// derruba as outras nem a VanPix.
async function buscarSaldosItau(empresaId, data, relatorio, itensParaGravar, casadasNaApi) {
  const linhas = await listarContasItau(empresaId);
  const porConexao = new Map();
  for (const l of linhas) {
    if (!porConexao.has(l.conexao_id)) porConexao.set(l.conexao_id, { ...l, contas: [] });
    if (l.company_id !== null) porConexao.get(l.conexao_id).contas.push({ company_id: l.company_id, numero_conta: l.numero_conta });
  }
  const conexoes = [...porConexao.values()];
  relatorio.conexoes = conexoes.length;

  const fila = [...conexoes];
  async function trabalhar() {
    while (fila.length) {
      const c = fila.shift();
      const contaTexto = `${c.agencia} / ${c.conta}-${c.dac}`;
      if (c.contas.length === 0) {
        relatorio.semCorrespondencia.push({ conexao: c.conexao, conta: contaTexto });
        continue;
      }
      const r = await itauService.consultarSaldoEmConta(c.conexao_id, data);
      if (!r.ok) {
        relatorio.falhas.push({ conexao: c.conexao, conta: contaTexto, mensagem: r.mensagem });
        continue;
      }
      for (const conta of c.contas) {
        casadasNaApi.add(`${conta.company_id}:${conta.numero_conta}`);
        itensParaGravar.push({ ...conta, data, saldo: r.valor, origem: 'API', fonte: 'ITAU' });
        relatorio.atualizados.push({ conexao: c.conexao, conta: contaTexto, ...conta, saldo: r.valor, posicao: r.posicao });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ITAU_CONSULTAS_SIMULTANEAS, conexoes.length) }, trabalhar));
}

// Roda todos os convênios VanPix ativos da empresa pra `data` (sábado/domingo: nem tenta, ver
// ehFimDeSemana), casa cada conta encontrada no retorno com o cadastro (banco+conta+dígito) e
// grava o saldo automaticamente (origem API). Toda conta-alvo que ficou de fora disso tenta
// herdar o último saldo lançado — automatizada sempre (origem API, é o mesmo saldo real de
// antes), as demais só se a classificação priorizar isso (origem HERDADO). Não lança exceção
// por causa de UM convênio com problema — cada um é reportado individualmente; só propaga erro
// se a própria gravação em lote falhar (ex.: período fechado por outra aba).
async function buscarSaldosVanpix(empresaId, usuarioId, data) {
  const relatorio = {
    convenios: [],
    atualizados: [],
    herdados: [],
    semCorrespondencia: [],
    itau: { conexoes: 0, atualizados: [], falhas: [], semCorrespondencia: [] },
  };
  if (ehFimDeSemana(data)) return relatorio; // sábado/domingo: nem consulta, nem grava nada

  const dataPesquisa = paraDDMMYYYY(data);
  const diaAnterior = diaAnteriorISO(data);
  const integracoes = await listarVanpixAtivasDaEmpresa(empresaId);

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
          itensParaGravar.push({ company_id: conta.company_id, numero_conta: conta.numero_conta, data, saldo: valor, origem: 'API', fonte: 'VANPIX' });
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

  // API Itaú: o saldo do momento (SALDO EM CONTA) de cada conta Itaú que tem agência, conta e
  // dígito no cadastro e uma conexão ativa com essa mesma conta (ver buscarSaldosItau).
  await buscarSaldosItau(empresaId, data, relatorio.itau, itensParaGravar, casadasNaApi);

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
    const fonteAutomatica = contasAutomatizadas.get(chave); // VANPIX/ITAU, ou undefined
    const automatizada = Boolean(fonteAutomatica);
    if (prioridadePorClassificacao.get(conta.classificacao) !== 'SALDO_ANTERIOR' && !automatizada) continue;

    const valorHerdado = await ultimoSaldoAnterior(empresaId, conta.company_id, conta.numero_conta, data);
    if (valorHerdado === null) continue; // nada lançado antes — não tem o que herdar, fica em branco

    // Automatizada: o valor herdado já veio da API antes, então entra como 'API' (não
    // 'HERDADO') — não é uma suposição, é o mesmo saldo real só sem movimentação nova. Só quem
    // herda por causa da prioridade da classificação (não automatizada) fica como 'HERDADO'.
    const origem = automatizada ? 'API' : 'HERDADO';
    itensParaGravar.push({
      company_id: conta.company_id,
      numero_conta: conta.numero_conta,
      data,
      saldo: valorHerdado,
      origem,
      fonte: automatizada ? fonteAutomatica : null,
    });
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

module.exports = { buscarSaldosVanpix, buscarSaldosItau };
