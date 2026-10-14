import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, HandCoins, Landmark, Loader2, XCircle } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { atualizarProjecaoCef, listElegiveisProjecaoCef } from '../../../api/dfcProjecaoCef.api';
import { atualizarBaseReceberDfc, getAgingReceberDfc, getExecucaoBaseReceberDfc } from '../../../api/dfcAging.api';

function dinheiro(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
}

// Janela "Projeções" da aba Orçamentos (botão no topo da página). Duas opções (o Aging em cima, o
// CEF embaixo junto da lista de obras dele):
// - "Atualizar Projeção CEF" — recalcula, obra a obra, Novo Registro, Medição, Crédito PJ, Juros e
//   Amortização (motor em backend/src/modules/dfc-projecao-cef). Uma chamada por obra, em
//   sequência, pra a barra de progresso ser real.
// - "Atualizar Aging a Receber (Sienge)" — recarrega a base do contas a receber do Sienge pela
//   mesma rotina da Gestão de Cobranças (Monitor de Integrações); roda em segundo plano no
//   servidor e a janela acompanha por polling (dá pra fechar e voltar).
// `onConcluido` recarrega o orçamento.
export default function ProjecoesModal({ open, onClose, empresaId, onConcluido }) {
  const [obras, setObras] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, nome: '' });
  const [resultados, setResultados] = useState({}); // sienge_id -> { ok, resumo | erro }
  const [concluido, setConcluido] = useState(false);
  // Aging a receber: base carregada ({ parcelas, atualizado_em }) e execução da rotina.
  const [baseReceber, setBaseReceber] = useState(null);
  const [execAging, setExecAging] = useState(null);
  const [erroAging, setErroAging] = useState('');
  const agingRodando = execAging?.status === 'executando';

  function carregar() {
    setCarregando(true);
    setErro('');
    listElegiveisProjecaoCef(empresaId)
      .then(setObras)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as obras.'))
      .finally(() => setCarregando(false));
  }

  function carregarAging() {
    getAgingReceberDfc(empresaId)
      .then((r) => setBaseReceber(r.base))
      .catch(() => setBaseReceber(null));
  }

  useEffect(() => {
    if (!open || !empresaId) return;
    setResultados({});
    setConcluido(false);
    setProgresso({ atual: 0, total: 0, nome: '' });
    setErroAging('');
    carregar();
    carregarAging();
    getExecucaoBaseReceberDfc(empresaId)
      .then(setExecAging)
      .catch(() => setExecAging(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId]);

  // Acompanha a rotina enquanto roda; ao terminar com sucesso, recarrega a base e o orçamento.
  useEffect(() => {
    if (!open || !agingRodando) return undefined;
    const timer = setInterval(() => {
      getExecucaoBaseReceberDfc(empresaId)
        .then((exec) => {
          setExecAging(exec);
          if (exec?.status !== 'executando') {
            carregarAging();
            if (exec?.status === 'sucesso') onConcluido?.();
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agingRodando, empresaId]);

  async function atualizarAging() {
    setErroAging('');
    try {
      setExecAging(await atualizarBaseReceberDfc(empresaId));
    } catch (e) {
      setErroAging(e.response?.data?.message || 'Não foi possível iniciar a atualização.');
    }
  }

  const elegiveis = obras.filter((o) => o.elegivel);

  async function atualizarCef() {
    setRodando(true);
    setConcluido(false);
    setResultados({});
    for (let i = 0; i < elegiveis.length; i += 1) {
      const obra = elegiveis[i];
      setProgresso({ atual: i, total: elegiveis.length, nome: obra.name });
      try {
        const resumo = await atualizarProjecaoCef(empresaId, obra.sienge_id);
        setResultados((r) => ({ ...r, [obra.sienge_id]: { ok: true, resumo } }));
      } catch (e) {
        setResultados((r) => ({
          ...r,
          [obra.sienge_id]: { ok: false, erro: e.response?.data?.message || 'Erro ao projetar.' },
        }));
      }
    }
    setProgresso({ atual: elegiveis.length, total: elegiveis.length, nome: '' });
    setRodando(false);
    setConcluido(true);
    carregar();
    onConcluido?.();
  }

  const okCount = Object.values(resultados).filter((r) => r.ok).length;
  const falhaCount = Object.values(resultados).filter((r) => !r.ok).length;
  const pct = progresso.total ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <Modal open={open} onClose={rodando ? () => {} : onClose} title="Projeções" maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        {/* Opção: Atualizar Aging a Receber (Sienge) */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <HandCoins size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">Atualizar Aging a Receber (Sienge)</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                Recarrega o contas a receber do Sienge (a mesma base da Gestão de Cobranças). Cada parcela entra no mês do
                vencimento, com valor original − desconto + taxas, rateado por centro de custo e natureza — nas contas com
                Origem Projeção SIENGE - AGING.
              </p>
              <p className="mt-1.5 text-[11px] text-gray-400">
                {baseReceber?.parcelas
                  ? `Base atual: ${baseReceber.parcelas.toLocaleString('pt-BR')} parcela(s), atualizada em ${dataHora(baseReceber.atualizado_em)}.`
                  : 'Base ainda não carregada para esta empresa.'}
              </p>
            </div>
            <Button type="button" onClick={atualizarAging} loading={agingRodando} disabled={agingRodando || rodando}>
              Atualizar
            </Button>
          </div>

          {execAging && (agingRodando || execAging.finalizadoEm) && (
            <div className="mt-4">
              {agingRodando ? (
                <>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span className="truncate">
                      {execAging.progresso?.texto || 'Buscando o contas a receber no Sienge (pode levar alguns minutos)'} — dá
                      pra fechar a janela, a atualização continua.
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-600" />
                  </div>
                </>
              ) : execAging.status === 'sucesso' ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 size={14} className="shrink-0" />
                  Última atualização em {dataHora(execAging.finalizadoEm)}: {execAging.resumo}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-red-600">
                  <XCircle size={14} className="shrink-0" />
                  {execAging.status === 'interrompida' ? 'A última atualização foi interrompida.' : execAging.erro || 'A última atualização falhou.'}
                </p>
              )}
            </div>
          )}
          {erroAging && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroAging}</p>}
        </div>

        {/* Opção: Atualizar Projeção CEF */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Landmark size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">Atualizar Projeção CEF</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                Recalcula Novo Registro, Medição, Crédito PJ, Juros e Amortização de cada obra com Contrato Caixa e
                Parâmetros publicados — a partir dos Parâmetros vigentes, do Geral dos Empreendimentos e dos Avanços
                Obras — e lança no orçamento, nas contas com a Origem Projeção correspondente.
              </p>
            </div>
            <Button
              type="button"
              onClick={atualizarCef}
              loading={rodando}
              disabled={carregando || rodando || elegiveis.length === 0}
            >
              Atualizar
            </Button>
          </div>

          {(rodando || concluido) && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span className="truncate">
                  {rodando ? `Projetando ${progresso.nome}…` : `Concluído: ${okCount} obra(s) atualizada(s)${falhaCount ? `, ${falhaCount} com erro` : ''}.`}
                </span>
                <span className="shrink-0 tabular-nums">
                  {progresso.atual} de {progresso.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${falhaCount ? 'bg-amber-500' : 'bg-primary-600'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertTriangle size={15} className="shrink-0" />
            {erro}
          </div>
        )}

        {/* Obras da projeção */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Obras (Tipo Obra com Projeta DFC)</p>
          {carregando && obras.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Carregando...</p>
          ) : obras.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Nenhuma obra com &quot;Projeta DFC&quot; marcado.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {obras.map((o) => {
                const r = resultados[o.sienge_id];
                const emAndamento = rodando && progresso.nome === o.name;
                return (
                  <div key={o.sienge_id} className="flex items-start gap-3 px-3 py-2.5">
                    <span className="mt-0.5 shrink-0">
                      {emAndamento ? (
                        <Loader2 size={15} className="animate-spin text-primary-600" />
                      ) : r ? (
                        r.ok ? (
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        ) : (
                          <XCircle size={15} className="text-red-500" />
                        )
                      ) : (
                        <CircleDashed size={15} className={o.elegivel ? 'text-gray-300' : 'text-gray-200'} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${o.elegivel ? 'font-medium text-gray-800' : 'text-gray-400'}`}>{o.name}</p>
                      <p className="text-xs text-gray-400">
                        {!o.elegivel
                          ? `Não entra: ${o.motivo}.`
                          : r?.ok
                            ? `${r.resumo.meses} meses (${r.resumo.primeiro_mes} a ${r.resumo.ultimo_mes}) · ${r.resumo.unidades} unidades · Parâmetros v${r.resumo.versao_parametros}`
                            : r && !r.ok
                              ? r.erro
                              : o.ultima_atualizacao
                                ? `Última atualização: ${dataHora(o.ultima_atualizacao)}`
                                : 'Ainda não projetada.'}
                      </p>
                      {r?.ok && (
                        <p className="mt-0.5 text-[11px] tabular-nums text-gray-500">
                          Crédito PJ {dinheiro(r.resumo.totais.credito_pj)} · Novo Registro {dinheiro(r.resumo.totais.novo_registro)} ·
                          Medição {dinheiro(r.resumo.totais.medicao)} · Juros {dinheiro(r.resumo.totais.juros)} · Amortização{' '}
                          {dinheiro(r.resumo.totais.amortizacao)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={rodando}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
