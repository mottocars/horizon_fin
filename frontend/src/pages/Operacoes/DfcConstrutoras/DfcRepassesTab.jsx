import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listRepassesDfc } from '../../../api/dfcRepasses.api';
import { formatarDataISO } from '../../../utils/datas';

// Colunas na ordem pedida pelo usuário: as do Geral dos Empreendimentos e as calculadas (fórmulas
// no backend — dfc-repasses/dfcRepasses.service.js). `soma`: entra no total do empreendimento.
const COLUNAS_GERAL = [
  { id: 'contrato_mutuario', label: 'Cód. Contrato Mutuário', tipo: 'texto', largura: 140 },
  { id: 'mutuario', label: 'Mutuário', tipo: 'texto', largura: 230 },
  { id: 'data_assinatura', label: 'Data Assinatura', tipo: 'data', largura: 100 },
  { id: 'data_registro', label: 'Data Registro', tipo: 'data', largura: 100 },
  { id: 'valor_financiamento', label: 'Valor Financiamento', tipo: 'moeda', soma: true },
  { id: 'valor_terreno', label: 'Valor Terreno', tipo: 'moeda', soma: true },
  { id: 'valor_subsidio', label: 'Valor Subsídio', tipo: 'moeda', soma: true },
  { id: 'valor_fgts', label: 'Valor FGTS', tipo: 'moeda', soma: true },
  { id: 'valor_avaliacao', label: 'Valor Avaliação', tipo: 'moeda', soma: true },
];
const COLUNAS_CALCULADAS = [
  { id: 'pct_obra_acumulado', label: '% Obra Acumulado', tipo: 'pct', largura: 100, titulo: 'Avanço PLS (DCD) acumulado no mês da data de registro' },
  { id: 'vgf', label: 'VGF', tipo: 'moeda', soma: true, titulo: 'Financiamento + Subsídio + FGTS' },
  { id: 'medicao_total', label: 'Medição Total', tipo: 'moeda', soma: true, titulo: '(Financiamento − Terreno) + Subsídio' },
  { id: 'novo_registro', label: 'Novo Registro', tipo: 'moeda', soma: true, titulo: 'Terreno + Subsídio' },
  { id: 'medicao', label: 'Medição', tipo: 'moeda', soma: true, titulo: 'Medição Total × % Obra Acumulado' },
  { id: 'novo_registro_total', label: 'Novo Registro Total', tipo: 'moeda', soma: true, titulo: 'Novo Registro + Medição' },
  { id: 'demanda_minima', label: 'Demanda Mínima', tipo: 'status', largura: 110, titulo: 'Data de assinatura antes da Data da Demanda Mínima' },
];
const COLUNAS = [...COLUNAS_GERAL, ...COLUNAS_CALCULADAS];
const LARGURA_PADRAO = 125;
const largura = (c) => c.largura || LARGURA_PADRAO;
const LARGURA_TOTAL = COLUNAS.reduce((s, c) => s + largura(c), 0);
// As duas primeiras colunas ficam presas à esquerda ao rolar na horizontal.
const ESQUERDA_MUTUARIO = largura(COLUNAS[0]);

function vazio(v) {
  return v === null || v === undefined;
}

function formatar(coluna, v) {
  if (vazio(v) || v === '') return '—';
  if (coluna.tipo === 'data') return formatarDataISO(v);
  if (coluna.tipo === 'moeda') return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (coluna.tipo === 'pct') return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  return String(v);
}

function StatusDemanda({ valor }) {
  if (vazio(valor)) return <span className="text-gray-300">—</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        valor ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {valor ? 'SIM' : 'NÃO'}
    </span>
  );
}

