import { Fragment, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileSpreadsheet, History, MessageCircle, Pencil, Plus, Trash2, TriangleAlert, Workflow, Zap } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Tabs from '../../../components/Tabs';
import Modal from '../../../components/Modal';
import Interruptor from '../../../components/Interruptor';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { ativarWorkflow, atualizarWorkflow, criarWorkflow, excluirWorkflow, execucoesWorkflows, listarWorkflows, opcoesWorkflows } from '../../../api/workflows.api';
import EditorWorkflow from './EditorWorkflow';

const TABS = [
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'execucoes', label: 'Execuções', icon: History },
];

const quando = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

const SITUACAO = {
  SUCESSO: ['bg-emerald-50 text-emerald-700', 'Enviado'],
  PARCIAL: ['bg-amber-50 text-amber-700', 'Parcial'],
  ERRO: ['bg-red-50 text-red-700', 'Erro'],
  IGNORADO: ['bg-gray-100 text-gray-600', 'Não enviado'],
  EXECUTANDO: ['bg-sky-50 text-sky-700', 'Executando'],
};
function Situacao({ status }) {
  const [cor, rotulo] = SITUACAO[status] || ['bg-gray-100 text-gray-600', status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>{rotulo}</span>;
}
// Para quem vai a mensagem de um tópico.
function paraQuem(p) {
  const modo = p.acao?.destinatarios?.modo;
  if (modo === 'APROVADOR') return 'o Aprovador da DRE';
  if (modo === 'RESPONSAVEL') return 'o Responsável (quem salvou)';
  const nomes = p.destinatarios_nomes || [];
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(', ')} + ${nomes.length - 3}` : nomes.join(', ');
}

const resumo = (r) => {
  if (!r) return '';
  if (r.motivo) return r.motivo;
  const total = (r.enviados?.length || 0) + (r.falhas?.length || 0);
  const n = r.enviados?.length || 0;
  return `${n} de ${total} ${n === 1 ? 'recebeu' : 'receberam'}${r.anexo ? ' (com o Excel)' : ''}`;
};

// Operações > Workflows (pedido do usuário — "algo parecido com o Power Automate"): automações por empresa,
// QUANDO acontecer um evento (gatilho), o sistema FAZ uma ação. Hoje: DRE › versão salva / versão aprovada →
// enviar WhatsApp pela conexão Z-API escolhida, com a mensagem digitada e, se quiser, o Excel de auditoria da
// DRE anexo. Dois modelos prontos ao criar. Aba Execuções: cada vez que um workflow rodou e o que aconteceu.
// Backend: modules/workflows.
export default function WorkflowsPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const empresaId = searchParams.get('empresa_id') || '';
  const aba = searchParams.get('aba') === 'execucoes' ? 'execucoes' : 'workflows';
  const atualizarParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, String(v)) : next.delete(k)));
    setSearchParams(next, { replace: true });
  };
  const confirm = useConfirm();

  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);
  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas]);

  const [workflows, setWorkflows] = useState(null);
  const [opcoes, setOpcoes] = useState(null);
  const [execucoes, setExecucoes] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => {
    setErro('');
    if (!empresaId) return;
    Promise.all([listarWorkflows(empresaId), opcoesWorkflows(empresaId)])
      .then(([w, o]) => {
        setWorkflows(w);
        setOpcoes(o);
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar os workflows.'));
  }, [empresaId]);
  useEffect(() => {
    setWorkflows(null);
    setOpcoes(null);
    setExecucoes(null);
    carregar();
  }, [carregar]);
  useEffect(() => {
    if (aba !== 'execucoes' || !empresaId) return;
    execucoesWorkflows(empresaId)
      .then(setExecucoes)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as execuções.'));
  }, [aba, empresaId]);

  // Novo: escolhe um modelo e abre o editor com ele.
  const [escolhendoModelo, setEscolhendoModelo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroEditor, setErroEditor] = useState('');
  const abrirEditor = (w) => {
    setErroEditor('');
    setEditando(w);
  };

  async function salvar(w) {
    setErroEditor('');
    setSalvando(true);
    try {
      const r = editando?.id ? await atualizarWorkflow(empresaId, editando.id, w) : await criarWorkflow(empresaId, w);
      setWorkflows(r.workflows);
      setEditando(null);
    } catch (e) {
      setErroEditor(e.response?.data?.message || 'Não foi possível salvar o workflow.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(w) {
    try {
      setWorkflows((await ativarWorkflow(empresaId, w.id, !w.ativo)).workflows);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível alterar.');
    }
  }

  async function excluir(w) {
    const ok = await confirm({
      title: 'Excluir workflow',
      description: `Excluir "${w.nome}"? O histórico de execuções dele também é apagado.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      setWorkflows((await excluirWorkflow(empresaId, w.id)).workflows);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível excluir.');
    }
  }

  const [execAberta, setExecAberta] = useState(null);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={(v) => atualizarParams({ empresa_id: v || null })}
              disabled={carregandoEmpresas || empresaTravada}
              options={empresas.map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) }))}
              placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
          {aba === 'workflows' && empresaId && opcoes && (
            <Button type="button" onClick={() => setEscolhendoModelo(true)}>
              <Plus size={16} />
              Novo workflow
            </Button>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={aba} onChange={(id) => atualizarParams({ aba: id === 'workflows' ? null : id })} />
        <div className="min-h-70 rounded-card rounded-tl-none bg-white p-5 shadow-card">
          {erro && (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-red-600">
              <TriangleAlert size={15} /> {erro}
            </p>
          )}
          {!empresaId ? (
            <div className="flex flex-col items-center py-14 text-center">
              <Workflow size={28} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">Selecione uma empresa</p>
              <p className="mt-1 text-xs text-gray-500">Os workflows são por empresa.</p>
            </div>
          ) : aba === 'workflows' ? (
            !workflows ? (
              <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
            ) : !workflows.length ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Workflow size={28} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">Nenhum workflow nesta empresa</p>
                <p className="mt-1 max-w-md text-xs text-gray-500">
                  Um workflow faz algo sozinho quando um evento acontece — ex.: quando a versão da DRE é salva, avisar o Aprovador pelo WhatsApp.
                </p>
                <Button type="button" className="mt-4" onClick={() => setEscolhendoModelo(true)}>
                  <Plus size={16} /> Novo workflow
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
                      <th className="py-2.5 pl-3 pr-3 font-medium">Workflow</th>
                      <th className="py-2.5 pr-3 font-medium">Tópicos (quando → então)</th>
                      <th className="py-2.5 pr-3 font-medium">Última execução</th>
                      <th className="py-2.5 pr-3 font-medium">Ativo</th>
                      <th className="py-2.5 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {workflows.map((w) => (
                      <tr key={w.id} className={`border-b border-gray-100 align-top ${w.ativo ? '' : 'opacity-60'}`}>
                        <td className="py-3 pl-3 pr-3">
                          <button type="button" onClick={() => abrirEditor(w)} className="text-left font-medium text-gray-900 hover:text-primary-700">
                            {w.nome}
                          </button>
                          <span className="mt-0.5 block text-xs text-gray-400">
                            {w.atualizado_por ? `alterado por ${w.atualizado_por} em ${quando(w.atualizado_em)}` : `criado em ${quando(w.criado_em)}`}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <ol className="space-y-1.5">
                            {w.passos.map((p, i) => (
                              // eslint-disable-next-line react/no-array-index-key
                              <li key={i} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-700">
                                <span className="w-4 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800">
                                  <Zap size={11} /> {p.gatilho_rotulo}
                                </span>
                                <span className="text-gray-300">→</span>
                                <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                                  <MessageCircle size={12} /> WhatsApp
                                </span>
                                para {paraQuem(p)}
                                {p.acao?.anexar_excel_dre && (
                                  <span className="inline-flex items-center gap-1 text-gray-500">
                                    · <FileSpreadsheet size={12} className="text-emerald-600" /> Excel da DRE
                                  </span>
                                )}
                                <span className="text-gray-400">· {p.conexao || 'conexão inativa'}</span>
                              </li>
                            ))}
                          </ol>
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {w.ultima_execucao ? (
                            <>
                              <Situacao status={w.ultima_execucao.status} />
                              <span className="mt-1 block text-gray-500">{quando(w.ultima_execucao.iniciado_em)}</span>
                              <span className="block text-gray-400">{resumo(w.ultima_execucao.resultado)}</span>
                            </>
                          ) : (
                            <span className="text-gray-400">ainda não rodou</span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <Interruptor ligado={w.ativo} onChange={() => alternar(w)} />
                        </td>
                        <td className="py-3 pr-3 text-right">
                          <span className="inline-flex gap-0.5">
                            <button type="button" onClick={() => abrirEditor(w)} title="Alterar" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                              <Pencil size={15} />
                            </button>
                            <button type="button" onClick={() => excluir(w)} title="Excluir" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={15} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : !execucoes ? (
            <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
          ) : !execucoes.length ? (
            <div className="flex flex-col items-center py-12 text-center">
              <History size={28} className="mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">Nenhuma execução ainda</p>
              <p className="mt-1 text-xs text-gray-500">Cada vez que um workflow rodar, aparece aqui com o resultado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
                    <th className="w-8 py-2.5 pl-3" />
                    <th className="py-2.5 pr-3 font-medium">Quando</th>
                    <th className="py-2.5 pr-3 font-medium">Workflow</th>
                    <th className="py-2.5 pr-3 font-medium">Evento</th>
                    <th className="py-2.5 pr-3 font-medium">Situação</th>
                    <th className="py-2.5 pr-3 font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {execucoes.map((x) => {
                    const aberta = execAberta === x.id;
                    const r = x.resultado || {};
                    return (
                      <Fragment key={x.id}>
                        <tr className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50" onClick={() => setExecAberta(aberta ? null : x.id)}>
                          <td className="py-3 pl-3 text-gray-400">{aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                          <td className="py-3 pr-3 text-xs tabular-nums text-gray-700">{quando(x.iniciado_em)}</td>
                          <td className="py-3 pr-3 font-medium text-gray-900">{x.workflow}</td>
                          <td className="py-3 pr-3 text-xs text-gray-600">
                            {x.gatilho_rotulo}
                            {x.contexto?.versao ? ` · versão ${x.contexto.versao}` : ''}
                            {x.passo !== null && x.passo !== undefined && <span className="block text-gray-400">tópico {x.passo + 1}</span>}
                          </td>
                          <td className="py-3 pr-3">
                            <Situacao status={x.status} />
                          </td>
                          <td className="py-3 pr-3 text-xs text-gray-600">{resumo(r)}</td>
                        </tr>
                        {aberta && (
                          <tr className="border-b border-gray-100 bg-gray-50/60">
                            <td />
                            <td colSpan={5} className="py-3 pr-3 text-xs">
                              {r.motivo && <p className="text-gray-700">{r.motivo}</p>}
                              {r.anexo && <p className="text-gray-500">Anexo: {r.anexo}</p>}
                              <ul className="mt-1 space-y-0.5">
                                {(r.enviados || []).map((d) => (
                                  <li key={`ok-${d.nome}`} className="text-emerald-700">✓ {d.nome}</li>
                                ))}
                                {(r.falhas || []).map((d) => (
                                  <li key={`erro-${d.nome}`} className="text-red-600">
                                    ✗ {d.nome}: {d.motivo}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {opcoes && (
        <Modal open={escolhendoModelo} onClose={() => setEscolhendoModelo(false)} title="Novo workflow — escolha um modelo" maxWidthClass="max-w-4xl">
          <div className="grid gap-3 sm:grid-cols-3">
            {opcoes.modelos.map((m) => {
              const rotulos = m.passos.map((p) => opcoes.gatilhos.find((x) => x.id === p.gatilho)?.rotulo);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setEscolhendoModelo(false);
                    abrirEditor({ nome: m.nome, passos: m.passos });
                  }}
                  className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <span className="flex flex-wrap gap-1">
                    {rotulos.map((r, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                        <Zap size={11} /> {r}
                      </span>
                    ))}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{m.nome}</span>
                  <span className="text-xs text-gray-500">{m.descricao}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {editando && opcoes && (
        <EditorWorkflow
          aberto
          inicial={editando}
          opcoes={opcoes}
          salvando={salvando}
          erro={erroEditor}
          onSalvar={salvar}
          onFechar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
