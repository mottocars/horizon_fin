import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { History, Minus, Plus, TriangleAlert, Wallet } from 'lucide-react';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoDfc } from '../../../api/dfcOrcamento.api';
import { mesesEntre, rotuloMesCurto } from './orcamentoValores';

const LARGURA_PRIMEIRA = 360;
const LARGURA_MES = 96;
const LARGURA_TOTAL_MIN = 112;
const FOLGA = 30;
const ALTURA_MINIMA_GRADE = 320;
const RECUO = [12, 32, 56]; // máscara 1, máscara 2, conta
const SOMBRA_COLUNA_FIXA = '[&_tr>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.25)]';
const SEM_MASCARA = 'sem';

function dinheiro(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
}

// Largura (px) do texto no corpo da grade — text-xs semibold. Canvas reaproveitado.
let contextoMedida;
function larguraTexto(texto) {
  if (contextoMedida === undefined) {
    contextoMedida = document.createElement('canvas').getContext('2d');
    if (contextoMedida) contextoMedida.font = `600 12px ${getComputedStyle(document.body).fontFamily}`;
  }
  return contextoMedida ? contextoMedida.measureText(texto).width * 1.08 : texto.length * 7.5;
}

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara.
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
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

const r2 = (v) => Math.round(v * 100) / 100;

