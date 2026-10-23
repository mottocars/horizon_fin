import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Minus, PieChart, Plus, TriangleAlert } from 'lucide-react';
import { listarFracaoIdeal, sincronizarFracaoIdeal, statusSincronizacaoFracaoIdeal } from '../../../api/dreFracaoIdeal.api';
import { statusConfig } from '../../../utils/statusUnidade';
import iconSienge from '../../../assets/integracoes/sienge.svg';
import AtualizacaoLogModal from '../RepassesCef/AtualizacaoLogModal';

const LARGURA_PRIMEIRA = 260;

// Colunas depois do nome: largura fixa das de texto; as numéricas dividem o resto.
const COLUNAS = [
  { chave: 'property_type', rotulo: 'Tipo', largura: 140 },
  { chave: 'floor', rotulo: 'Andar', largura: 120 },
  { chave: 'commercial_stock', rotulo: 'Estoque', largura: 150 },
  { chave: 'private_area', rotulo: 'Área privativa (m²)', numero: true, casas: 2, soma: true },
  { chave: 'common_area', rotulo: 'Área comum (m²)', numero: true, casas: 2, soma: true },
  { chave: 'ideal_fraction', rotulo: 'Fração ideal', numero: true, casas: 8, soma: true, destaque: true },
  { chave: 'ideal_fraction_square_meter', rotulo: 'Fração ideal (m²)', numero: true, casas: 8, soma: true },
];
const LARGURA_NUMERO = 130;

function numero(valor, casas) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dataHora(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
}

// Mesma regra de RepassesCefPage.jsx: falta de integração não é erro, é "não integrado" no log.
function ehErroDeIntegracaoAusente(mensagem) {
  return /não possui uma integração .* ativa configurada/i.test(mensagem || '');
}

