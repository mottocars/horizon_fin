// Ao abrir um período de saldo (dia D), busca o saldo das contas automaticamente e grava em
// saldos_contas_bancarias. Regra do usuário (out/2026):
//   - VanPix Extrato Bancário: usa o fechamento mais recente antes de D (pesquisa de D traz o
//     saldo final de D-1; numa segunda, a de sábado traz o de sexta). Na primeira abertura de
//     cada conta, olha até 1 ano para trás; depois, só 10 dias — e a conta que não aparecer
//     nesses 10 dias repete o último saldo (sem movimento = saldo igual).
//   - VanPix Cobrança: últimos 5 dias — soma ao saldo o Vl Pago dos boletos com Dt Crédito
//     depois do fechamento usado até D (conta com código cedente cobrança).
//   - API Itaú: tempo real (SALDO EM CONTA).
//   - Sem saldo por nenhuma delas: só herda o último saldo se a classificação da conta estiver
//     como "Buscar saldo anterior" (SALDO_ANTERIOR, origem HERDADO); senão fica em branco pra
//     ser informado à mão.
// Sábado e domingo: não consulta nem grava nada.
const pool = require('../../config/db');
const vanpixService = require('../integracoes-vanpix/vanpix.service');
const itauService = require('../integracoes-itau/itau.service');
const classificacoesService = require('../classificacoes-bancarias/classificacoes.service');
const saldosService = require('./saldos.service');
const { MOVIMENTOS_LIQUIDACAO, somaCreditos } = require('./cobranca.calculo');

// 0 = domingo, 6 = sábado (getUTCDay, meio-dia UTC evita virar o dia errado por fuso).
function ehFimDeSemana(iso) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dia === 0 || dia === 6;
}

const brData = (iso) => iso.split('-').reverse().join('/');

function paraDDMMYYYY(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${ano}`;
}

// Mesmo critério de "conta alvo" usado em saldos.service.js::getSaldos (classificada +
// projetando saldo) — é o universo inteiro de contas que a grade mostra, não só as que a
// VanPix conseguir casar.
async function listarContasAlvo(empresaId) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, nome, classificacao
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND classificacao IS NOT NULL AND projeta_saldo = TRUE`,
    [empresaId]
  );
  return rows;
}

// Último saldo já lançado (qualquer origem) antes de `data`, pra "herdar" quando a VanPix não
// retornou nada pra essa conta e a classificação prioriza isso.
// Devolve { valor, data, origem } (de qual dia veio — vai pra composição do saldo) ou null.
async function ultimoSaldoAnterior(empresaId, companyId, numeroConta, data) {
  const { rows } = await pool.query(
    `SELECT saldo, TO_CHAR(data, 'YYYY-MM-DD') AS data, origem FROM saldos_contas_bancarias
     WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3 AND data < $4
     ORDER BY data DESC LIMIT 1`,
    [empresaId, companyId, numeroConta, data]
  );
  return rows[0] ? { valor: Number(rows[0].saldo), data: rows[0].data, origem: rows[0].origem } : null;
}