// Operações > DFC Construtoras > DFC: o fluxo de caixa (pedido do usuário). Linhas:
// 1) SALDO INICIAL — no 1º mês virá do sistema (próximo passo; por ora 0); nos demais, o Saldo Final
//    do mês anterior;
// 2) as Máscaras de nível 1 da aba Máscaras (drilldown › nível 2 › conta), com os valores PROJETADOS:
//    a última versão salva do Orçamento (todas as origens), somando os centros de custo (`centros`:
//    filtro do topo; vazio = todos). A máscara de cada conta é a do plano que o centro usa (o próprio
//    ou o Global); conta sem máscara vai pra "SEM MÁSCARA DFC";
// 3) RESULTADO — entradas − saídas (os valores já vêm com sinal: saída negativa);
// 4) SALDO FINAL — Saldo Inicial + Resultado, que vira o Saldo Inicial do mês seguinte.
// Período = o mesmo da aba Orçamentos (filtros do topo). Coluna Total: soma do período nas máscaras
// e no Resultado; Saldo Inicial do 1º mês e Saldo Final do último. Mesma grade do Orçamentos (rolagem
// própria, nome e Total congelados).
export default function DfcFluxoTab({ empresaId, inicio, fim, centros: centrosFiltro = [] }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [abertos, setAbertos] = useState([]);
  const gradeRef = useRef(null);
  const [alturaGrade, setAlturaGrade] = useState(null);
  const [rolouX, setRolouX] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    Promise.all([
      listDfcMascaras(empresaId),
      listContas(empresaId, { page: 1, limit: 2000, search: '' }),
      listTodasClassificacoesPlanoDfc(empresaId),
      getOrcamentoDfc(empresaId),
    ])
      .then(([mascaras, contas, classificacoes, orcamento]) => setDados({ mascaras, contas: contas.data, classificacoes, orcamento }))
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o fluxo de caixa.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    carregar();
  }, [carregar]);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);

  // Árvore máscara 1 › máscara 2 › conta com os valores por mês (somando os centros do filtro).
  const { estrutura, porMes } = useMemo(() => {
    if (!dados) return { estrutura: [], porMes: {} };
    const filtro = centrosFiltro.length ? new Set(centrosFiltro.map(Number)) : null;
    const mapaDe = (lista) => Object.fromEntries(lista.map((c) => [c.sienge_id, c.mascara_id]));
    const planoGlobal = mapaDe(dados.classificacoes.global);
    const planosCentro = Object.fromEntries(Object.entries(dados.classificacoes.centros).map(([id, l]) => [id, mapaDe(l)]));
    const pai = {}; // máscara 2 -> máscara 1
    dados.mascaras.forEach((g) => g.filhos.forEach((f) => (pai[f.id] = g.id)));
    const contaPorId = Object.fromEntries(dados.contas.map((c) => [c.sienge_id, c]));
    const mesesSet = new Set(meses);

    // n1 -> n2 -> conta -> mês -> valor
    const arvore = new Map();
    (dados.orcamento?.valores || []).forEach((v) => {
      if (!mesesSet.has(v.mes)) return;
      if (filtro && !filtro.has(v.centro_id)) return;
      const m2 = (planosCentro[v.centro_id] || planoGlobal)[v.sienge_id];
      const n2 = m2 && pai[m2] ? m2 : SEM_MASCARA;
      const n1 = n2 === SEM_MASCARA ? SEM_MASCARA : pai[m2];
      if (!arvore.has(n1)) arvore.set(n1, new Map());
      const nivel2 = arvore.get(n1);
      if (!nivel2.has(n2)) nivel2.set(n2, new Map());
      const contas = nivel2.get(n2);
      if (!contas.has(v.sienge_id)) contas.set(v.sienge_id, {});
      const porMesConta = contas.get(v.sienge_id);
      porMesConta[v.mes] = r2((porMesConta[v.mes] || 0) + v.valor);
    });

    const somaMeses = (listas) => {
      const total = {};
      listas.forEach((pm) => Object.entries(pm).forEach(([m, val]) => (total[m] = r2((total[m] || 0) + val))));
      return total;
    };
    const grupos = [];
    const montarN1 = (id, descricao, filhosOrdem) => {
      const nivel2 = arvore.get(id);
      if (!nivel2) return;
      const filhos = filhosOrdem
        .filter(([fid]) => nivel2.has(fid))
        .map(([fid, fdesc]) => {
          const contas = [...nivel2.get(fid).entries()]
            .map(([cid, pm]) => ({ conta: contaPorId[cid] || { sienge_id: cid, name: `Conta ${cid}` }, porMes: pm }))
            .sort((a, b) => String(a.conta.sienge_id).localeCompare(String(b.conta.sienge_id)));
          return { chave: `m${fid}`, descricao: fdesc, contas, porMes: somaMeses(contas.map((c) => c.porMes)) };
        });
      grupos.push({ chave: `m${id}`, descricao, filhos, semMascara: id === SEM_MASCARA, porMes: somaMeses(filhos.map((f) => f.porMes)) });
    };
    dados.mascaras.forEach((g) => montarN1(g.id, g.descricao, g.filhos.map((f) => [f.id, f.descricao])));
    montarN1(SEM_MASCARA, 'SEM MÁSCARA DFC', [[SEM_MASCARA, 'Contas sem Máscara DFC na aba Plano Contas']]);

    // Resultado e saldos, mês a mês. Saldo inicial do 1º mês: do sistema, num próximo passo (0 por ora).
    const resultado = somaMeses(grupos.map((g) => g.porMes));
    const saldoInicial = {};
    const saldoFinal = {};
    let saldo = 0;
    meses.forEach((m) => {
      saldoInicial[m] = r2(saldo);
      saldo = r2(saldo + (resultado[m] || 0));
      saldoFinal[m] = saldo;
    });
    return { estrutura: grupos, porMes: { resultado, saldoInicial, saldoFinal } };
  }, [dados, meses, centrosFiltro]);

  const totalPeriodo = (pm) => {
    let t = null;
    meses.forEach((m) => {
      if (pm[m] !== undefined) t = (t || 0) + pm[m];
    });
    return t === null ? null : r2(t);
  };

  // Larguras: o bastante pro maior valor de cada mês / do Total.
  const { largurasMes, larguraTotal } = useMemo(() => {
    const linhas = [porMes.saldoInicial || {}, porMes.resultado || {}, porMes.saldoFinal || {}];
    estrutura.forEach((g) => {
      linhas.push(g.porMes);
      g.filhos.forEach((f) => {
        linhas.push(f.porMes);
        f.contas.forEach((c) => linhas.push(c.porMes));
      });
    });
    const largura = (v) => (v ? larguraTexto(dinheiro(v)) : 0);
    const porMesLarg = meses.map((m) => Math.max(LARGURA_MES, Math.ceil(Math.max(0, ...linhas.map((pm) => largura(pm[m])))) + FOLGA));
    let maiorTotal = 0;
    linhas.forEach((pm) => {
      let t = 0;
      meses.forEach((m) => (t += pm[m] || 0));
      maiorTotal = Math.max(maiorTotal, largura(r2(t)));
    });
    return { largurasMes: porMesLarg, larguraTotal: Math.max(LARGURA_TOTAL_MIN, Math.ceil(maiorTotal) + FOLGA) };
  }, [estrutura, porMes, meses]);

  // A grade ocupa a altura que sobra na tela (mesma regra do Orçamentos).
  useLayoutEffect(() => {
    const el = gradeRef.current;
    if (!el) return undefined;
    const medir = () => {
      const main = el.closest('main');
      const topo = el.getBoundingClientRect().top + (main ? main.scrollTop : 0);
      const altura = Math.max(ALTURA_MINIMA_GRADE, Math.floor(window.innerHeight - topo - 44));
      setAlturaGrade((atual) => (atual === altura ? atual : altura));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });

  function alternar(chave) {
    setAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Wallet size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o fluxo de caixa.</p>
      </div>
    );
  }

  const versao = dados?.orcamento?.versao || null;
  const larguraTabela = LARGURA_PRIMEIRA + larguraTotal + largurasMes.reduce((t, l) => t + l, 0);
  const corValor = (v, forte) =>
    `${v === null || v === undefined || v === 0 ? 'text-gray-300' : v < 0 ? 'text-red-600' : 'text-gray-900'} ${forte ? 'font-semibold' : ''}`;

  // Uma linha da grade. `tipo`: 'saldo' | 'resultado' | 'n1' | 'n2' | 'conta'. `total`: o valor da
  // coluna Total (cada tipo tem a sua regra).
  function linha({ chave, tipo, rotulo, sub, pm, total, nivel = 0, podeAbrir = false, cinza = false, dica }) {
    const aberto = abertos.includes(chave);
    const destaque = tipo === 'saldo' || tipo === 'resultado';
    const fundo =
      tipo === 'saldo'
        ? 'bg-slate-100 group-hover/linha:bg-slate-200'
        : tipo === 'resultado'
          ? 'bg-gray-50 group-hover/linha:bg-gray-100'
          : tipo === 'n1'
            ? 'bg-gray-50 group-hover/linha:bg-gray-100'
            : 'bg-white group-hover/linha:bg-gray-50';
    const borda = destaque ? 'border-gray-300' : tipo === 'n1' ? 'border-gray-200' : 'border-gray-100';
    const forte = destaque || tipo === 'n1';
    return (
      <tr
        key={chave}
        onClick={() => podeAbrir && alternar(chave)}
        className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''} ${tipo === 'resultado' ? '[&>td]:border-t-2 [&>td]:border-t-gray-300' : ''}`}
      >
        <td
          className={`sticky left-0 z-10 border-b border-r border-r-gray-200 ${borda} ${fundo} ${destaque ? 'py-2.5' : tipo === 'conta' ? 'py-1.5' : 'py-2'} pr-2`}
          style={{ paddingLeft: destaque ? 16 : RECUO[nivel] }}
          title={dica}
        >
          <span className="flex min-w-0 items-center gap-2">
            {(tipo === 'n1' || tipo === 'n2') && (
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                  podeAbrir ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
                }`}
              >
                {aberto ? <Minus size={10} /> : <Plus size={10} />}
              </span>
            )}
            {sub && <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{sub}</span>}
            <span
              className={`min-w-0 truncate ${destaque ? 'text-xs font-bold uppercase tracking-wide text-gray-900' : forte ? 'text-xs font-semibold text-gray-900' : tipo === 'n2' ? 'text-xs font-medium text-gray-800' : 'text-xs text-gray-700'} ${
                cinza ? 'italic text-gray-500' : ''
              }`}
            >
              {rotulo}
            </span>
          </span>
        </td>
        <td
          className={`sticky z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 px-2 text-right tabular-nums group-hover/linha:bg-blue-100 ${
            destaque ? 'py-2.5' : 'py-1.5'
          } ${corValor(total, forte)}`}
          style={{ left: LARGURA_PRIMEIRA }}
        >
          {total === null || total === undefined || total === 0 ? '—' : dinheiro(total)}
        </td>
        {meses.map((m) => {
          const v = pm[m];
          return (
            <td key={m} className={`border-b border-l px-2 text-right tabular-nums ${borda} ${fundo} ${destaque ? 'py-2.5' : 'py-1.5'} ${corValor(v, forte)}`}>
              {v === undefined || v === null || v === 0 ? '—' : dinheiro(v)}
            </td>
          );
        })}
      </tr>
    );
  }

  const mesAtual = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  return (
    <div className="min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {dados && (
        <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
          <span className="rounded-full bg-primary-50 px-2.5 py-0.5 font-medium text-primary-700 ring-1 ring-primary-100">Projetado</span>
          <span className="flex items-center gap-1.5">
            <History size={14} className="shrink-0 text-gray-400" />
            {versao
              ? `Orçamento versão ${versao.numero} (última) · salva em ${dataHora(versao.criado_em)}${versao.usuario ? ` por ${versao.usuario}` : ''}`
              : 'Nenhuma versão salva do Orçamento — salve uma na aba Orçamentos pra ver o fluxo.'}
          </span>
          <span className="text-gray-400">Saldo inicial do primeiro mês: do sistema, num próximo passo (por ora, 0).</span>
        </div>
      )}

      {!periodoValido ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <TriangleAlert size={15} className="shrink-0" />A Data fim precisa ser igual ou depois da Data início.
        </div>
      ) : carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erro}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div
          ref={gradeRef}
          onScroll={(e) => setRolouX(e.currentTarget.scrollLeft > 0)}
          className={`overflow-auto overscroll-x-contain rounded-lg ${rolouX ? SOMBRA_COLUNA_FIXA : ''}`}
          style={{ maxHeight: alturaGrade ?? undefined }}
        >
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: larguraTabela, minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              <col style={{ width: larguraTotal }} />
              {meses.map((m, i) => (
                <col key={m} style={{ width: largurasMes[i] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Fluxo de caixa
                </th>
                <th
                  className="sticky top-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-200 bg-blue-100 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-blue-800"
                  style={{ left: LARGURA_PRIMEIRA }}
                  title="Máscaras e Resultado: soma do período. Saldo Inicial: o do 1º mês. Saldo Final: o do último."
                >
                  Total
                </th>
                {meses.map((m) => (
                  <th
                    key={m}
                    title={m === mesAtual ? 'Mês atual' : undefined}
                    className={`sticky top-0 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide ${
                      m === mesAtual ? 'bg-blue-100 font-semibold text-blue-800' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {rotuloMesCurto(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linha({
                chave: 'saldo-inicial',
                tipo: 'saldo',
                rotulo: 'Saldo inicial',
                pm: porMes.saldoInicial || {},
                total: (porMes.saldoInicial || {})[meses[0]] ?? null,
                dica: 'No 1º mês: do sistema (próximo passo — por ora 0). Nos demais: o Saldo Final do mês anterior.',
              })}
              {estrutura.length === 0 && (
                <tr>
                  <td colSpan={meses.length + 2} className="border-b border-gray-100 py-8 text-center text-sm text-gray-400">
                    {versao ? 'Nenhum valor no período.' : 'Sem valores — nenhuma versão salva do Orçamento.'}
                  </td>
                </tr>
              )}
              {estrutura.map((n1) => {
                const chaveN1 = n1.chave;
                return (
                  <Fragment key={chaveN1}>
                    {linha({
                      chave: chaveN1,
                      tipo: 'n1',
                      rotulo: n1.descricao,
                      pm: n1.porMes,
                      total: totalPeriodo(n1.porMes),
                      podeAbrir: n1.filhos.length > 0,
                      cinza: n1.semMascara,
                    })}
                    {abertos.includes(chaveN1) &&
                      n1.filhos.map((n2) => {
                        const chaveN2 = `${chaveN1}|${n2.chave}`;
                        return (
                          <Fragment key={chaveN2}>
                            {linha({
                              chave: chaveN2,
                              tipo: 'n2',
                              nivel: 1,
                              rotulo: n2.descricao,
                              pm: n2.porMes,
                              total: totalPeriodo(n2.porMes),
                              podeAbrir: n2.contas.length > 0,
                              cinza: n1.semMascara,
                            })}
                            {abertos.includes(chaveN2) &&
                              n2.contas.map((c) =>
                                linha({
                                  chave: `${chaveN2}|${c.conta.sienge_id}`,
                                  tipo: 'conta',
                                  nivel: 2,
                                  sub: c.conta.mascara_nivel_1 ? codigoFormatado(c.conta) : c.conta.sienge_id,
                                  rotulo: c.conta.name,
                                  pm: c.porMes,
                                  total: totalPeriodo(c.porMes),
                                })
                              )}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
              {linha({
                chave: 'resultado',
                tipo: 'resultado',
                rotulo: 'Resultado',
                pm: porMes.resultado || {},
                total: totalPeriodo(porMes.resultado || {}),
                dica: 'Entradas − saídas do mês.',
              })}
              {linha({
                chave: 'saldo-final',
                tipo: 'saldo',
                rotulo: 'Saldo final',
                pm: porMes.saldoFinal || {},
                total: (porMes.saldoFinal || {})[meses[meses.length - 1]] ?? null,
                dica: 'Saldo Inicial + Resultado — vira o Saldo Inicial do mês seguinte.',
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
