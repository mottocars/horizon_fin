import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Copy, Link2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import Card from '../../components/Card';
import Tabs from '../../components/Tabs';
import SearchableSelect from '../../components/SearchableSelect';
import { useConfirm } from '../../confirm/ConfirmContext';
import { listEmpresas } from '../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';
import { criarFormulario, duplicarFormulario, excluirFormulario, linkPublico, listarFormularios } from '../../api/formularios.api';
import { MODALIDADES, STATUS, corAlpha, dataBr, dataHoraBr, mensagemErro } from './tipos';
import { MODELOS } from './modelos';
import { useAviso } from './Aviso';
import './formularios.css';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';
const ABAS = [{ id: 'formularios', label: 'Formulários', icon: ClipboardList }];

// Cadastros › Formulários: a lista + a faixa "Começar um formulário" (em branco ou a partir de um modelo).
// Tudo é da empresa escolhida no filtro (como em Contas Pagar / Receber): a lista mostra só os formulários
// dela e o formulário criado fica sendo dela. Clicar numa linha abre o construtor (FormularioEditorPage).
// Empresa e filtros na URL — o "Voltar" do navegador volta pro mesmo lugar.
export default function FormulariosPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const aviso = useAviso();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [params, setParams] = useSearchParams();
  const empresaId = params.get('empresa_id') || '';
  const busca = params.get('busca') || '';
  const status = params.get('status') || '';
  const modalidade = params.get('modalidade') || '';
  const [textoBusca, setTextoBusca] = useState(busca);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(null);
  const [recarga, setRecarga] = useState(0);

  function atualizarParams(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  }

  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada]);

  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);
  useEffect(() => {
    if (!carregandoEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoEmpresas, empresas, empresaId]);

  const editor = (id) => `/cadastros/formularios/${id}?empresa_id=${empresaId}`;

  useEffect(() => {
    const t = setTimeout(() => textoBusca !== busca && atualizarParams({ busca: textoBusca.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoBusca]);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setLista(null);
      return undefined;
    }
    let vivo = true;
    setErro('');
    setLista(null);
    listarFormularios(empresaId, { busca, status, modalidade })
      .then((l) => vivo && setLista(l))
      .catch((e) => {
        if (!vivo) return;
        setErro(mensagemErro(e, 'Não foi possível carregar os formulários.'));
        setLista([]);
      });
    return () => {
      vivo = false;
    };
  }, [empresaId, busca, status, modalidade]);

  useEffect(() => carregar(), [carregar, recarga]);

  async function comecar(modelo) {
    setCriando(modelo.id);
    try {
      const f = await criarFormulario(empresaId, modelo.gerar());
      navigate(editor(f.id));
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível criar o formulário.'));
      setCriando(null);
    }
  }

  async function duplicar(f) {
    try {
      const novo = await duplicarFormulario(empresaId, f.id);
      aviso('Formulário duplicado.');
      navigate(editor(novo.id));
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível duplicar.'));
    }
  }

  async function excluir(f) {
    const ok = await confirm({
      title: 'Excluir formulário',
      description: `Excluir "${f.titulo}"${f.qtd_respostas ? ` e as ${f.qtd_respostas} resposta(s) recebidas` : ''}? Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirFormulario(empresaId, f.id);
      aviso('Formulário excluído.');
      setRecarga((n) => n + 1);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível excluir.'));
    }
  }

  async function copiarLink(f) {
    try {
      await navigator.clipboard.writeText(linkPublico(f.token_publico));
      aviso('Link copiado.');
    } catch {
      aviso(linkPublico(f.token_publico));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
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
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={textoBusca}
                  onChange={(e) => setTextoBusca(e.target.value)}
                  placeholder="Título ou descrição"
                  disabled={!empresaId}
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Situação</label>
              <SearchableSelect
                value={status}
                onChange={(v) => atualizarParams({ status: v })}
                disabled={!empresaId}
                options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.rotulo }))}
                placeholder="Todas"
              />
            </div>
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Modalidade</label>
              <SearchableSelect
                value={modalidade}
                onChange={(v) => atualizarParams({ modalidade: v })}
                disabled={!empresaId}
                options={Object.entries(MODALIDADES).map(([value, m]) => ({ value, label: m.rotulo }))}
                placeholder="Todas"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setRecarga((n) => n + 1)}
              disabled={!empresaId}
              title="Atualizar"
              className="disabled:opacity-60 flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            >
              <RefreshCw size={18} />
            </button>
            <button
              type="button"
              onClick={() => comecar(MODELOS[0])}
              disabled={!!criando || !empresaId}
              title="Novo formulário"
              aria-label="Novo formulário"
              className="flex items-center justify-center rounded-lg bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:opacity-60"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={ABAS} activeId="formularios" onChange={() => {}} />
        {!empresaId ? (
          <div className="flex min-h-62 flex-col items-center justify-center rounded-card rounded-tl-none bg-white px-6 py-16 text-center shadow-card">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ClipboardList size={22} />
            </span>
            <p className="text-sm font-medium text-gray-800">Selecione uma empresa para ver e criar os formulários dela.</p>
          </div>
        ) : (
        <div className="space-y-5 rounded-card rounded-tl-none bg-white p-5 shadow-card">
          {/* Começar um formulário */}
          <div className="rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Começar um formulário</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Em branco ou a partir de um modelo — o formulário fica sendo de{' '}
                <span className="font-medium text-gray-700">{nomeExibicaoEmpresa(empresas.find((e) => String(e.id) === String(empresaId))) || 'a empresa escolhida'}</span>. Tudo pode
                ser editado depois.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
              {MODELOS.map((m) => {
                const Icone = m.icone;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => comecar(m)}
                    disabled={!!criando}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 text-left transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md disabled:opacity-60"
                  >
                    <span className="relative flex h-20 items-center justify-center" style={{ backgroundColor: corAlpha(m.cor, 0.08) }}>
                      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: m.cor }} />
                      {criando === m.id ? (
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200" style={{ borderTopColor: m.cor }} />
                      ) : (
                        <Icone size={26} style={{ color: m.cor }} className="transition group-hover:scale-110" />
                      )}
                    </span>
                    <span className="px-3 py-2.5">
                      <span className="block text-sm font-medium text-gray-900">{m.rotulo}</span>
                      <span className="block truncate text-xs text-gray-500">{m.descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-clip rounded-xl border border-gray-200">
            <div className="border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Formulários</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {lista === null ? 'Carregando...' : `${lista.length} formulário(s)`}
              </p>
            </div>
            {erro && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
            {lista === null ? (
              <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
            ) : lista.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <ClipboardList size={22} />
                </span>
                <p className="text-sm font-medium text-gray-800">{busca || status || modalidade ? 'Nenhum formulário com esses filtros.' : 'Nenhum formulário ainda.'}</p>
                <p className="mt-1 max-w-md text-xs text-gray-500">Escolha um modelo acima ou use o + para começar em branco.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead>
                    <tr className={CABECALHO}>
                      <th className="py-2.5 pl-4 pr-3 font-medium">Formulário</th>
                      <th className="py-2.5 pr-3 font-medium">Modalidade</th>
                      <th className="py-2.5 pr-3 font-medium">Situação</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Perguntas</th>
                      <th className="py-2.5 pl-6 pr-3 font-medium">Respostas</th>
                      <th className="py-2.5 pr-3 font-medium">Período</th>
                      <th className="py-2.5 pr-3 font-medium">Alterado em</th>
                      <th className="w-28 py-2.5 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f) => {
                      const mod = MODALIDADES[f.modalidade];
                      const st = STATUS[f.status];
                      const ModIcone = mod.icone;
                      const privado = f.modalidade !== 'PUBLICO';
                      const adesao = privado && f.qtd_destinatarios ? Math.min(1, f.qtd_respostas / f.qtd_destinatarios) : null;
                      return (
                        <tr key={f.id} onClick={() => navigate(editor(f.id))} className="group cursor-pointer border-b border-gray-100 hover:bg-gray-50">
                          <td className="max-w-[360px] py-3 pl-4 pr-3">
                            <div className="flex items-center gap-3">
                              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: f.cor_tema }} />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-gray-900">{f.titulo}</span>
                                <span className="block truncate text-gray-500">{f.descricao || 'Sem descrição'}</span>
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${mod.cor}`}>
                              <ModIcone size={12} />
                              {mod.rotulo}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cor}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${st.ponto}`} />
                              {st.rotulo}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-gray-700">{f.qtd_perguntas}</td>
                          <td className="py-3 pl-6 pr-3">
                            {privado ? (
                              <div className="w-36">
                                <div className="flex justify-between tabular-nums text-gray-700">
                                  <span>
                                    {f.qtd_respostas} de {f.qtd_destinatarios ?? 0}
                                  </span>
                                  <span className="text-gray-500">{adesao !== null ? `${Math.round(adesao * 100)}%` : ''}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                  <div className="h-full rounded-full" style={{ width: `${(adesao || 0) * 100}%`, backgroundColor: f.cor_tema }} />
                                </div>
                              </div>
                            ) : (
                              <span className="tabular-nums text-gray-700">{f.qtd_respostas}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-gray-700">
                            {f.inicio_em || f.fim_em ? `${f.inicio_em ? dataBr(f.inicio_em) : '…'} a ${f.fim_em ? dataBr(f.fim_em) : '…'}` : <span className="text-gray-400">Sem prazo</span>}
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-gray-500">{dataHoraBr(f.atualizado_em)}</td>
                          <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-0.5 opacity-60 transition group-hover:opacity-100">
                              {f.modalidade === 'PUBLICO' && f.status === 'PUBLICADO' && (
                                <button type="button" onClick={() => copiarLink(f)} title="Copiar link público" className="rounded-lg p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-600">
                                  <Link2 size={15} />
                                </button>
                              )}
                              <button type="button" onClick={() => duplicar(f)} title="Duplicar" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                <Copy size={15} />
                              </button>
                              <button type="button" onClick={() => excluir(f)} title="Excluir" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