// Operações > DFC Construtoras > Repasses: as unidades do Geral dos Empreendimentos de cada
// empreendimento (centro de custo com Código Contrato Caixa), sem o primeiro contrato por data de
// assinatura (o da construtora), com colunas calculadas. Drilldown igual ao da aba Avanços Obras:
// nível 1 = empreendimento (com os totais), nível 2 = cada unidade. Começa tudo fechado; com
// busca, abre os empreendimentos que têm unidade encontrada.
export default function DfcRepassesTab({ empresaId, search = '' }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listRepassesDfc(empresaId)
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os repasses.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    carregar();
  }, [carregar]);

  const termo = search.trim().toLowerCase();
  const empreendimentos = useMemo(() => {
    const lista = dados || [];
    if (!termo) return lista;
    return lista
      .map((e) => ({
        ...e,
        unidades: e.unidades.filter(
          (u) => (u.mutuario || '').toLowerCase().includes(termo) || String(u.contrato_mutuario || '').includes(termo)
        ),
      }))
      .filter((e) => e.unidades.length > 0);
  }, [dados, termo]);

  function alternar(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Banknote size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver os repasses dos empreendimentos.</p>
      </div>
    );
  }

  const thBase = 'border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-50 px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-blue-700';

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
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
        <div className="overflow-x-auto rounded-t-lg">
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LARGURA_TOTAL }}
          >
            <colgroup>
              {COLUNAS.map((c) => (
                <col key={c.id} style={{ width: largura(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  colSpan={2}
                  className="sticky left-0 z-20 border-b border-r border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600"
                >
                  Empreendimento / Unidade
                </th>
                <th
                  colSpan={COLUNAS_GERAL.length - 2}
                  className="border-b border-l border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600"
                >
                  Geral dos Empreendimentos
                </th>
                <th
                  colSpan={COLUNAS_CALCULADAS.length}
                  className="border-b border-l border-blue-100 bg-blue-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700"
                >
                  Calculado
                </th>
              </tr>
              <tr>
                {COLUNAS.map((c, i) => (
                  <th
                    key={c.id}
                    title={c.titulo}
                    style={i === 1 ? { left: ESQUERDA_MUTUARIO } : undefined}
                    className={`${thBase} ${i === 0 ? 'sticky left-0 z-20 border-l-0' : ''} ${i === 1 ? 'sticky z-20 border-r border-r-blue-100' : ''} ${
                      c.tipo === 'moeda' || c.tipo === 'pct' ? 'text-right' : c.tipo === 'status' || c.tipo === 'data' ? 'text-center' : ''
                    } ${COLUNAS_CALCULADAS.includes(c) ? 'bg-blue-100' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empreendimentos.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS.length} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    {termo
                      ? 'Nenhuma unidade encontrada para essa busca.'
                      : 'Nenhum centro de custo com Código Contrato Caixa. Informe na aba Centros Custos.'}
                  </td>
                </tr>
              )}
              {empreendimentos.map((e) => {
                const temUnidades = e.unidades.length > 0;
                const aberto = temUnidades && (termo ? true : abertos.includes(e.sienge_id));
                const qtdDemanda = e.unidades.filter((u) => u.demanda_minima === true).length;
                return (
                  <Fragment key={e.sienge_id}>
                    {/* Nível 1: empreendimento, com os totais */}
                    <tr
                      onClick={() => temUnidades && !termo && alternar(e.sienge_id)}
                      className={`group/emp ${temUnidades && !termo ? 'cursor-pointer' : ''}`}
                    >
                      <td
                        colSpan={2}
                        className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/emp:bg-gray-100"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                              temUnidades ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
                            }`}
                          >
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-xs font-semibold text-gray-900" title={e.name}>
                                {e.name}
                              </span>
                              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                {e.unidades.length}
                              </span>
                            </span>
                            <span className="block truncate text-[10px] text-gray-400">
                              Contrato {e.contrato}
                              {!temUnidades && ' · Geral não importado'}
                              {e.data_demanda_minima &&
                                ` · Demanda mínima ${formatarDataISO(e.data_demanda_minima)} (${
                                  e.origem_demanda_minima === 'PARAMETROS' ? 'Parâmetros' : 'DCD'
                                })`}
                            </span>
                          </span>
                        </span>
                      </td>
                      {COLUNAS.slice(2).map((c) => {
                        let conteudo = '';
                        if (c.soma && temUnidades) {
                          const valores = e.unidades.map((u) => u[c.id]).filter((v) => !vazio(v));
                          conteudo = valores.length ? formatar(c, valores.reduce((s, v) => s + Number(v), 0)) : '—';
                        } else if (c.tipo === 'status' && temUnidades) {
                          conteudo = `${qtdDemanda} sim`;
                        }
                        return (
                          <td
                            key={c.id}
                            className={`border-b border-l border-gray-200 bg-gray-50 px-2 text-xs font-semibold tabular-nums text-gray-900 group-hover/emp:bg-gray-100 ${
                              c.tipo === 'status' ? 'text-center' : 'text-right'
                            }`}
                          >
                            {conteudo}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Nível 2: as unidades */}
                    {aberto &&
                      e.unidades.map((u) => (
                        <tr key={u.id} className="group/un">
                          {COLUNAS.map((c, i) => (
                            <td
                              key={c.id}
                              style={i === 1 ? { left: ESQUERDA_MUTUARIO } : undefined}
                              title={c.tipo === 'texto' ? u[c.id] || undefined : undefined}
                              className={`border-b border-gray-100 bg-white px-2 py-1.5 tabular-nums group-hover/un:bg-gray-50 ${
                                i === 0 ? 'sticky left-0 z-10 pl-9' : 'border-l'
                              } ${i === 1 ? 'sticky z-10 truncate border-r border-r-gray-200 font-medium text-gray-800' : 'text-gray-700'} ${
                                c.tipo === 'moeda' || c.tipo === 'pct' ? 'text-right' : c.tipo === 'status' || c.tipo === 'data' ? 'text-center' : ''
                              } ${vazio(u[c.id]) ? 'text-gray-300' : ''}`}
                            >
                              {c.tipo === 'status' ? <StatusDemanda valor={u[c.id]} /> : formatar(c, u[c.id])}
                            </td>
                          ))}
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
}