// Contas com saldo AUTOMÁTICO (API/HERDADO, não manual) já gravado em `data` — de uma abertura
// anterior do mesmo dia. Se agora a conta ficar sem saldo, esse valor é apagado.
async function listarSaldosAutomaticosDoDia(empresaId, data) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta FROM saldos_contas_bancarias
     WHERE empresa_id = $1 AND data = $2 AND origem <> 'MANUAL'`,
    [empresaId, data]
  );
  return new Set(rows.map((r) => `${r.company_id}:${r.numero_conta}`));
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
        itensParaGravar.push({
          ...conta,
          data,
          saldo: r.valor,
          origem: 'API',
          fonte: 'ITAU',
          composicao: { extrato: { fonte: 'ITAU', conexao: c.conexao, conta: contaTexto, posicao: r.posicao || null, valor: r.valor } },
        });
        relatorio.atualizados.push({ conexao: c.conexao, conta: contaTexto, ...conta, saldo: r.valor, posicao: r.posicao });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(ITAU_CONSULTAS_SIMULTANEAS, conexoes.length) }, trabalhar));
}

// ---------------------------------------------------------------------------------------
// EXTRATO (regra do usuário): a VanPix Extrato só é consultada para os apelidos informados no
// "Código cedente extrato bancário" das contas. Para cada apelido, começa em `data` e volta
// (vários dias por vez) até achar o saldo final de TODAS as contas com esse cedente (casadas
// pelo banco + conta + dígito do lote). Vale o fechamento mais recente de um dia ANTERIOR a
// `data` (numa segunda, a pesquisa de sábado traz o de sexta). Até onde voltar depende da conta:
//   - carga inicial (primeira abertura da conta com esse apelido): até 1 ano; o que achar, grava;
//   - depois disso: só 10 dias. A carga inicial já varreu a base, então conta que não aparece
//     em 10 dias não teve movimento — repete o último saldo como se tivesse sido encontrado.
// A marca da carga inicial fica em contas_bancarias_sienge.extrato_carga_inicial_apelido
// (trocar o código cedente da conta faz a carga inicial de novo).
// ---------------------------------------------------------------------------------------
const EXTRATO_DIAS_CARGA_INICIAL = 365;
const EXTRATO_DIAS_ROTINA = 10;
const EXTRATO_CONSULTAS_SIMULTANEAS = 10;

async function listarContasComCedenteExtrato(empresaId) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, nome, codigo_cedente_extrato AS apelido, conta_enriquecida, digito,
            COALESCE(NULLIF(banco_enriquecido, ''), REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g')) AS banco,
            extrato_carga_inicial_apelido IS NOT DISTINCT FROM codigo_cedente_extrato AS carga_inicial_feita
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND NULLIF(codigo_cedente_extrato, '') IS NOT NULL`,
    [empresaId]
  );
  return rows.map((c) => ({ ...c, diasRetroativos: c.carga_inicial_feita ? EXTRATO_DIAS_ROTINA : EXTRATO_DIAS_CARGA_INICIAL }));
}

// Marca a carga inicial (1 ano) como feita, pra próxima abertura olhar só 10 dias.
async function marcarCargaInicialExtrato(empresaId, contas) {
  for (const c of contas) {
    await pool.query(
      `UPDATE contas_bancarias_sienge SET extrato_carga_inicial_apelido = $4, extrato_carga_inicial_em = NOW()
       WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3`,
      [empresaId, c.company_id, c.numero_conta, c.apelido]
    );
  }
}

// Dia útil (seg–sex) anterior a `iso` — o "fechamento" de uma conta sem movimento.
function diaUtilAnterior(iso) {
  let dia = menosDiasISO(iso, 1);
  while (ehFimDeSemana(dia)) dia = menosDiasISO(dia, 1);
  return dia;
}

const semZeros = (v) => String(v ?? '').replace(/^0+/, '');
const loteDaConta = (lote, conta) =>
  semZeros(lote.conta) === semZeros(conta.conta_enriquecida) &&
  lote.digitoConta === conta.digito &&
  semZeros(lote.banco) === semZeros(conta.banco);

// Varre os retornos de um apelido de `data` para trás, cada conta até os seus `diasRetroativos`
// (até EXTRATO_CONSULTAS_SIMULTANEAS dias consultados ao mesmo tempo, mas lidos do mais recente
// para o mais antigo). Devolve { encontrados: Map(conta -> lote), falha: {status, mensagem} | null }
// — `falha` é credencial/apelido inválido ou rede: a varredura para e não dá pra afirmar que as
// contas não encontradas estão sem movimento.
async function buscarExtratoRetroativo(cred, apelido, contas, data) {
  const encontrados = new Map();
  const maxDias = Math.max(...contas.map((c) => c.diasRetroativos));
  const pendente = (i) => contas.some((c) => !encontrados.has(c) && i <= c.diasRetroativos);

  for (let inicio = 0; inicio <= maxDias && pendente(inicio); inicio += EXTRATO_CONSULTAS_SIMULTANEAS) {
    const dias = [];
    for (let i = inicio; i <= Math.min(inicio + EXTRATO_CONSULTAS_SIMULTANEAS - 1, maxDias); i++) dias.push(i);
    const respostas = await Promise.all(
      dias.map((i) => vanpixService.buscarRetorno(cred.serviceKey, cred.clientSecret, apelido, paraDDMMYYYY(menosDiasISO(data, i))))
    );
    for (let k = 0; k < dias.length; k++) {
      const r = respostas[k];
      if (r.status === 'credencial_invalida' || r.status === 'apelido_invalido' || r.status === 'erro_rede') {
        return { encontrados, falha: { status: r.status, mensagem: r.mensagem } };
      }
      if (r.status !== 'ok_com_retorno') continue;
      for (const conta of contas) {
        if (encontrados.has(conta) || dias[k] > conta.diasRetroativos) continue;
        const lotes = r.lotes.filter((l) => l.saldoFinal?.data && l.saldoFinal.data < data && loteDaConta(l, conta));
        const maisRecente = lotes.sort((x, y) => (x.saldoFinal.data < y.saldoFinal.data ? 1 : -1))[0];
        if (maisRecente) encontrados.set(conta, maisRecente);
      }
    }
  }
  return { encontrados, falha: null };
}

