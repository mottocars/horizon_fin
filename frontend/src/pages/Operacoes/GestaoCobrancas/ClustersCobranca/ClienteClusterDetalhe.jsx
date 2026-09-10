import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import Card from '../../../../components/Card';
import { getClienteClusterDetalhe } from '../../../../api/cobrancaClusters.api';
import { fmt } from '../MotorRisco/calculo';
import { INDICADORES } from '../MotorRisco/conteudo';
import { CLUSTER_LABEL, CLUSTER_TAG_ESTILO, formatarMoeda, formatarData, formatarDataHora } from './constantes';

const INDICADOR_META = Object.fromEntries(INDICADORES.map((ind) => [ind.id, ind]));

// Uma linha "rótulo: valor", com um selo opcional de OK/pendente — usada no
// resumo da simulação abaixo.
function LinhaSimulacao({ label, valor, ok }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 py-2 first:border-0 first:pt-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5 text-right text-sm font-medium text-gray-900">
        {valor}
        {ok !== undefined && (
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        )}
      </span>
    </div>
  );
}

// Nível 2-detalhe: o motivo auditável completo do cluster de 1 cliente —
// toda a simulação que levou ao score (mesmo raciocínio do "Testar com um
// cliente", só que com os dados reais deste cliente), o detalhe da regra
// dura quando ela é o motivo, se a trava de subida está segurando uma
// melhora, a lista de parcelas e o histórico de reclassificações mês a mês.
export default function ClienteClusterDetalhe() {
  const { cluster, clientId } = useParams();
  const [searchParams] = useSearchParams();
  const empresaId = searchParams.get('empresa_id');
  const navigate = useNavigate();

  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!empresaId || !clientId) return;
    setLoading(true);
    setErro('');
    getClienteClusterDetalhe(empresaId, clientId)
      .then(setDetalhe)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar o detalhe deste cliente.'))
      .finally(() => setLoading(false));
  }, [empresaId, clientId]);

  function voltar() {
    navigate(`/operacoes/gestao-de-cobrancas/clusters/${cluster}?${searchParams.toString()}`);
  }

  const contexto = detalhe?.breakdown?.contexto;
  const pctEmDia =
    contexto && contexto.qtd_parcelas_vencidas > 0
      ? (contexto.parcelas_pagas_em_dia / contexto.qtd_parcelas_vencidas) * 100
      : null;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={voltar}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para {CLUSTER_LABEL[cluster] || 'o cluster'}
      </button>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <Card>
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertTriangle size={15} className="shrink-0" />
            {erro}
          </div>
        </Card>
      ) : !detalhe ? null : (
        <>
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {detalhe.cliente.client_name || `Cliente ${detalhe.cliente.client_id}`}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Calculado em {formatarDataHora(detalhe.cliente.calculado_em)} ·{' '}
                  {detalhe.cliente.parcelas_em_dia_seguidas} parcela(s) consecutiva(s) em dia
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${CLUSTER_TAG_ESTILO[detalhe.cliente.cluster]}`}
                >
                  {CLUSTER_LABEL[detalhe.cliente.cluster]}
                </span>
                {detalhe.cliente.score != null && (
                  <p className="mt-1 font-mono text-lg font-semibold text-gray-900">{fmt(Number(detalhe.cliente.score))}</p>
                )}
              </div>
            </div>
          </Card>

          {detalhe.saldos && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900">Saldo em aberto</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Vencido', valor: detalhe.saldos.saldo_vencido, alerta: true },
                  { label: 'No mês', valor: detalhe.saldos.saldo_no_mes },
                  { label: 'A vencer', valor: detalhe.saldos.saldo_a_vencer },
                  { label: 'Total', valor: detalhe.saldos.saldo_aberto },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-lg px-3 py-2.5 ${item.alerta ? 'bg-red-50' : 'bg-gray-50'}`}
                  >
                    <p className={`text-[10px] uppercase tracking-wide ${item.alerta ? 'text-red-400' : 'text-gray-400'}`}>
                      {item.label}
                    </p>
                    <p
                      className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${item.alerta ? 'text-red-600' : 'text-gray-900'}`}
                    >
                      {formatarMoeda(item.valor)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {detalhe.cliente.regra_dura_ativa && detalhe.breakdown?.regra_dura_detalhe && (
            <Card className="border border-red-100">
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-red-700">Regra dura da régua de cobrança ativa</h3>
                  <p className="mt-1 text-xs text-red-600">
                    Classificado como Mau pagador direto, ignorando o score, por ter parcela(s) em aberto vencidas
                    além do limite configurado na versão vigente do Motor de Risco:
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-red-400">
                          <th className="pb-1 font-medium">Parcela</th>
                          <th className="pb-1 font-medium">Vencimento</th>
                          <th className="pb-1 text-right font-medium">Dias vencidos</th>
                          <th className="pb-1 text-right font-medium">Limite configurado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.breakdown.regra_dura_detalhe.map((p) => (
                          <tr key={`${p.bill_id}-${p.installment_id}`} className="border-t border-red-100">
                            <td className="py-1 text-red-700">
                              {p.bill_id}/{p.installment_id}
                            </td>
                            <td className="py-1 text-red-700">{formatarData(p.due_date)}</td>
                            <td className="py-1 text-right font-semibold text-red-700">{p.dias_atraso} dias</td>
                            <td className="py-1 text-right text-red-500">{p.limite_configurado} dias</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {detalhe.breakdown?.subiu_bloqueado_por_trava && (
            <Card className="border border-amber-100">
              <div className="flex items-start gap-2">
                <Lock size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-700">Melhora travada</h3>
                  <p className="mt-1 text-xs text-amber-600">
                    O score deste cliente já indicaria um cluster melhor, mas a trava de subida ainda não foi
                    cumprida — faltam parcelas seguidas em dia antes de subir de cluster.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {contexto && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900">Resumo da simulação</h3>
              <p className="mt-1 text-xs text-gray-500">
                Rastreamento de como este cliente chegou neste cluster — os mesmos números que o simulador "Testar
                com um cliente" (Motor de Risco) mostraria, aqui extraídos da base real dele.
              </p>
              <div className="mt-2">
                <LinhaSimulacao
                  label="Parcelas vencidas consideradas (mínimo exigido)"
                  valor={`${contexto.qtd_parcelas_vencidas} de ${contexto.minimo_parcelas}`}
                  ok={contexto.qtd_parcelas_vencidas >= contexto.minimo_parcelas}
                />
                <LinhaSimulacao
                  label="Pagas dentro da tolerância"
                  valor={
                    pctEmDia !== null
                      ? `${contexto.parcelas_pagas_em_dia} de ${contexto.qtd_parcelas_vencidas} = ${fmt(pctEmDia)}%`
                      : '—'
                  }
                />
                <LinhaSimulacao
                  label="Sequência atual em dia (trava de subida)"
                  valor={`${contexto.streak_parcelas_em_dia} de ${contexto.trava_subida_parcelas} necessárias`}
                  ok={contexto.streak_parcelas_em_dia >= contexto.trava_subida_parcelas}
                />
                <LinhaSimulacao
                  label="Score x faixas de corte"
                  valor={`${fmt(contexto.score)} pontos — Bom ≥ ${contexto.corte_bom_pagador} · Duvidoso ≥ ${contexto.corte_pagador_duvidoso}`}
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
                Parâmetros da versão do Motor de Risco usada nesta simulação: tolerância de{' '}
                {contexto.tolerancia_dias} dia(s) · janela de observação de {contexto.janela_observacao_meses} meses ·
                gatilho de reincidência em {contexto.gatilho_reincidencia_dias} dia(s) · regra dura da régua de
                cobrança em {contexto.dias_vencidos_regua_cobranca} dia(s) vencidos.
              </p>
            </Card>
          )}

          {detalhe.breakdown?.indicadores && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900">Como o score foi formado</h3>
              <p className="mt-1 text-xs text-gray-500">
                Cada indicador converte o valor bruto numa nota de 0 a 100 (dado o pior valor aceitável e o ideal da
                escala), multiplica pelo peso e soma os pontos.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                      <th className="pb-1.5 font-medium">Indicador</th>
                      <th className="pb-1.5 text-right font-medium">Valor</th>
                      <th className="pb-1.5 text-right font-medium">Escala</th>
                      <th className="pb-1.5 text-right font-medium">Nota</th>
                      <th className="pb-1.5 text-right font-medium">Peso</th>
                      <th className="pb-1.5 pl-1 text-right font-medium">Pontos</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {detalhe.breakdown.indicadores.map((ind) => {
                      const meta = INDICADOR_META[ind.indicador];
                      return (
                        <tr key={ind.indicador} className="border-t border-gray-100">
                          <td className="py-1.5 text-left font-sans text-gray-600">{meta?.curto || ind.indicador}</td>
                          <td className="py-1.5 text-right">
                            {fmt(ind.valor_bruto)}
                            {meta?.unidade}
                          </td>
                          <td className="py-1.5 text-right text-gray-400">
                            {fmt(ind.nota_0)} → {fmt(ind.nota_100)}
                          </td>
                          <td className="py-1.5 text-right">{fmt(ind.nota)}</td>
                          <td className="py-1.5 text-right">{ind.peso}%</td>
                          <td className="py-1.5 pl-1 text-right font-medium text-primary-600">{fmt(ind.pontos)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-gray-900">Parcelas</h3>
            <p className="mt-1 text-xs text-gray-500">
              Mostrando até 2 meses à frente de hoje.
              {detalhe.parcelas_futuras_ocultas > 0 &&
                ` ${detalhe.parcelas_futuras_ocultas} parcela(s) com vencimento mais distante não aparece(m) aqui — isso não afeta o score, que só considera parcelas já vencidas.`}
              {' '}Em vermelho: parcela paga com atraso ou ainda em aberto vencida.
            </p>
            <div className="mt-3 max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 font-medium">Título/Parcela</th>
                    <th className="py-2 font-medium">Documento</th>
                    <th className="py-2 font-medium">Vencimento</th>
                    <th className="py-2 font-medium">Pagamento</th>
                    <th className="py-2 text-right font-medium">Atraso</th>
                    <th className="py-2 text-right font-medium">Saldo em aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.parcelas.map((p) => (
                    <tr
                      key={`${p.bill_id}-${p.installment_id}`}
                      className={`border-b border-gray-50 last:border-0 ${p.em_alerta ? 'bg-red-50/60' : ''}`}
                    >
                      <td className="py-2 text-gray-700">
                        {p.bill_id}/{p.installment_id}
                      </td>
                      <td className="py-2 text-gray-600">
                        {p.document_identification_name || '—'}
                        {p.document_number ? ` · ${p.document_number}` : ''}
                      </td>
                      <td className="py-2 text-gray-600">{formatarData(p.due_date)}</td>
                      <td className={`py-2 ${p.em_alerta && !p.paga ? 'font-medium text-red-600' : 'text-gray-600'}`}>
                        {p.data_pagamento ? formatarData(p.data_pagamento) : p.vencida ? 'Em aberto' : '—'}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${p.em_alerta ? 'font-medium text-red-600' : 'text-gray-500'}`}>
                        {p.dias_atraso === null ? '—' : p.dias_atraso === 0 ? 'Em dia' : `${p.dias_atraso} dia(s)`}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900">{formatarMoeda(p.corrected_balance_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {detalhe.historico.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900">Histórico de reclassificações</h3>
              <div className="mt-3 space-y-3">
                {detalhe.historico.map((h, i) => (
                  <div key={h.mes_referencia} className={`flex gap-3 ${i === 0 ? '' : 'border-t border-gray-100 pt-3'}`}>
                    <div
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.regra_dura_disparada ? 'bg-red-400' : 'bg-gray-300'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">{formatarData(h.mes_referencia)}</p>
                      <p className="text-sm text-gray-800">
                        {h.cluster_anterior && h.cluster_anterior !== h.cluster_novo ? (
                          <>
                            De <strong>{CLUSTER_LABEL[h.cluster_anterior]}</strong> para{' '}
                            <strong>{CLUSTER_LABEL[h.cluster_novo]}</strong>
                          </>
                        ) : (
                          <>
                            Manteve <strong>{CLUSTER_LABEL[h.cluster_novo]}</strong>
                          </>
                        )}
                        {h.subiu_bloqueado_por_trava && <span className="ml-1.5 text-amber-600">(subida travada)</span>}
                      </p>
                      {h.regra_dura_disparada && <p className="text-xs text-red-600">Regra dura disparada nesta competência.</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
