import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import SearchableSelect from '../../components/SearchableSelect';
import { useConfirm } from '../../confirm/ConfirmContext';
import { listEmpresas } from '../../api/empresas.api';
import { listPeriodos, createPeriodo, updatePeriodo, deletePeriodo } from '../../api/periodos.api';
import { sincronizarPrevision } from '../../api/prevision.api';
import { gerarCentrosCusto } from '../../api/centrosCustoSienge.api';
import { gerarPlano } from '../../api/planosFinanceirosSienge.api';
import { gerarUnidades } from '../../api/unidadesSienge.api';
import { gerarContasBancarias } from '../../api/contasBancariasSienge.api';
import { importarDcd } from '../../api/dcd.api';
import { importarExtrato } from '../../api/extrato.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';

const OPERACOES = [
  { value: 'CURVA_OBRAS', label: 'Curva de Obras' },
  { value: 'CURVA_VENDAS', label: 'Curva de Vendas' },
  { value: 'PROJECOES_FINANCEIRAS', label: 'Projeções Financeiras' },
];

const OPERACAO_LABELS = Object.fromEntries(OPERACOES.map((o) => [o.value, o.label]));
const TODAS_OPERACOES = OPERACOES.map((o) => o.value);

const SIENGE_ETAPAS = [
  { nome: 'Centros de Custo', executar: gerarCentrosCusto },
  { nome: 'Planos Financeiros', executar: gerarPlano },
  { nome: 'Mapa de Unidades', executar: gerarUnidades },
  { nome: 'Contas Bancárias', executar: gerarContasBancarias },
];

const emptyForm = {
  empresa_id: '',
  data_inicio: '',
  data_fim: '',
};

function StatusIcon({ status }) {
  if (status === 'rodando') return <Loader2 size={16} className="animate-spin text-primary-600" />;
  if (status === 'concluido') return <Check size={16} className="text-emerald-600" />;
  if (status === 'erro') return <X size={16} className="text-red-600" />;
  return <span className="h-2 w-2 rounded-full bg-gray-300" />;
}

