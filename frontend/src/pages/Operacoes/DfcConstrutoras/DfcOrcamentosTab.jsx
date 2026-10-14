import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoProjecaoCef } from '../../../api/dfcProjecaoCef.api';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

// 'AAAA-MM' de cada mês entre as duas datas ('AAAA-MM-DD'), inclusive.
function mesesEntre(inicio, fim) {
  const meses = [];
  let [ano, mes] = inicio.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = fim.slice(0, 7).split('-').map(Number);
  while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && meses.length < 240) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara (duplicada aqui de
// propósito — telas não importam umas das outras nesse projeto).
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

function dinheiro(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LARGURA_PRIMEIRA = 360;
const LARGURA_MES = 92;
const RECUO = [12, 32, 52, 76]; // padding-left de cada nível (centro, máscara 1, máscara 2, conta)

// Operações > DFC Construtoras > Orçamentos: o orçamento é por centro de custo e conta do plano de
// contas, projetado a partir dos Parâmetros. Valores por enquanto: a Projeção CEF (janela
// "Projeções" no topo — backend dfc-projecao-cef), que cai nas contas com Origem Projeção CEF_*;
// os níveis acima somam os de baixo. Estrutura:
// drilldown Centro de Custo › Máscara Nível 1 › Máscara Nível 2 › Conta analítica (a do plano de
// contas classificada com aquela máscara na aba Plano Contas), colunas = meses do período do topo.
// Centros = todos com "Projeta DFC" (obras e administrativos). Contas analíticas sem Máscara DFC
// entram num grupo "SEM MÁSCARA DFC" pra não sumirem; as com "Projeta DFC" desmarcado no plano do
// centro não entram (pedido do usuário). Começa tudo fechado.
export default function DfcOrcamentosTab({ empresaId, inicio, fim, refreshToken = 0 }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    Promise.all([
      listCentrosCustoDfc(empresaId),
      listDfcMascaras(empresaId),
      listContas(empresaId, { page: 1, limit: 2000, search: '' }),
      listTodasClassificacoesPlanoDfc(empresaId),
      getOrcamentoProjecaoCef(empresaId),
    ])
      .then(([centros, mascaras, contas, classificacoes, projecao]) =>
        setDados({ centros, mascaras, contas: contas.data, classificacoes, projecao })
      )
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o orçamento.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
  }, [empresaId]);

  // Recarrega também depois de "Atualizar Projeção CEF" (refreshToken), mantendo o que está aberto.
  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);

  // Estrutura (máscara 1 > máscara 2 > contas) de cada plano: o Global e a versão própria de cada
  // centro que tem uma (aba Plano Contas) — o centro com versão própria usa a dele, os demais o Global.
  const { centros, planoGlobal, planosCentro } = useMemo(() => {
    if (!dados) return { centros: [], planoGlobal: { estrutura: [], todasContas: [] }, planosCentro: {} };
    const analiticas = [...dados.contas]
      .filter((c) => c.tp_conta !== 'T')
      .sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
    const idsNivel2 = new Set(dados.mascaras.flatMap((g) => g.filhos.map((f) => f.id)));

    function montar(classificacoes) {
      const mascaraDaConta = Object.fromEntries(classificacoes.map((c) => [c.sienge_id, c.mascara_id]));
      // "Projeta DFC" desmarcado no plano: a conta fica fora do Orçamento. Sem linha = marcado.
      const foraDoDfc = new Set(classificacoes.filter((c) => c.projeta_dfc === false).map((c) => c.sienge_id));
      const contasDoPlano = analiticas.filter((c) => !foraDoDfc.has(c.sienge_id));
      const grupos = dados.mascaras.map((g) => ({
        chave: `m${g.id}`,
        descricao: g.descricao,
        filhos: g.filhos.map((f) => ({
          chave: `m${f.id}`,
          descricao: f.descricao,
          contas: contasDoPlano.filter((c) => mascaraDaConta[c.sienge_id] === f.id),
        })),
      }));
      const semMascara = contasDoPlano.filter((c) => !idsNivel2.has(mascaraDaConta[c.sienge_id]));
      if (semMascara.length) {
        grupos.push({
          chave: 'sem',
          descricao: 'SEM MÁSCARA DFC',
          semMascara: true,
          filhos: [{ chave: 'sem2', descricao: 'Contas sem Máscara DFC na aba Plano Contas', contas: semMascara }],
        });
      }
      grupos.forEach((g) => {
        g.contas = g.filhos.flatMap((f) => f.contas);
      });
      return { estrutura: grupos, todasContas: grupos.flatMap((g) => g.contas) };
    }

    return {
      centros: dados.centros.filter((c) => c.projeta_dfc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      planoGlobal: montar(dados.classificacoes.global),
      planosCentro: Object.fromEntries(
        Object.entries(dados.classificacoes.centros).map(([id, lista]) => [id, { ...montar(lista), propria: true }])
      ),
    };
  }, [dados]);

  // Valores da projeção: centro -> conta -> mês -> valor; e quando cada obra foi projetada.
  const { valorConta, execucaoPorCentro } = useMemo(() => {
    const mapa = new Map();
    (dados?.projecao?.valores || []).forEach((v) => mapa.set(`${v.sienge_id}|${v.conta}|${v.mes}`, v.valor));
    return {
      valorConta: (sid, conta, mes) => mapa.get(`${sid}|${conta}|${mes}`) ?? null,
      execucaoPorCentro: Object.fromEntries((dados?.projecao?.execucoes || []).map((e) => [e.sienge_id, e])),
    };
  }, [dados]);

  // Soma de várias contas num mês (null quando nenhuma tem valor).
  function somaContas(sid, contas, mes) {
    let total = null;
    contas.forEach((c) => {
      const v = valorConta(sid, c.sienge_id, mes);
      if (v !== null) total = (total || 0) + v;
    });
    return total === null ? null : Math.round(total * 100) / 100;
  }

  function alternar(chave) {
    setAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Calculator size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o orçamento.</p>
      </div>
    );
  }

  // Células de valor do mês (`valorMes(m)` -> número ou null). Saída (negativo) em vermelho.
  const celulas = (nivel, valorMes) =>
    meses.map((m) => {
      const v = valorMes ? valorMes(m) : null;
      const vazio = v === null || v === 0;
      return (
        <td
          key={m}
          className={`border-b border-l px-2 text-right tabular-nums ${
            nivel === 0 ? 'border-gray-200 bg-gray-50 py-2 group-hover/linha:bg-gray-100' : 'border-gray-100 bg-white py-1.5 group-hover/linha:bg-gray-50'
          } ${vazio ? 'text-gray-300' : v < 0 ? 'text-red-600' : 'text-gray-800'} ${nivel <= 1 && !vazio ? 'font-semibold' : ''}`}
        >
          {vazio ? '—' : dinheiro(v)}
        </td>
      );
    });

  // Linha de agrupamento (centro, máscara 1, máscara 2) — função comum, não componente, pra não
  // ser recriada a cada render.
  function linhaGrupo({ chave, nivel, rotulo, contagem, podeAbrir, destaque = false, cinza = false, valorMes, dica }) {
    const aberto = abertos.includes(chave);
    return (
      <tr onClick={() => podeAbrir && alternar(chave)} className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''}`}>
        <td
          className={`sticky left-0 z-10 border-b border-r py-2 pr-2 ${
            nivel === 0
              ? 'border-gray-200 bg-gray-50 group-hover/linha:bg-gray-100'
              : 'border-gray-100 border-r-gray-200 bg-white group-hover/linha:bg-gray-50'
          }`}
          style={{ paddingLeft: RECUO[nivel] }}
        >
          <span className="flex items-center gap-2">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                podeAbrir ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
              }`}
            >
              {aberto ? <Minus size={10} /> : <Plus size={10} />}
            </span>
            <span
              className={`min-w-0 truncate text-xs ${destaque ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'} ${
                cinza ? 'italic text-gray-500' : ''
              }`}
              title={dica || rotulo}
            >
              {rotulo}
            </span>
            {contagem !== undefined && (
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                {contagem}
              </span>
            )}
          </span>
        </td>
        {celulas(nivel, valorMes)}
      </tr>
    );
  }

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (e a página rola na
    // horizontal) em vez de a tabela vazar pra fora dele.
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {!periodoValido ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <TriangleAlert size={15} className="shrink-0" />A Data fim precisa ser igual ou depois da Data início.
        </div>
      ) : carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        // Sem wrapper com overflow próprio (mesmo motivo do Espião NFe / NFSe): o cabeçalho gruda no
        // topo da página ao rolar. -top-6 cancela o p-6 do <main>.
        <div>
          {(dados?.projecao?.avisos || []).length > 0 && (
            <div className="mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {dados.projecao.avisos.map((a) => (
                <p key={a} className="flex items-start gap-1.5">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  {a}
                </p>
              ))}
            </div>
          )}
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LARGURA_PRIMEIRA + meses.length * LARGURA_MES }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {meses.map((m) => (
                <col key={m} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky -top-6 left-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Máscara / Conta
                </th>
                {meses.map((m) => (
                  <th
                    key={m}
                    className="sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-50 px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-blue-700"
                  >
                    {rotuloMes(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centros.length === 0 && (
                <tr>
                  <td colSpan={meses.length + 1} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    Nenhum centro de custo com &quot;Projeta DFC&quot; marcado. Marque na aba Centros Custos.
                  </td>
                </tr>
              )}
              {centros.map((centro) => {
                const chaveCentro = `c${centro.sienge_id}`;
                const { estrutura, todasContas, propria } = planosCentro[centro.sienge_id] || planoGlobal;
                return (
                  <Fragment key={chaveCentro}>
                    {linhaGrupo({
                      chave: chaveCentro,
                      nivel: 0,
                      rotulo: `${centro.name}${propria ? ' · plano próprio' : ''}`,
                      podeAbrir: estrutura.length > 0,
                      destaque: true,
                      valorMes: (m) => somaContas(centro.sienge_id, todasContas, m),
                      dica: execucaoPorCentro[centro.sienge_id]
                        ? `Projeção CEF atualizada em ${new Date(execucaoPorCentro[centro.sienge_id].atualizado_em).toLocaleString('pt-BR')} (Parâmetros v${execucaoPorCentro[centro.sienge_id].versao_parametros})`
                        : undefined,
                    })}
                    {abertos.includes(chaveCentro) &&
                      estrutura.map((n1) => {
                        const chaveN1 = `${chaveCentro}|${n1.chave}`;
                        return (
                          <Fragment key={chaveN1}>
                            {linhaGrupo({
                              chave: chaveN1,
                              nivel: 1,
                              rotulo: n1.descricao,
                              contagem: n1.filhos.length,
                              podeAbrir: n1.filhos.length > 0,
                              destaque: true,
                              cinza: n1.semMascara,
                              valorMes: (m) => somaContas(centro.sienge_id, n1.contas, m),
                            })}
                            {abertos.includes(chaveN1) &&
                              n1.filhos.map((n2) => {
                                const chaveN2 = `${chaveN1}|${n2.chave}`;
                                return (
                                  <Fragment key={chaveN2}>
                                    {linhaGrupo({
                                      chave: chaveN2,
                                      nivel: 2,
                                      rotulo: n2.descricao,
                                      contagem: n2.contas.length,
                                      podeAbrir: n2.contas.length > 0,
                                      cinza: n1.semMascara,
                                      valorMes: (m) => somaContas(centro.sienge_id, n2.contas, m),
                                    })}
                                    {abertos.includes(chaveN2) &&
                                      n2.contas.map((conta) => (
                                        <tr key={`${chaveN2}|${conta.sienge_id}`} className="group/linha">
                                          <td
                                            className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pr-3 group-hover/linha:bg-gray-50"
                                            style={{ paddingLeft: RECUO[3] }}
                                          >
                                            <span className="flex min-w-0 items-center gap-2">
                                              <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                                                {codigoFormatado(conta)}
                                              </span>
                                              <span className="min-w-0 truncate text-xs text-gray-700" title={conta.name}>
                                                {conta.name}
                                              </span>
                                            </span>
                                          </td>
                                          {celulas(3, (m) => valorConta(centro.sienge_id, conta.sienge_id, m))}
                                        </tr>
                                      ))}
                                  </Fragment>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
