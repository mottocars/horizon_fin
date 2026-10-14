import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';

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

const LARGURA_PRIMEIRA = 360;
const LARGURA_MES = 92;
const RECUO = [12, 32, 52, 76]; // padding-left de cada nível (centro, máscara 1, máscara 2, conta)

// Operações > DFC Construtoras > Orçamentos: o orçamento é por centro de custo e conta do plano de
// contas, projetado a partir dos Parâmetros. Por enquanto só a estrutura (pedido do usuário):
// drilldown Centro de Custo › Máscara Nível 1 › Máscara Nível 2 › Conta analítica (a do plano de
// contas classificada com aquela máscara na aba Plano Contas), colunas = meses do período do topo.
// Centros = todos com "Projeta DFC" (obras e administrativos). Contas analíticas sem Máscara DFC
// entram num grupo "SEM MÁSCARA DFC" pra não sumirem. Começa tudo fechado.
export default function DfcOrcamentosTab({ empresaId, inicio, fim }) {
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
      listClassificacoesPlanoDfc(empresaId),
    ])
      .then(([centros, mascaras, contas, classificacoes]) =>
        setDados({ centros, mascaras, contas: contas.data, classificacoes })
      )
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o orçamento.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    carregar();
  }, [carregar]);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);

  // A mesma estrutura de máscaras vale pra todos os centros (o plano de contas é da empresa).
  const { centros, estrutura } = useMemo(() => {
    if (!dados) return { centros: [], estrutura: [] };
    const mascaraDaConta = Object.fromEntries(dados.classificacoes.map((c) => [c.sienge_id, c.mascara_id]));
    const analiticas = [...dados.contas]
      .filter((c) => c.tp_conta !== 'T')
      .sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
    const idsNivel2 = new Set(dados.mascaras.flatMap((g) => g.filhos.map((f) => f.id)));
    const grupos = dados.mascaras.map((g) => ({
      chave: `m${g.id}`,
      descricao: g.descricao,
      filhos: g.filhos.map((f) => ({
        chave: `m${f.id}`,
        descricao: f.descricao,
        contas: analiticas.filter((c) => mascaraDaConta[c.sienge_id] === f.id),
      })),
    }));
    const semMascara = analiticas.filter((c) => !idsNivel2.has(mascaraDaConta[c.sienge_id]));
    if (semMascara.length) {
      grupos.push({
        chave: 'sem',
        descricao: 'SEM MÁSCARA DFC',
        semMascara: true,
        filhos: [{ chave: 'sem2', descricao: 'Contas sem Máscara DFC na aba Plano Contas', contas: semMascara }],
      });
    }
    return {
      centros: dados.centros.filter((c) => c.projeta_dfc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      estrutura: grupos,
    };
  }, [dados]);

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

  // Células de valor: ainda sem projeção — só a estrutura por enquanto.
  const celulas = (nivel) =>
    meses.map((m) => (
      <td
        key={m}
        className={`border-b border-l px-2 text-right tabular-nums text-gray-300 ${
          nivel === 0 ? 'border-gray-200 bg-gray-50 py-2 group-hover/linha:bg-gray-100' : 'border-gray-100 bg-white py-1.5 group-hover/linha:bg-gray-50'
        }`}
      >
        —
      </td>
    ));

  // Linha de agrupamento (centro, máscara 1, máscara 2) — função comum, não componente, pra não
  // ser recriada a cada render.
  function linhaGrupo({ chave, nivel, rotulo, contagem, podeAbrir, destaque = false, cinza = false }) {
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
              title={rotulo}
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
        {celulas(nivel)}
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
                return (
                  <Fragment key={chaveCentro}>
                    {linhaGrupo({ chave: chaveCentro, nivel: 0, rotulo: `${centro.name}${centro.natureza === 'ADMINISTRATIVO' ? ' (Administrativo)' : ''}`, podeAbrir: estrutura.length > 0, destaque: true })}
                    {abertos.includes(chaveCentro) &&
                      estrutura.map((n1) => {
                        const chaveN1 = `${chaveCentro}|${n1.chave}`;
                        return (
                          <Fragment key={chaveN1}>
                            {linhaGrupo({ chave: chaveN1, nivel: 1, rotulo: n1.descricao, contagem: n1.filhos.length, podeAbrir: n1.filhos.length > 0, destaque: true, cinza: n1.semMascara })}
                            {abertos.includes(chaveN1) &&
                              n1.filhos.map((n2) => {
                                const chaveN2 = `${chaveN1}|${n2.chave}`;
                                return (
                                  <Fragment key={chaveN2}>
                                    {linhaGrupo({ chave: chaveN2, nivel: 2, rotulo: n2.descricao, contagem: n2.contas.length, podeAbrir: n2.contas.length > 0, cinza: n1.semMascara })}
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
                                          {celulas(3)}
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
