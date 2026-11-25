const pool = require('../../config/db');
const dfcMascaras = require('../dfc-mascaras/dfcMascaras.service');
const dfcPlanoContas = require('../dfc-plano-contas/dfcPlanoContas.service');
const dfcOrcamento = require('../dfc-orcamento/dfcOrcamento.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');
const { regrasParcela, SEM_TIPO } = require('../dfc-mascaras/regrasParcela');

// O fluxo de caixa da aba DFC montado no servidor — mesmas regras de
// frontend/src/pages/Operacoes/DfcConstrutoras/DfcFluxoTab.jsx (mudou lá, muda aqui). Usado pela
// exportação Excel (dfc-exportacao):
// - Projetado: a última versão salva do Orçamento; Realizado: o extrato das contas com "Projeta DFC"
//   achatado por rateio (dfc-saldos::realizado);
// - a máscara de cada natureza é a do plano que o centro usa (o próprio, se tiver versão, senão o
//   Global); natureza sem máscara (ou lançamento sem natureza) fica fora do fluxo;
// - árvore máscara 1 › ENTRADAS/SAÍDAS (pelo sinal) › máscara 2 › conta, valores por 'AAAA-MM|R' / 'AAAA-MM|P';
// - máscara 2 detalhada por tipo de parcela (aba Máscaras — dfc-mascaras/regrasParcela.js): abaixo dela, os
//   tipos de parcela no lugar das contas (a conta que ela assume não segue mais o plano de contas);
// - saldos: Realizado até o mês atual (saldo real); Projetado do mês atual em diante, partindo do saldo
//   real de abertura do mês atual e encadeando o resultado projetado.

const R = 'R';
const P = 'P';
const LADOS = [
  ['E', 'ENTRADAS'],
  ['S', 'SAÍDAS'],
];

const r2 = (v) => Math.round(v * 100) / 100;

