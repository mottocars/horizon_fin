import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Layers, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  createClassificacao,
  listClassificacoes,
  removeClassificacao,
  updateClassificacao,
} from '../../../api/classificacoesBancarias.api';
import { useConfirm } from '../../../confirm/ConfirmContext';

const PRIORIDADES = [
  { value: 'SALDO_ANTERIOR', label: 'Buscar saldo anterior' },
  { value: 'SEM_SALDO', label: 'Não retornar nenhum saldo' },
];
const ROTULO_PRIORIDADE = Object.fromEntries(PRIORIDADES.map((p) => [p.value, p.label]));

const formVazio = { nome: '', prioridade_sem_saldo: 'SEM_SALDO' };

// Cadastro das classificações bancárias da empresa (antes era uma lista fixa de 6 valores pro
// sistema inteiro) — cada uma define, quando a busca automática de saldo (VanPix) não retorna
// nada pra um dia, se repete o saldo do dia anterior ou deixa sem saldo mesmo. Empresa nova
// nasce sem nenhuma cadastrada; o combobox de Classificação no cadastro de Contas Bancárias só
// mostra o que existir aqui.
//
// `ref` expõe `abrirNova()` pra página-mãe (o botão "Nova classificação" fica lá, junto do
// filtro de Empresa, seguindo o padrão do resto do sistema) — o modal de criar/editar continua
// vivendo aqui porque é o mesmo formulário dos dois casos e a lista precisa recarregar sozinha
// depois de criar.
const ClassificacoesTab = forwardRef(function ClassificacoesTab({ empresaId }, ref) {
  const confirm = useConfirm();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null); // null = criando
  const [form, setForm] = useState(formVazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setItens([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listClassificacoes(empresaId)
      .then(setItens)
      .finally(() => setLoading(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useImperativeHandle(ref, () => ({ abrirNova }), []);

  function abrirNova() {
    setEditando(null);
    setForm(formVazio);
    setErro('');
    setModalAberto(true);
  }

  function abrirEdicao(item) {
    setEditando(item);
    setForm({ nome: item.nome, prioridade_sem_saldo: item.prioridade_sem_saldo });
    setErro('');
    setModalAberto(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      if (editando) await updateClassificacao(empresaId, editando.id, form);
      else await createClassificacao(empresaId, form);
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleRemover(item) {
    const confirmado = await confirm({
      title: 'Remover classificação',
      description: `Remover "${item.nome}"? Contas que já usam esse nome continuam com ele salvo, mas ele deixa de valer como uma classificação cadastrada (some da grade de saldos e da prioridade automática).`,
      confirmLabel: 'Remover',
      variant: 'warning',
    });
    if (!confirmado) return;
    setRemovendoId(item.id);
    try {
      await removeClassificacao(empresaId, item.id);
      carregar();
    } finally {
      setRemovendoId(null);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Layers size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e cadastrar as classificações bancárias.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
          <Layers size={28} className="text-gray-300" />
          Nenhuma classificação cadastrada ainda.
        </div>
      ) : (
        <div className="rounded-b-card">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">Nome</th>
                <th className="border-b border-l border-gray-200 bg-white px-3 py-2.5 font-medium">
                  Sem saldo na API, priorizar
                </th>
                <th className="w-20 border-b border-l border-gray-200 bg-white px-3 py-2.5 text-right font-medium">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="group">
                  <td className="border-b border-gray-100 py-2 pl-4 font-medium text-gray-800 group-hover:bg-gray-50">
                    {item.nome}
                  </td>
                  <td className="border-b border-l border-gray-100 px-3 py-2 text-gray-600 group-hover:bg-gray-50">
                    {ROTULO_PRIORIDADE[item.prioridade_sem_saldo] || item.prioridade_sem_saldo}
                  </td>
                  <td className="border-b border-l border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(item)}
                        title="Editar"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemover(item)}
                        disabled={removendoId === item.id}
                        title="Remover"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? 'Editar classificação' : 'Nova classificação'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              autoFocus
              maxLength={50}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sem saldo na API, priorizar</label>
            <SearchableSelect
              value={form.prioridade_sem_saldo}
              onChange={(value) => setForm((f) => ({ ...f, prioridade_sem_saldo: value }))}
              options={PRIORIDADES}
              clearable={false}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

ClassificacoesTab.displayName = 'ClassificacoesTab';

export default ClassificacoesTab;
