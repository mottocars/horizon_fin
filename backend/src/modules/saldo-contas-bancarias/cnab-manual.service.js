// CNAB 240 manual: arquivos de retorno anexados pelo usuário na abertura do período, para as
// contas com tipo de convênio CNAB_MANUAL (Cadastros > Contas Bancárias > edição da conta).
//   - Retorno de EXTRATO (layout "Extrato Eletrônico para Conciliação Bancária", FEBRABAN —
//     qualquer banco): cada conta vem num lote; casa com o cadastro por banco + conta + dígito
//     (loteDaConta) e vale o saldo final mais recente de um dia ANTERIOR ao dia aberto (mesma
//     regra da VanPix Extrato: numa segunda, o de sexta).
//   - Retorno de COBRANÇA (SIGCB, CAIXA): os títulos casam com a conta pelo código do
//     beneficiário. São gravados em cobranca_titulos com o "apelido" CNAB:<beneficiário> e
//     somados no saldo pela mesma regra da VanPix Cobrança (ver vanpix-sync.service.js).
// Aqui só se lê e casa; quem grava e soma é o vanpix-sync.service.js (buscarSaldosVanpix).
const pool = require('../../config/db');
const { parseRetornoCaixa, parseRetornoCobrancaCaixa, detectarTipoCnab, loteDaConta } = require('../../utils/cnab240');