// ---------------------------------------------------------------------------------------
// COBRANÇA: conta com `codigo_cedente_cobranca` (apelido VanPix de uma conexão de Cobrança)
// soma ao saldo do dia `data` o Vl Pago dos títulos liquidados com Dt Crédito = `data`. O
// extrato da VanPix traz o saldo final do dia anterior, então esses créditos ainda não estão
// nele. A Caixa manda o retorno dias antes do crédito (ex.: arquivo de 02/10, crédito 05/10),
// por isso a varredura olha os arquivos de `data` - 5 até `data` (todo dia do calendário — a
// VanPix tem arquivo até de sábado). Todos os títulos lidos ficam gravados em cobranca_titulos
// (upsert: varrer de novo não duplica) e a soma sai da tabela (ver somaCreditos).
// ---------------------------------------------------------------------------------------
const COBRANCA_DIAS_VARREDURA = 5;

function menosDiasISO(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

async function listarContasComCedente(empresaId) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, nome, codigo_cedente_cobranca AS apelido
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND NULLIF(codigo_cedente_cobranca, '') IS NOT NULL`,
    [empresaId]
  );
  return rows;
}

const real = (centavos) => centavos / 100;

async function gravarTitulos(empresaId, integracaoId, apelido, { arquivo, titulos }) {
  const agora = new Date();
  for (const t of titulos) {
    if (!t.nossoNumero || !t.dataOcorrencia) continue;
    await pool.query(
      `INSERT INTO cobranca_titulos (
         empresa_id, integracao_id, apelido, beneficiario_codigo, arquivo_nsa, arquivo_gerado_em,
         cod_movimento, nosso_numero, nosso_numero_dv, carteira, numero_documento, ident_titulo_empresa,
         vencimento, valor_titulo, banco_cobrador, agencia_cobradora, pagador_tipo, pagador_documento,
         pagador_nome, valor_tarifa, canal, motivo_ocorrencia, juros_multa, desconto, abatimento, iof,
         valor_pago, valor_creditado, outras_despesas, outros_creditos, data_ocorrencia, data_credito,
         data_debito_tarifa, pagador_efetivo, linha_t, linha_u, buscado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
       ON CONFLICT (apelido, nosso_numero, cod_movimento, data_ocorrencia) DO UPDATE SET
         integracao_id = EXCLUDED.integracao_id, arquivo_nsa = EXCLUDED.arquivo_nsa,
         arquivo_gerado_em = EXCLUDED.arquivo_gerado_em, valor_pago = EXCLUDED.valor_pago,
         valor_creditado = EXCLUDED.valor_creditado, data_credito = EXCLUDED.data_credito,
         linha_t = EXCLUDED.linha_t, linha_u = EXCLUDED.linha_u, buscado_em = EXCLUDED.buscado_em`,
      [
        empresaId, integracaoId, apelido, arquivo.beneficiarioCodigo, arquivo.nsa, arquivo.geradoEm,
        t.codMovimento, t.nossoNumero, t.nossoNumeroDv || null, t.carteira || null, t.numeroDocumento || null,
        t.identTituloEmpresa || null, t.vencimento, real(t.valorTitulo), t.bancoCobrador || null,
        t.agenciaCobradora || null, t.pagadorTipo || null, t.pagadorDocumento || null, t.pagadorNome || null,
        real(t.valorTarifa), t.canal || null, t.motivoOcorrencia || null, real(t.jurosMulta), real(t.desconto),
        real(t.abatimento), real(t.iof), real(t.valorPago), real(t.valorCreditado), real(t.outrasDespesas),
        real(t.outrosCreditos), t.dataOcorrencia, t.dataCredito, t.dataDebitoTarifa, t.pagadorEfetivo,
        t.linhaT.slice(0, 240), t.linhaU.slice(0, 240), agora,
      ]
    );
  }
}

// Varre os retornos de cobrança de um apelido (data - 5 até data) e grava os títulos. Devolve
// a mensagem de falha (credencial, rede...) ou null.
async function varrerCobranca(empresaId, integracaoId, apelido, inicio, data) {
  const cred = await vanpixService.getCredenciais(integracaoId);
  if (!cred) return 'Conexão VanPix de Cobrança não encontrada.';
  let falha = null;
  for (let dia = inicio; dia <= data; dia = menosDiasISO(dia, -1)) {
    const r = await vanpixService.buscarRetornoCobranca(cred.serviceKey, cred.clientSecret, apelido, paraDDMMYYYY(dia));
    if (r.status === 'ok_com_retorno') {
      for (const arquivo of r.arquivos) await gravarTitulos(empresaId, integracaoId, apelido, arquivo);
    } else if (r.status !== 'ok_sem_retorno') {
      falha = r.mensagem;
      if (r.status === 'credencial_invalida' || r.status === 'apelido_invalido') break; // não adianta repetir
    }
  }
  return falha;
}

// Saldo da conta já montado nesta rodada (o último vale, como em salvarSaldos).
function itemDaConta(itensParaGravar, conta) {
  const item = [...itensParaGravar].reverse().find((i) => i.company_id === conta.company_id && i.numero_conta === conta.numero_conta);
  return item && item.saldo !== null ? item : null;
}

async function somarCobranca(empresaId, data, itensParaGravar, relatorio) {
  const contas = await listarContasComCedente(empresaId);
  if (contas.length === 0) return;
  const conexoes = await vanpixService.conexoesPorApelido(empresaId, 'COBRANCA');

  // Créditos que entram: DEPOIS do fechamento do extrato usado até `data`. Num dia normal o
  // fechamento é D-1 → só os de D; numa segunda (fechamento de sexta) → sábado a segunda.
  // Sem fechamento (saldo herdado/Itaú) → só os de D.
  for (const conta of contas) {
    const item = itemDaConta(itensParaGravar, conta);
    conta.depoisDe = item?.dataFechamento || menosDiasISO(data, 1);
  }

  const apelidosVarridos = new Set();
  for (const apelido of new Set(contas.map((c) => c.apelido))) {
    const integracaoId = conexoes.get(apelido);
    if (!integracaoId) {
      relatorio.falhas.push({ apelido, mensagem: 'Nenhuma conexão VanPix de Cobrança ativa com este convênio (apelido).' });
      continue;
    }
    // VanPix Cobrança: sempre os últimos 5 dias
    const falha = await varrerCobranca(empresaId, integracaoId, apelido, menosDiasISO(data, COBRANCA_DIAS_VARREDURA), data);
    if (falha) relatorio.falhas.push({ apelido, mensagem: falha });
    apelidosVarridos.add(apelido); // mesmo com falha num dia, soma o que já está gravado
  }

  for (const conta of contas) {
    if (!apelidosVarridos.has(conta.apelido)) continue;
    const { rows: titulos } = await pool.query(
      `SELECT cod_movimento, valor_pago, TO_CHAR(data_credito, 'YYYY-MM-DD') AS data_credito,
              nosso_numero, numero_documento, pagador_nome, valor_titulo, juros_multa,
              TO_CHAR(data_ocorrencia, 'YYYY-MM-DD') AS data_ocorrencia, banco_cobrador, canal
       FROM cobranca_titulos WHERE empresa_id = $1 AND apelido = $2 AND data_credito > $3 AND data_credito <= $4
       ORDER BY data_credito, valor_pago DESC`,
      [empresaId, conta.apelido, conta.depoisDe, data]
    );
    const soma = somaCreditos(titulos, conta.depoisDe, data);
    const base = {
      apelido: conta.apelido,
      company_id: conta.company_id,
      numero_conta: conta.numero_conta,
      nome: conta.nome,
      creditosDe: menosDiasISO(conta.depoisDe, -1),
      creditosAte: data,
      ...soma,
    };
    if (soma.titulos === 0) {
      relatorio.contas.push(base);
      continue;
    }
    // soma no saldo automático que a conta já recebeu neste dia (extrato VanPix/Itaú ou herdado)
    const item = itemDaConta(itensParaGravar, conta);
    if (!item) {
      relatorio.falhas.push({
        apelido: conta.apelido,
        conta: conta.nome || conta.numero_conta,
        mensagem: `Sem saldo do extrato no dia para somar R$ ${soma.valor.toFixed(2)} de cobrança.`,
      });
      continue;
    }
    item.saldo = Math.round((item.saldo + soma.valor) * 100) / 100;
    item.saldoCobranca = soma.valor;
    // composição: cada boleto somado (só liquidação — mesma regra de somaCreditos)
    const somados = titulos.filter((t) => MOVIMENTOS_LIQUIDACAO.includes(t.cod_movimento));
    item.composicao = {
      ...(item.composicao || {}),
      cobranca: {
        apelido: conta.apelido,
        de: base.creditosDe,
        ate: data,
        valor: soma.valor,
        titulos: somados.map((t) => ({
          nossoNumero: t.nosso_numero,
          documento: t.numero_documento,
          pagador: t.pagador_nome,
          valorTitulo: Number(t.valor_titulo),
          juros: Number(t.juros_multa),
          valorPago: Number(t.valor_pago),
          dataOcorrencia: t.data_ocorrencia,
          dataCredito: t.data_credito,
          banco: t.banco_cobrador,
          canal: t.canal,
        })),
      },
    };
    relatorio.contas.push(base);
  }
}

// Roda todos os convênios VanPix ativos da empresa pra `data` (sábado/domingo: nem tenta, ver
// ehFimDeSemana), casa cada conta encontrada no retorno com o cadastro (banco+conta+dígito) e
// grava o saldo automaticamente (origem API). Conta-alvo que ficou de fora disso só herda o
// último saldo se a classificação pedir (origem HERDADO); senão fica em branco. Não lança exceção
// por causa de UM convênio com problema — cada um é reportado individualmente; só propaga erro
// se a própria gravação em lote falhar (ex.: período fechado por outra aba).
async function buscarSaldosVanpix(empresaId, usuarioId, data) {
  const relatorio = {
    convenios: [],
    atualizados: [],
    herdados: [],
    semSaldo: [],
    semCorrespondencia: [],
    itau: { conexoes: 0, atualizados: [], falhas: [], semCorrespondencia: [] },
    cobranca: { contas: [], falhas: [] },
  };
  if (ehFimDeSemana(data)) return relatorio; // sábado/domingo: nem consulta, nem grava nada

  const itensParaGravar = [];
  const casadasNaApi = new Set(); // "company_id:numero_conta" já resolvidas via API nesta rodada

  // VanPix Extrato: só os apelidos informados nas contas (Código cedente extrato bancário).
  const contasExtrato = await listarContasComCedenteExtrato(empresaId);
  const conexoesExtrato = await vanpixService.conexoesPorApelido(empresaId, 'EXTRATO');
  const cargaInicialFeita = []; // contas que fizeram a varredura de 1 ano agora (marcadas no fim)
  for (const apelido of new Set(contasExtrato.map((c) => c.apelido))) {
    const contas = contasExtrato.filter((c) => c.apelido === apelido);
    const integracaoId = conexoesExtrato.get(apelido);
    const cred = integracaoId ? await vanpixService.getCredenciais(integracaoId) : null;
    if (!cred) {
      relatorio.convenios.push({
        apelido,
        status: 'sem_conexao',
        aviso: true,
        mensagem: 'Nenhuma conexão VanPix de Extrato Bancário ativa com este convênio (apelido).',
      });
      continue;
    }
    const { encontrados, falha } = await buscarExtratoRetroativo(cred, apelido, contas, data);
    const nomeConta = (c) => c.nome || c.numero_conta;
    const repetidas = [];
    const semSaldo = [];

    for (const [conta, lote] of encontrados) {
      const valor = Math.round(lote.saldoFinal.valorCentavos * (lote.saldoFinal.situacao === 'D' ? -1 : 1)) / 100;
      casadasNaApi.add(`${conta.company_id}:${conta.numero_conta}`);
      // dataFechamento: dia do saldo final usado (D-1 num dia normal; sexta numa segunda) —
      // a cobrança soma os créditos DEPOIS dele até `data` (ver somarCobranca).
      itensParaGravar.push({
        company_id: conta.company_id,
        numero_conta: conta.numero_conta,
        data,
        saldo: valor,
        origem: 'API',
        fonte: 'VANPIX',
        dataFechamento: lote.saldoFinal.data,
        composicao: {
          extrato: { fonte: 'VANPIX', apelido, conta: `${lote.conta}-${lote.digitoConta}`, dataFechamento: lote.saldoFinal.data, valor },
        },
      });
      relatorio.atualizados.push({
        apelido,
        banco: lote.banco,
        conta: lote.conta,
        digito: lote.digitoConta,
        company_id: conta.company_id,
        numero_conta: conta.numero_conta,
        saldo: valor,
        dataFechamento: lote.saldoFinal.data,
      });
    }

    for (const conta of contas) {
      if (encontrados.has(conta)) continue;
      // Já passou pela carga inicial e a varredura de 10 dias foi até o fim: sem movimento,
      // repete o último saldo como se o extrato tivesse trazido. Fechamento = último dia útil
      // antes de `data` (a cobrança soma os créditos depois dele, como num fechamento real).
      const anterior = conta.carga_inicial_feita && !falha
        ? await ultimoSaldoAnterior(empresaId, conta.company_id, conta.numero_conta, data)
        : null;
      if (!anterior) {
        semSaldo.push(conta);
        continue;
      }
      const dataFechamento = diaUtilAnterior(data);
      const contaTexto = `${conta.conta_enriquecida || ''}-${conta.digito || ''}`;
      casadasNaApi.add(`${conta.company_id}:${conta.numero_conta}`);
      itensParaGravar.push({
        company_id: conta.company_id,
        numero_conta: conta.numero_conta,
        data,
        saldo: anterior.valor,
        origem: 'API',
        fonte: 'VANPIX',
        dataFechamento,
        composicao: {
          extrato: { fonte: 'VANPIX', apelido, conta: contaTexto, dataFechamento, valor: anterior.valor, repetidoDe: anterior.data },
        },
      });
      relatorio.atualizados.push({
        apelido,
        banco: conta.banco,
        conta: conta.conta_enriquecida,
        digito: conta.digito,
        company_id: conta.company_id,
        numero_conta: conta.numero_conta,
        saldo: anterior.valor,
        dataFechamento,
        repetidoDe: anterior.data,
      });
      repetidas.push(conta);
    }

    if (!falha) cargaInicialFeita.push(...contas.filter((c) => !c.carga_inicial_feita));

    const fechamentos = [...new Set([...encontrados.values()].map((l) => brData(l.saldoFinal.data)))];
    const partes = [];
    if (falha) partes.push(falha.mensagem);
    if (fechamentos.length) partes.push(`Saldo final de ${fechamentos.join(', ')}.`);
    if (repetidas.length) {
      partes.push(`Sem movimento em ${EXTRATO_DIAS_ROTINA} dias, repetido o último saldo: ${repetidas.map(nomeConta).join(', ')}.`);
    }
    if (semSaldo.length) {
      const motivo = falha
        ? 'Sem saldo (varredura interrompida)'
        : semSaldo.some((c) => c.carga_inicial_feita)
          ? 'Sem saldo encontrado nem saldo anterior para repetir'
          : `Sem saldo em ${EXTRATO_DIAS_CARGA_INICIAL} dias (carga inicial)`;
      partes.push(`${motivo}: ${semSaldo.map(nomeConta).join(', ')}.`);
    }
    relatorio.convenios.push({
      apelido,
      status: falha ? falha.status : encontrados.size || repetidas.length ? 'ok_com_retorno' : 'ok_sem_retorno',
      aviso: Boolean(falha) || semSaldo.length > 0,
      mensagem: partes.join(' '),
    });
  }

  // API Itaú: o saldo do momento (SALDO EM CONTA) de cada conta Itaú que tem agência, conta e
  // dígito no cadastro e uma conexão ativa com essa mesma conta (ver buscarSaldosItau).
  await buscarSaldosItau(empresaId, data, relatorio.itau, itensParaGravar, casadasNaApi);

  // Segunda passada (regra do usuário): conta que nenhuma integração resolveu — VanPix
  // Extrato (encontrado ou repetido) ou API Itaú (tempo real) — SÓ herda o último saldo se a
  // classificação dela estiver como "Buscar saldo anterior" (SALDO_ANTERIOR). Qualquer outra
  // fica em branco pra ser informada à mão; se uma abertura anterior deste mesmo dia tinha
  // gravado saldo automático nela, ele é apagado (saldo digitado à mão nunca é apagado).
  const [contasAlvo, prioridadePorClassificacao, automaticosDoDia] = await Promise.all([
    listarContasAlvo(empresaId),
    classificacoesService.mapaPorNome(empresaId),
    listarSaldosAutomaticosDoDia(empresaId, data),
  ]);

  for (const conta of contasAlvo) {
    const chave = `${conta.company_id}:${conta.numero_conta}`;
    if (casadasNaApi.has(chave)) continue;
    const herda = prioridadePorClassificacao.get(conta.classificacao) === 'SALDO_ANTERIOR';
    const anterior = herda ? await ultimoSaldoAnterior(empresaId, conta.company_id, conta.numero_conta, data) : null;
    const valorHerdado = anterior ? anterior.valor : null;

    if (valorHerdado === null) {
      // em branco — tira o automático de uma abertura anterior deste dia, se houver
      if (automaticosDoDia.has(chave)) {
        itensParaGravar.push({ company_id: conta.company_id, numero_conta: conta.numero_conta, data, saldo: null });
      }
      relatorio.semSaldo.push({ classificacao: conta.classificacao, nome: conta.nome, company_id: conta.company_id, numero_conta: conta.numero_conta });
      continue;
    }
    itensParaGravar.push({
      company_id: conta.company_id,
      numero_conta: conta.numero_conta,
      data,
      saldo: valorHerdado,
      origem: 'HERDADO',
      fonte: null,
      composicao: { herdado: { de: anterior.data, origem: anterior.origem, valor: valorHerdado, classificacao: conta.classificacao } },
    });
    relatorio.herdados.push({
      classificacao: conta.classificacao,
      company_id: conta.company_id,
      numero_conta: conta.numero_conta,
      saldo: valorHerdado,
    });
  }

  // Cobrança: soma os títulos com Dt Crédito = data no saldo de quem tem código cedente. Um
  // problema aqui vira aviso no relatório — nunca derruba o saldo do extrato.
  try {
    await somarCobranca(empresaId, data, itensParaGravar, relatorio.cobranca);
  } catch (err) {
    console.error('[saldos] cobrança:', err.message);
    relatorio.cobranca.falhas.push({ apelido: 'Cobrança', mensagem: `Erro ao processar a cobrança: ${err.message}` });
  }

  if (itensParaGravar.length > 0) {
    await saldosService.salvarSaldos(empresaId, usuarioId, itensParaGravar);
  }
  // Só depois de gravar: se a gravação falhar (ex.: período fechado), a próxima abertura
  // refaz a carga inicial.
  await marcarCargaInicialExtrato(empresaId, cargaInicialFeita);

  return relatorio;
}

module.exports = { buscarSaldosVanpix, buscarSaldosItau };