export default function PeriodosPage() {
  const confirm = useConfirm();
  const [modalAberto, setModalAberto] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [dcdFiles, setDcdFiles] = useState([]);
  const [extratoFiles, setExtratoFiles] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [etapas, setEtapas] = useState([]);
  const [periodos, setPeriodos] = useState([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(true);

  const [periodoEditando, setPeriodoEditando] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const ultimoIdPorEmpresa = useMemo(() => {
    const map = new Map();
    for (const p of periodos) {
      if (!map.has(p.empresa_id)) map.set(p.empresa_id, p.id);
    }
    return map;
  }, [periodos]);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 }).then((result) => setEmpresas(result.data));
  }, []);

  const loadPeriodos = useCallback(() => {
    setLoadingPeriodos(true);
    listPeriodos()
      .then(setPeriodos)
      .finally(() => setLoadingPeriodos(false));
  }, []);

  useEffect(() => {
    loadPeriodos();
  }, [loadPeriodos]);

  function adicionarArquivos(setFiles, novos) {
    setFiles((prev) => {
      const existentes = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const semDuplicados = novos.filter((f) => !existentes.has(`${f.name}-${f.size}`));
      return [...prev, ...semDuplicados];
    });
  }

  function atualizarEtapa(nome, patch) {
    setEtapas((prev) => prev.map((e) => (e.nome === nome ? { ...e, ...patch } : e)));
  }

  function fecharModal() {
    if (enviando) return;
    setModalAberto(false);
    setForm(emptyForm);
    setDcdFiles([]);
    setExtratoFiles([]);
    setEtapas([]);
    setError('');
  }

  function abrirEdicao(periodo) {
    setPeriodoEditando(periodo);
    setEditForm({
      data_inicio: periodo.data_inicio.slice(0, 10),
      data_fim: periodo.data_fim.slice(0, 10),
    });
    setEditError('');
  }

  function fecharEdicao() {
    if (salvandoEdicao) return;
    setPeriodoEditando(null);
    setEditForm(null);
    setEditError('');
  }

  async function handleSalvarEdicao(e) {
    e.preventDefault();
    setEditError('');

    if (!editForm.data_inicio || !editForm.data_fim) return setEditError('Informe o range de datas.');

    setSalvandoEdicao(true);
    try {
      await updatePeriodo(periodoEditando.id, { ...editForm, operacoes: TODAS_OPERACOES });
      setPeriodoEditando(null);
      setEditForm(null);
      loadPeriodos();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function handleExcluir(periodo) {
    const ok = await confirm({
      title: 'Excluir período',
      description: `Excluir o período de "${periodo.empresa_razao_social}" (${periodo.operacoes
        .map((o) => OPERACAO_LABELS[o] || o)
        .join(', ')})? Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;

    await deletePeriodo(periodo.id);
    loadPeriodos();
  }

  async function importarArquivosEmLote(nomeEtapa, files, empresaId, importarFn) {
    let sucesso = 0;
    const erros = [];
    for (let i = 0; i < files.length; i++) {
      atualizarEtapa(nomeEtapa, {
        status: 'rodando',
        mensagem: `Arquivo ${i + 1} de ${files.length} (${files[i].name})`,
      });
      try {
        await importarFn(empresaId, files[i]);
        sucesso++;
      } catch (err) {
        erros.push(`${files[i].name}: ${err.response?.data?.message || 'falha ao importar'}`);
      }
    }
    atualizarEtapa(nomeEtapa, {
      status: erros.length > 0 ? 'erro' : 'concluido',
      mensagem:
        erros.length > 0
          ? `${sucesso} de ${files.length} importado(s). ${erros.join(' | ')}`
          : `${sucesso} arquivo(s) importado(s) com sucesso.`,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.empresa_id) return setError('Selecione a empresa.');
    if (!form.data_inicio || !form.data_fim) return setError('Informe o range de datas.');

    setEnviando(true);

    const etapasIniciais = [
      { nome: 'Prevision', status: 'pendente', mensagem: '' },
      { nome: 'Sienge', status: 'pendente', mensagem: '' },
    ];
    if (dcdFiles.length > 0) etapasIniciais.push({ nome: 'DCD', status: 'pendente', mensagem: '' });
    if (extratoFiles.length > 0) etapasIniciais.push({ nome: 'Extrato', status: 'pendente', mensagem: '' });
    setEtapas(etapasIniciais);

    try {
      await createPeriodo({ ...form, operacoes: TODAS_OPERACOES });

      atualizarEtapa('Prevision', { status: 'rodando' });
      try {
        const resultado = await sincronizarPrevision(form.empresa_id);
        atualizarEtapa('Prevision', {
          status: 'concluido',
          mensagem: `${resultado.sucesso} de ${resultado.total_centros} centro(s) sincronizado(s).`,
        });
      } catch (err) {
        atualizarEtapa('Prevision', {
          status: 'erro',
          mensagem: err.response?.data?.message || 'Falha ao sincronizar o Prevision.',
        });
      }

      atualizarEtapa('Sienge', { status: 'rodando' });
      let siengeFalhou = false;
      const siengeResultados = [];
      for (const etapa of SIENGE_ETAPAS) {
        atualizarEtapa('Sienge', { status: 'rodando', mensagem: `Sincronizando ${etapa.nome}...` });
        try {
          const resultado = await etapa.executar(form.empresa_id);
          siengeResultados.push(`${etapa.nome}: ${resultado.total_importado} importado(s).`);
        } catch (err) {
          siengeFalhou = true;
          siengeResultados.push(
            `${etapa.nome}: falhou (${err.response?.data?.message || 'erro desconhecido'}).`
          );
        }
      }
      atualizarEtapa('Sienge', {
        status: siengeFalhou ? 'erro' : 'concluido',
        mensagem: siengeResultados.join('\n'),
      });

      if (dcdFiles.length > 0) {
        await importarArquivosEmLote('DCD', dcdFiles, form.empresa_id, importarDcd);
      }

      if (extratoFiles.length > 0) {
        await importarArquivosEmLote('Extrato', extratoFiles, form.empresa_id, importarExtrato);
      }

      setForm(emptyForm);
      setDcdFiles([]);
      setExtratoFiles([]);
      loadPeriodos();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível abrir o período.');
      setEtapas([]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Períodos</h2>
            <p className="text-xs text-gray-500">Abra um período para disparar a sincronização das integrações.</p>
          </div>
          <Button onClick={() => setModalAberto(true)}>
            <Plus size={16} />
            Abrir período
          </Button>
        </div>
      </Card>

      <Modal
        open={modalAberto}
        onClose={fecharModal}
        title="Abrir novo período"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={form.empresa_id}
              onChange={(value) => setForm((prev) => ({ ...prev, empresa_id: value }))}
              disabled={enviando}
              options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
              placeholder="Selecione"
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
              <input
                type="date"
                value={form.data_inicio}
                disabled={enviando}
                onChange={(e) => setForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
              <input
                type="date"
                value={form.data_fim}
                disabled={enviando}
                onChange={(e) => setForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                DCD atualizado
              </label>
              <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
                <UploadCloud size={16} />
                Selecionar arquivos PDF
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  disabled={enviando}
                  className="hidden"
                  onChange={(e) => {
                    adicionarArquivos(setDcdFiles, Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
              </label>
              {dcdFiles.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {dcdFiles.length} arquivo{dcdFiles.length > 1 ? 's' : ''} selecionado
                  {dcdFiles.length > 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Extratos</label>
              <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
                <UploadCloud size={16} />
                Selecionar arquivos Excel
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  disabled={enviando}
                  className="hidden"
                  onChange={(e) => {
                    adicionarArquivos(setExtratoFiles, Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
              </label>
              {extratoFiles.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {extratoFiles.length} arquivo{extratoFiles.length > 1 ? 's' : ''} selecionado
                  {extratoFiles.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {etapas.length > 0 && (
            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              {etapas.map((etapa) => (
                <div key={etapa.nome} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0">
                    <StatusIcon status={etapa.status} />
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium text-gray-700">
                      {etapa.status === 'rodando' ? `Integrando ${etapa.nome}...` : etapa.nome}
                    </span>
                    {etapa.mensagem && (
                      <p className="whitespace-pre-line text-gray-400">{etapa.mensagem}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={fecharModal} disabled={enviando}>
              {etapas.length > 0 && etapas.every((e) => e.status === 'concluido' || e.status === 'erro')
                ? 'Fechar'
                : 'Cancelar'}
            </Button>
            <Button type="submit" loading={enviando} disabled={etapas.length > 0}>
              Confirmar
            </Button>
          </div>
        </form>
      </Modal>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Períodos abertos</h3>
        </div>
        {loadingPeriodos ? (
          <div className="py-10 text-center text-sm text-gray-400">Carregando...</div>
        ) : periodos.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">Nenhum período aberto ainda.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3 font-medium">Empresa</th>
                <th className="px-5 py-3 font-medium">Período</th>
                <th className="px-5 py-3 font-medium">Operações</th>
                <th className="px-5 py-3 font-medium">Aberto por</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => {
                const editavel = ultimoIdPorEmpresa.get(p.empresa_id) === p.id;
                return (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 text-gray-900">{p.empresa_razao_social}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(`${p.data_inicio.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')} –{' '}
                      {new Date(`${p.data_fim.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {p.operacoes.map((o) => OPERACAO_LABELS[o] || o).join(', ')}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{p.criado_por_nome || '—'}</td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(p.criado_em).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-5 py-3">
                      {editavel && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(p)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluir(p)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={Boolean(periodoEditando)}
        onClose={fecharEdicao}
        title="Editar período"
        maxWidthClass="max-w-lg"
      >
        {editForm && (
          <form onSubmit={handleSalvarEdicao} className="space-y-4">
            {editError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                <input
                  type="date"
                  value={editForm.data_inicio}
                  disabled={salvandoEdicao}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                <input
                  type="date"
                  value={editForm.data_fim}
                  disabled={salvandoEdicao}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={fecharEdicao} disabled={salvandoEdicao}>
                Cancelar
              </Button>
              <Button type="submit" loading={salvandoEdicao}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