function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function mesesEntre(de, ate) {
  const meses = [];
  for (let m = de; m <= ate && meses.length < 240; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

// Relógio da aplicação (o do Postgres da VPS é deslocado).
function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Mesma lógica de DfcFluxoTab.jsx::codigoFormatado (máscara do plano financeiro).
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
  if (!conta.mascara_nivel_1) return digitos;
  const segmentos = [];
  let pos = 0;
  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }
  if (pos < digitos.length && segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

// Máscaras, contas do plano financeiro e o classificador natureza × centro (× tipo de parcela) ->
// { n1, n2, folha } (null = fora do fluxo: sem natureza ou conta sem Máscara DFC no plano que o centro
// usa). `folha`: a linha abaixo da máscara 2 — a natureza (número) ou, na conta assumida por máscaras
// por tipo de parcela, 't:<tipo>' ('t:' = sem tipo).
async function classificador(empresaId) {
  const [mascaras, classificacoes, { rows: contas }, tipos] = await Promise.all([
    dfcMascaras.list(empresaId),
    dfcPlanoContas.listTodas(empresaId),
    pool.query(
      `SELECT sienge_id, name, mascara_nivel_1, mascara_nivel_2, mascara_nivel_3, mascara_nivel_4, mascara_nivel_5,
              mascara_nivel_6, mascara_nivel_7
         FROM planos_financeiros_sienge WHERE empresa_id = $1`,
      [empresaId]
    ),
    dfcMascaras.tiposParcela(empresaId),
  ]);
  const regras = regrasParcela(mascaras);
  const nomesTipo = Object.fromEntries(tipos.map((t) => [t.sigla, t.nome]));
  const mapaDe = (lista) => Object.fromEntries(lista.map((c) => [c.sienge_id, c.mascara_id]));
  const planoGlobal = mapaDe(classificacoes.global);
  const planosCentro = Object.fromEntries(Object.entries(classificacoes.centros).map(([id, l]) => [id, mapaDe(l)]));
  const pai = {}; // máscara 2 -> máscara 1
  const nomeMascara = {};
  mascaras.forEach((g) => {
    nomeMascara[g.id] = g.descricao;
    g.filhos.forEach((f) => {
      pai[f.id] = g.id;
      nomeMascara[f.id] = f.descricao;
    });
  });
  const contaPorId = new Map(contas.map((c) => [c.sienge_id, { ...c, codigo: codigoFormatado(c) }]));
  const classificar = (centroId, natureza, tipo = '') => {
    if (natureza === null || natureza === undefined) return null;
    if (regras.assumida(natureza)) {
      const n2 = regras.mascaraDe(natureza, tipo || '');
      return pai[n2] ? { n1: pai[n2], n2, folha: `t:${tipo || ''}`, tipo_parcela: tipo || '' } : null;
    }
    const n2 = (planosCentro[centroId] || planoGlobal)[natureza];
    if (!n2 || !pai[n2]) return null;
    return { n1: pai[n2], n2, folha: natureza, tipo_parcela: '' };
  };
  const conta = (siengeId) => contaPorId.get(siengeId) || { sienge_id: siengeId, name: `Natureza ${siengeId}`, codigo: String(siengeId) };
  // A linha de um tipo de parcela (folha 't:<tipo>') — mesma forma de uma conta (codigo / name), com a
  // conta assumida em sienge_id.
  const folhaTipo = (natureza, tipo) => ({
    sienge_id: natureza,
    tipo_parcela: tipo,
    codigo: tipo || '—',
    name: tipo ? nomesTipo[tipo] || tipo : SEM_TIPO,
  });
  // O centro classifica pelo plano próprio (versão, mesmo vazia) ou pelo Global.
  const planoProprio = (centroId) => Boolean(planosCentro[centroId]);
  return { mascaras, nomeMascara, classificar, conta, folhaTipo, nomesTipo, regras, planoProprio, classificacoes };
}

// `inicio` / `fim`: 'AAAA-MM'. `centros`: ids do filtro (vazio = todos).
// Versões da DFC (pedido do usuário, 25/11/2026): o realizado vai só até `realizadoAte` (o fim do mês anterior ao
// atual, ou o corte da versão lida — dfc-saldos::realizado); do mês seguinte em diante, só o Projetado, com o saldo
// partindo do saldo real de abertura desse mês. `mesAtual` continua sendo o mês de hoje (destaque das telas).
async function montar(empresaId, { inicio, fim, centros = [], versao = null }) {
  const mesAtual = mesDeHoje();
  const meses = mesesEntre(inicio, fim);
  const ultimo = meses[meses.length - 1];
  const deRealizado = inicio < mesAtual ? inicio : mesAtual;
  const [cls, orcamento, realizado] = await Promise.all([
    classificador(empresaId),
    dfcOrcamento.orcamento(empresaId, versao),
    dfcSaldos.realizado(empresaId, deRealizado, mesAtual),
  ]);
  const realizadoAte = realizado.realizado_ate;
  const primeiroProjetado = somarMeses(realizadoAte, 1);
  const colunas = meses.flatMap((m) => (m <= realizadoAte ? [{ mes: m, tipo: R }, { mes: m, tipo: P }] : [{ mes: m, tipo: P }]));
  const filtro = centros.length ? new Set(centros.map(Number)) : null;
  const mesesP = new Set([...meses, ...(ultimo && primeiroProjetado <= ultimo ? mesesEntre(primeiroProjetado, ultimo) : [])]);
  const mesesR = new Set(meses.filter((m) => m <= realizadoAte));

  // n1 -> lado -> n2 -> folha (conta ou tipo de parcela) -> 'mes|tipo' -> valor
  const arvore = new Map();
  const folhas = new Map(); // folha -> o objeto da linha (conta ou tipo de parcela)
  const lancar = (centroId, natureza, mes, tipo, valor, tipoParcela = '') => {
    if (filtro && !filtro.has(centroId)) return;
    if (!valor) return;
    const c = cls.classificar(centroId, natureza, tipoParcela);
    if (!c) return;
    const lado = valor > 0 ? 'E' : 'S';
    if (!arvore.has(c.n1)) arvore.set(c.n1, new Map());
    const lados = arvore.get(c.n1);
    if (!lados.has(lado)) lados.set(lado, new Map());
    const nivel2 = lados.get(lado);
    if (!nivel2.has(c.n2)) nivel2.set(c.n2, new Map());
    const contas = nivel2.get(c.n2);
    if (!contas.has(c.folha)) {
      contas.set(c.folha, {});
      if (!folhas.has(c.folha)) {
        folhas.set(c.folha, typeof c.folha === 'string' ? cls.folhaTipo(natureza, c.tipo_parcela) : cls.conta(natureza));
      }
    }
    const pc = contas.get(c.folha);
    const k = `${mes}|${tipo}`;
    pc[k] = r2((pc[k] || 0) + valor);
  };
  orcamento.valores.forEach((v) => mesesP.has(v.mes) && lancar(v.centro_id, v.sienge_id, v.mes, P, v.valor, v.tipo_parcela));
  realizado.valores.forEach((v) => mesesR.has(v.mes) && lancar(v.centro_id, v.sienge_id, v.mes, R, v.valor, v.tipo_parcela));

  const somar = (listas) => {
    const total = {};
    listas.forEach((pc) => Object.entries(pc).forEach(([k, val]) => (total[k] = r2((total[k] || 0) + val))));
    return total;
  };
  const estrutura = [];
  cls.mascaras.forEach((g) => {
    const lados = arvore.get(g.id);
    if (!lados) return;
    const ladosMontados = LADOS.filter(([k]) => lados.has(k)).map(([k, rotulo]) => {
      const nivel2 = lados.get(k);
      const filhos = g.filhos
        .filter((f) => nivel2.has(f.id))
        .map((f) => {
          // Contas pelo código; tipos de parcela na ordem escolhida na máscara, os outros depois e o
          // "sem tipo" por último.
          const ordemTipo = (c) => {
            if (c.tipo_parcela === undefined) return [0, String(c.sienge_id)];
            const i = (f.parcela_tipos || []).indexOf(c.tipo_parcela);
            return [c.tipo_parcela ? (i >= 0 ? i : 500) : 999, c.tipo_parcela];
          };
          const contas = [...nivel2.get(f.id).entries()]
            .map(([folha, pc]) => ({ conta: folhas.get(folha), porColuna: pc }))
            .sort((a, b) => {
              const [oa, ta] = ordemTipo(a.conta);
              const [ob, tb] = ordemTipo(b.conta);
              return oa - ob || String(ta).localeCompare(String(tb));
            });
          return { id: f.id, descricao: f.descricao, contas, porColuna: somar(contas.map((c) => c.porColuna)) };
        });
      return { chave: k, descricao: rotulo, filhos, porColuna: somar(filhos.map((f) => f.porColuna)) };
    });
    estrutura.push({ id: g.id, descricao: g.descricao, lados: ladosMontados, porColuna: somar(ladosMontados.map((l) => l.porColuna)) });
  });

  const resultado = somar(estrutura.map((g) => g.porColuna));
  const saldoReal = realizado.saldos || {};
  const saldoInicial = {};
  const saldoFinal = {};
  // Realizado: todo mês com realizado está fechado — saldo final = saldo real de abertura do mês seguinte.
  meses
    .filter((m) => m <= realizadoAte)
    .forEach((m) => {
      const ini = saldoReal[m] ?? 0;
      saldoInicial[`${m}|${R}`] = ini;
      saldoFinal[`${m}|${R}`] = saldoReal[somarMeses(m, 1)] ?? r2(ini + (resultado[`${m}|${R}`] || 0));
    });
  if (ultimo && primeiroProjetado <= ultimo) {
    let saldo = saldoReal[primeiroProjetado] ?? 0;
    mesesEntre(primeiroProjetado, ultimo).forEach((m) => {
      saldoInicial[`${m}|${P}`] = r2(saldo);
      saldo = r2(saldo + (resultado[`${m}|${P}`] || 0));
      saldoFinal[`${m}|${P}`] = saldo;
    });
  }

  return {
    mesAtual,
    realizadoAte,
    meses,
    colunas,
    estrutura,
    porColuna: { resultado, saldoInicial, saldoFinal },
    versao: orcamento.versao,
    orcamento: orcamento.valores,
    extratoAte: realizado.extrato_ate,
    classificador: cls,
    filtro,
  };
}

module.exports = { montar, classificador, mesesEntre, somarMeses, mesDeHoje, R, P };