// Operações > DRE Gerencial > Fração Ideal: as unidades dos empreendimentos (/units do Sienge,
// guardadas em sie_units), no layout da tabela da aba Avanços da DFC (DfcAvancosTab.jsx) —
// cabeçalho azul grudado no topo, primeira coluna fixa. Nível 1 = o centro de custo (só os com
// "Realiza DRE"), com a quantidade de unidades e as somas de área e de fração ideal; nível 2 = as
// unidades. Vários abertos ao mesmo tempo.
//
// A atualização a partir do Sienge segue a dos contratos do Repasses CEF (RepassesCefPage.jsx::
// handleAtualizar): o POST busca tudo paginado (200 por página) e substitui o que estava salvo,
// enquanto a tela consulta o andamento a cada 0,7 s pra desenhar a barra no Log de Atualização
// (mesmo AtualizacaoLogModal). `ref` expõe `atualizar()` pro botão do topo da página (onAtualizando
// avisa a página pra girar o ícone).
const FracaoIdealTab = forwardRef(function FracaoIdealTab({ empresaId, search = '', onAtualizando }, ref) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logAberto, setLogAberto] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setDados(null);
      return Promise.resolve();
    }
    setCarregando(true);
    setErroCarga('');
    return listarFracaoIdeal(empresaId)
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as unidades.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setAbertos([]);
    carregar();
  }, [carregar]);

  async function atualizar() {
    if (!empresaId) return;
    onAtualizando?.(true);
    setLogs([{ chave: 'sienge', logo: iconSienge, integracaoNome: 'Sienge — Unidades', status: 'carregando' }]);
    setLogAberto(true);

    const intervaloProgresso = setInterval(() => {
      statusSincronizacaoFracaoIdeal(empresaId)
        .then((status) => {
          setLogs((prev) =>
            prev.map((log) => {
              if (log.status !== 'carregando') return log;
              const p = status[log.chave];
              return p ? { ...log, paginaAtual: p.paginaAtual, totalPaginas: p.totalPaginas } : log;
            })
          );
        })
        .catch(() => {});
    }, 700);

    try {
      const resultado = await sincronizarFracaoIdeal(empresaId);
      setLogs((prev) => prev.map((log) => ({ ...log, status: 'sucesso', total: resultado.total_importado, paginaAtual: undefined })));
    } catch (err) {
      const mensagem = err.response?.data?.message || 'Não foi possível sincronizar.';
      setLogs((prev) =>
        prev.map((log) => ({
          ...log,
          status: ehErroDeIntegracaoAusente(mensagem) ? 'nao_integrado' : 'erro',
          mensagem,
          paginaAtual: undefined,
        }))
      );
    } finally {
      clearInterval(intervaloProgresso);
    }
    await carregar();
    onAtualizando?.(false);
  }

  useImperativeHandle(ref, () => ({ atualizar }));

  // Agrupa por centro, com as unidades em ordem natural de nome (101, 102… 1001) e as somas.
  const grupos = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const mapa = new Map();
    (dados?.unidades || []).forEach((u) => {
      const bate =
        !termo ||
        (u.name || '').toLowerCase().includes(termo) ||
        (u.enterprise_name || '').toLowerCase().includes(termo) ||
        String(u.enterprise_id).includes(termo);
      if (!bate) return;
      if (!mapa.has(u.enterprise_id)) mapa.set(u.enterprise_id, { id: u.enterprise_id, nome: u.enterprise_name, unidades: [] });
      mapa.get(u.enterprise_id).unidades.push(u);
    });
    return [...mapa.values()]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((g) => ({
        ...g,
        unidades: g.unidades.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true })),
        somas: Object.fromEntries(
          COLUNAS.filter((c) => c.soma).map((c) => [c.chave, g.unidades.reduce((t, u) => t + Number(u[c.chave] || 0), 0)])
        ),
      }));
  }, [dados, search]);

  function alternar(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <PieChart size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as unidades.</p>
      </div>
    );
  }

  const totalColunas = 1 + COLUNAS.length;
  const semNada = dados && dados.unidades.length === 0;

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (mesmo esquema da
    // aba Avanços da DFC).
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <AtualizacaoLogModal open={logAberto} onClose={() => setLogAberto(false)} logs={logs} />

      {dados?.ultima_atualizacao && (
        <div className="-mt-1 mb-3 flex justify-end text-xs text-gray-400">
          Atualizado do Sienge em {dataHora(dados.ultima_atualizacao)}
        </div>
      )}

      {carregando && !dados ? (
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
        // Sem wrapper com overflow próprio (mesmo motivo da aba Avanços): o cabeçalho gruda no topo
        // da página ao rolar. -top-6 cancela o p-6 do <main>.
        <div>
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              minWidth: LARGURA_PRIMEIRA + COLUNAS.reduce((t, c) => t + (c.largura || LARGURA_NUMERO), 0),
            }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {COLUNAS.map((c) => (
                <col key={c.chave} style={c.largura ? { width: c.largura } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky -top-6 left-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Unidade
                </th>
                {COLUNAS.map((c) => (
                  <th
                    key={c.chave}
                    className={`sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 px-2 py-2.5 text-xs uppercase tracking-wide ${
                      c.numero ? 'text-right' : 'text-left'
                    } ${c.destaque ? 'bg-blue-100 font-semibold text-blue-800' : 'bg-blue-50 font-medium text-blue-700'}`}
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(semNada || grupos.length === 0) && (
                <tr>
                  <td colSpan={totalColunas} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    {semNada
                      ? 'Nenhuma unidade de centro com "Realiza DRE". Atualize do Sienge (ícone acima) ou marque os centros na aba Centros Custos.'
                      : 'Nenhuma unidade encontrada para essa busca.'}
                  </td>
                </tr>
              )}
              {grupos.map((g) => {
                const aberto = abertos.includes(g.id) || Boolean(search.trim());
                return (
                  <Fragment key={g.id}>
                    {/* Nível 1: o centro, com as somas */}
                    <tr onClick={() => alternar(g.id)} className="group/obra cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/obra:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-900" title={g.nome}>
                              {g.nome}
                            </span>
                            <span className="block truncate text-[10px] text-gray-400">
                              {g.unidades.length} {g.unidades.length === 1 ? 'unidade' : 'unidades'}
                            </span>
                          </span>
                        </span>
                      </td>
                      {COLUNAS.map((c) => (
                        <td
                          key={c.chave}
                          className={`border-b border-l px-2 text-right text-xs font-semibold tabular-nums ${
                            c.destaque
                              ? 'border-blue-100 bg-blue-50 text-blue-700 group-hover/obra:bg-blue-100'
                              : 'border-gray-200 bg-gray-50 text-gray-900 group-hover/obra:bg-gray-100'
                          }`}
                        >
                          {c.soma ? numero(g.somas[c.chave], c.casas) : ''}
                        </td>
                      ))}
                    </tr>

                    {/* Nível 2: as unidades */}
                    {aberto &&
                      g.unidades.map((u) => (
                        <tr key={u.sienge_unit_id}>
                          <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-3">
                            <span className="block truncate text-xs font-medium text-gray-800" title={u.name}>
                              {u.name}
                            </span>
                          </td>
                          {COLUNAS.map((c) => {
                            if (c.chave === 'commercial_stock') {
                              const cfg = statusConfig(u.commercial_stock);
                              return (
                                <td key={c.chave} className="border-b border-l border-gray-100 bg-white px-2 py-1.5">
                                  <span className="flex items-center gap-1.5 truncate text-xs text-gray-700">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td
                                key={c.chave}
                                className={`truncate border-b border-l px-2 py-1.5 text-xs ${
                                  c.numero ? 'text-right tabular-nums' : 'text-left'
                                } ${c.destaque ? 'border-blue-100 bg-blue-50/60 font-semibold text-blue-700' : 'border-gray-100 bg-white text-gray-700'}`}
                                title={c.numero ? undefined : u[c.chave] || undefined}
                              >
                                {c.numero ? numero(u[c.chave], c.casas) : u[c.chave] || ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

FracaoIdealTab.displayName = 'FracaoIdealTab';

export default FracaoIdealTab;