const semZeros = (v) => String(v ?? '').trim().replace(/^0+/, '');
const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Chave dos títulos da cobrança manual em cobranca_titulos.apelido (a da VanPix é o apelido do
// convênio, ex.: C3U1Y8) — upsert por ela: anexar o mesmo arquivo de novo não duplica.
const chaveCobranca = (beneficiario) => `CNAB:${semZeros(beneficiario)}`;

function diaUtilAnterior(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

async function listarContasCnab(empresaId) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, nome, conta_enriquecida, digito, codigo_beneficiario,
            COALESCE(NULLIF(banco_enriquecido, ''), REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g')) AS banco
       FROM contas_bancarias_sienge
      WHERE empresa_id = $1 AND tipo_convenio = 'CNAB_MANUAL'
      ORDER BY nome`,
    [empresaId]
  );
  return rows;
}

// Quantas contas de cada integração a empresa tem — a abertura do período só mostra (e só
// consulta) as integrações que existem nas contas.
async function contarIntegracoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE tipo_convenio = 'VANPIX' AND NULLIF(codigo_cedente_extrato, '') IS NOT NULL)::int AS vanpix_extrato,
            COUNT(*) FILTER (WHERE tipo_convenio = 'VANPIX' AND NULLIF(codigo_cedente_cobranca, '') IS NOT NULL)::int AS vanpix_cobranca,
            COUNT(*) FILTER (WHERE tipo_convenio = 'ITAU')::int AS itau,
            COUNT(*) FILTER (WHERE tipo_convenio = 'CNAB_MANUAL')::int AS cnab_manual,
            COUNT(*) FILTER (WHERE tipo_convenio = 'CNAB_MANUAL' AND NULLIF(codigo_beneficiario, '') IS NOT NULL)::int AS cnab_manual_cobranca
       FROM contas_bancarias_sienge WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0];
}

const nomeConta = (c) => c.nome || c.numero_conta;

// Arquivos -> { extratos: [{nome, lotes}], cobrancas: [{nome, arquivo, titulos}], lidos, avisos }.
// O tipo vem do conteúdo (não do campo em que foi anexado): um retorno de cobrança anexado no
// campo de extrato é lido como cobrança do mesmo jeito.
function lerArquivos(arquivos) {
  const extratos = [];
  const cobrancas = [];
  const lidos = [];
  const avisos = [];
  for (const { nome, buffer } of arquivos) {
    const linhas = buffer.toString('latin1').split(/\r?\n/).filter((l) => l.trim());
    const tipo = detectarTipoCnab(linhas);
    if (tipo === 'EXTRATO') {
      const lotes = parseRetornoCaixa(linhas);
      if (!lotes.length) avisos.push(`${nome}: extrato sem saldo final de nenhuma conta.`);
      extratos.push({ nome, lotes });
      lidos.push({ nome, tipo, contas: lotes.length });
    } else if (tipo === 'COBRANCA') {
      const banco = linhas[0].slice(0, 3);
      if (banco !== '104') {
        avisos.push(`${nome}: retorno de cobrança do banco ${banco} — só o layout SIGCB da CAIXA (104) é lido.`);
        continue;
      }
      const lido = parseRetornoCobrancaCaixa(linhas);
      cobrancas.push({ nome, ...lido });
      lidos.push({ nome, tipo, beneficiario: lido.arquivo.beneficiarioCodigo, titulos: lido.titulos.length });
    } else {
      avisos.push(`${nome}: não é um arquivo de retorno CNAB 240 (extrato ou cobrança).`);
    }
  }
  return { extratos, cobrancas, lidos, avisos };
}

// Para cada conta CNAB manual, o lote com o saldo final mais recente ANTES de `data` (entre
// todos os arquivos de extrato). Devolve { encontrados: [{conta, lote}], avisos }.
function casarExtratos(contas, extratos, data) {
  const lotes = extratos.flatMap((e) => e.lotes.map((l) => ({ ...l, arquivo: e.nome })));
  const encontrados = [];
  const avisos = [];
  const ultimoDiaUtil = diaUtilAnterior(data);

  for (const conta of contas) {
    const daConta = lotes.filter((l) => loteDaConta(l, conta));
    const validos = daConta.filter((l) => l.saldoFinal?.data && l.saldoFinal.data < data);
    const lote = validos.sort((x, y) => (x.saldoFinal.data < y.saldoFinal.data ? 1 : -1))[0];
    if (lote) {
      encontrados.push({ conta, lote });
      if (lote.saldoFinal.data < ultimoDiaUtil) {
        avisos.push(`${nomeConta(conta)}: usado o saldo final de ${brData(lote.saldoFinal.data)} (${lote.arquivo}) — anterior ao último dia útil, ${brData(ultimoDiaUtil)}.`);
      }
    } else if (daConta.length) {
      const datas = [...new Set(daConta.map((l) => brData(l.saldoFinal?.data)))].join(', ');
      avisos.push(`${nomeConta(conta)}: o extrato traz o saldo final de ${datas}, que não é anterior a ${brData(data)} — não usado.`);
    }
  }

  // Contas do arquivo que não são de nenhuma conta CNAB manual (cadastro incompleto ou outro
  // tipo de convênio) — avisa uma vez por conta.
  const vistas = new Set();
  for (const l of lotes) {
    const chave = `${l.banco}|${l.conta}|${l.digitoConta}`;
    if (vistas.has(chave) || contas.some((c) => loteDaConta(l, c))) continue;
    vistas.add(chave);
    avisos.push(`${l.arquivo}: a conta ${l.conta}-${l.digitoConta} (banco ${l.banco}) não está cadastrada com convênio CNAB 240 manual (banco, conta e dígito) — saldo ignorado.`);
  }
  return { encontrados, avisos };
}

// Títulos dos retornos de cobrança agrupados pela conta do beneficiário. O código do
// beneficiário tem 6 dígitos no arquivo e o DV vem à parte (cabeçalho, posição 65): o cadastro
// pode ter o código com ou sem o DV (124207 ou 1242072).
// Devolve { porConta: Map(conta -> [{arquivo, titulos}]), avisos }.
function casarCobrancas(contas, cobrancas) {
  const comBeneficiario = contas.filter((c) => semZeros(c.codigo_beneficiario));
  const contaDoBeneficiario = (codigo, dv) =>
    comBeneficiario.find((c) => {
      const cadastro = semZeros(c.codigo_beneficiario);
      return cadastro === codigo || (dv && cadastro === `${codigo}${dv}`);
    });
  const porConta = new Map();
  const avisos = [];
  for (const { nome, arquivo, titulos } of cobrancas) {
    const semConta = new Set();
    const grupos = new Map(); // conta -> títulos deste arquivo
    for (const t of titulos) {
      const beneficiario = semZeros(t.beneficiarioCodigo || arquivo.beneficiarioCodigo);
      const conta = contaDoBeneficiario(beneficiario, arquivo.beneficiarioDv);
      if (!conta) {
        semConta.add(beneficiario ? `${beneficiario}${arquivo.beneficiarioDv ? `-${arquivo.beneficiarioDv}` : ''}` : '(vazio)');
        continue;
      }
      if (!grupos.has(conta)) grupos.set(conta, []);
      grupos.get(conta).push(t);
    }
    for (const [conta, ts] of grupos) {
      if (!porConta.has(conta)) porConta.set(conta, []);
      porConta.get(conta).push({ arquivo: { ...arquivo, nome }, titulos: ts });
    }
    for (const b of semConta) {
      avisos.push(`${nome}: beneficiário ${b} não está em nenhuma conta com convênio CNAB 240 manual — títulos ignorados.`);
    }
    if (!titulos.length) avisos.push(`${nome}: retorno de cobrança sem títulos.`);
  }
  return { porConta, avisos };
}

// Saldo CNAB já gravado no dia (abertura anterior do mesmo dia, com arquivo): reabrir o dia sem
// anexar o arquivo de novo mantém o saldo do extrato — senão ele seria apagado ou trocado pelo
// herdado. Devolve Map("company_id:numero_conta" -> composicao.extrato).
async function extratosCnabDoDia(empresaId, data) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta, composicao->'extrato' AS extrato
       FROM saldos_contas_bancarias
      WHERE empresa_id = $1 AND data = $2 AND origem = 'API' AND fonte = 'CNAB' AND composicao ? 'extrato'`,
    [empresaId, data]
  );
  return new Map(rows.map((r) => [`${r.company_id}:${r.numero_conta}`, r.extrato]));
}

module.exports = {
  chaveCobranca,
  listarContasCnab,
  contarIntegracoes,
  lerArquivos,
  casarExtratos,
  casarCobrancas,
  extratosCnabDoDia,
};
