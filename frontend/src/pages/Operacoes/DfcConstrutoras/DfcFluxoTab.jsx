import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, History, Info, TriangleAlert, Wallet } from 'lucide-react';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoDfc } from '../../../api/dfcOrcamento.api';
import { mesesEntre } from './orcamentoValores';

const LARGURA_PRIMEIRA = 340;
const LARGURA_MES = 104;
const FOLGA = 36;
const ALTURA_MINIMA_GRADE = 320;
const RECUO = [16, 40, 64]; // máscara 1, máscara 2, conta
const SOMBRA_COLUNA_FIXA = '[&_tr>*:first-child]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)]';
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
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
// Período = o mesmo da aba Orçamentos (filtros do topo). Visual de demonstrativo (é o fluxo de caixa
// oficial — pedido do usuário): sem coluna de total, sem linhas verticais, zero em branco, saldos em
// faixas discretas; rolagem própria com a primeira coluna congelada, como no Orçamentos.
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

  // Larguras: o bastante pro maior valor de cada mês.
  const largurasMes = useMemo(() => {
    const linhas = [porMes.saldoInicial || {}, porMes.resultado || {}, porMes.saldoFinal || {}];
    estrutura.forEach((g) => {
      linhas.push(g.porMes);
      g.filhos.forEach((f) => {
        linhas.push(f.porMes);
        f.contas.forEach((c) => linhas.push(c.porMes));
      });
    });
    const largura = (v) => (v ? larguraTexto(dinheiro(v)) : 0);
    return meses.map((m) => Math.max(LARGURA_MES, Math.ceil(Math.max(0, ...linhas.map((pm) => largura(pm[m])))) + FOLGA));
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
  const larguraTabela = LARGURA_PRIMEIRA + largurasMes.reduce((t, l) => t + l, 0);
  const mesAtual = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  // Estilo de cada tipo de linha (a primeira coluna é congelada, então o fundo é sempre sólido).
  const ESTILO = {
    saldo: { fundo: 'bg-slate-50', texto: 'text-[13px] font-semibold text-slate-900', py: 'py-3', borda: 'border-slate-200' },
    resultado: { fundo: 'bg-white', texto: 'text-[13px] font-semibold text-gray-900', py: 'py-3', borda: 'border-gray-200' },
    n1: { fundo: 'bg-white', texto: 'text-[13px] font-semibold text-gray-900', py: 'py-2.5', borda: 'border-gray-100' },
    n2: { fundo: 'bg-white', texto: 'text-xs text-gray-700', py: 'py-2', borda: 'border-gray-100' },
    conta: { fundo: 'bg-white', texto: 'text-xs text-gray-500', py: 'py-1.5', borda: 'border-gray-100' },
  };
  const corValor = (v) => (v < 0 ? 'text-rose-600' : 'text-gray-900');

  // Uma linha da grade. `tipo`: 'saldo' | 'resultado' | 'n1' | 'n2' | 'conta'.
  function linha({ chave, tipo, rotulo, sub, pm, nivel = 0, podeAbrir = false, cinza = false, dica, separar = false }) {
    const aberto = abertos.includes(chave);
    const e = ESTILO[tipo];
    const numeros = tipo === 'saldo' || tipo === 'resultado' || tipo === 'n1' ? 'font-semibold' : tipo === 'conta' ? 'text-gray-600' : '';
    return (
      <tr
        key={chave}
        onClick={() => podeAbrir && alternar(chave)}
        className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''} ${separar ? '[&>td]:border-t [&>td]:border-t-gray-300' : ''}`}
      >
        <td
          className={`sticky left-0 z-10 border-b ${e.borda} ${e.fundo} ${e.py} pr-3 transition-colors ${
            tipo === 'saldo' ? '' : 'group-hover/linha:bg-gray-50'
          }`}
          style={{ paddingLeft: tipo === 'saldo' || tipo === 'resultado' ? 20 : RECUO[nivel] }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {(tipo === 'n1' || tipo === 'n2') && (
              <ChevronRight
                size={14}
                className={`shrink-0 transition-transform ${aberto ? 'rotate-90' : ''} ${podeAbrir ? 'text-gray-400' : 'text-gray-200'}`}
              />
            )}
            {sub && <span className="shrink-0 font-mono text-[11px] text-gray-400">{sub}</span>}
            <span className={`min-w-0 truncate ${e.texto} ${cinza ? 'italic text-gray-400' : ''}`}>{rotulo}</span>
            {dica && (
              <span title={dica} className="shrink-0 text-slate-400">
                <Info size={13} />
              </span>
            )}
          </span>
        </td>
        {meses.map((m) => {
          const v = pm[m];
          const vazio = v === undefined || v === null || v === 0;
          return (
            <td
              key={m}
              className={`border-b px-3 text-right tabular-nums transition-colors ${e.borda} ${e.fundo} ${e.py} ${
                tipo === 'saldo' ? '' : 'group-hover/linha:bg-gray-50'
              } ${tipo === 'saldo' || tipo === 'resultado' ? 'text-[13px]' : 'text-xs'} ${numeros} ${vazio ? '' : corValor(v)}`}
            >
              {vazio ? '' : dinheiro(v)}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className="min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {dados && (
        <div className="-mt-1 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-0.5 font-medium text-primary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            Projetado
          </span>
          <span className="flex items-center gap-1.5">
            <History size={13} className="shrink-0 text-gray-400" />
            {versao
              ? `Orçamento versão ${versao.numero} · ${dataHora(versao.criado_em)}${versao.usuario ? ` · ${versao.usuario}` : ''}`
              : 'Nenhuma versão salva do Orçamento — salve uma na aba Orçamentos pra ver o fluxo.'}
          </span>
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
          className={`overflow-auto overscroll-x-contain rounded-lg border border-gray-200 ${rolouX ? SOMBRA_COLUNA_FIXA : ''}`}
          style={{ maxHeight: alturaGrade ?? undefined }}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ tableLayout: 'fixed', width: larguraTabela, minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {meses.map((m, i) => (
                <col key={m} style={{ width: largurasMes[i] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-white py-3 pl-5 pr-3 align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Fluxo de caixa
                </th>
                {meses.map((m) => {
                  const atual = m === mesAtual;
                  return (
                    <th
                      key={m}
                      title={atual ? 'Mês atual' : undefined}
                      className={`sticky top-0 z-20 border-b bg-white px-3 py-2 text-right align-bottom ${
                        atual ? 'border-b-2 border-b-primary-500' : 'border-gray-200'
                      }`}
                    >
                      <span className={`block text-[11px] font-semibold tracking-wider ${atual ? 'text-primary-700' : 'text-gray-600'}`}>
                        {MESES_CAB[Number(m.slice(5, 7)) - 1]}
                      </span>
                      <span className="block text-[10px] font-medium text-gray-400">{m.slice(0, 4)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linha({
                chave: 'saldo-inicial',
                tipo: 'saldo',
                rotulo: 'Saldo inicial',
                pm: porMes.saldoInicial || {},
                dica: 'No 1º mês virá do sistema (próximo passo — por ora, 0). Nos demais, é o Saldo Final do mês anterior.',
              })}
              {estrutura.length === 0 && (
                <tr>
                  <td colSpan={meses.length + 1} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
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
                rotulo: 'Resultado do mês',
                pm: porMes.resultado || {},
                separar: true,
              })}
              {linha({
                chave: 'saldo-final',
                tipo: 'saldo',
                rotulo: 'Saldo final',
                pm: porMes.saldoFinal || {},
                dica: 'Saldo Inicial + Resultado — vira o Saldo Inicial do mês seguinte.',
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
