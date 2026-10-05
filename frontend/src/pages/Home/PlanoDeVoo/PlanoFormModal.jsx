import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { atualizarPlano, criarPlano, excluirPlano, listarResponsaveis } from '../../../api/projetos.api';

const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

// Criar / editar um plano de voo: empresa (fixa depois de criado), nome e as pessoas da empresa
// que podem enxergar o plano (quem cria sempre enxerga). `plano` null = novo.
export default function PlanoFormModal({ aberto, plano, empresas, usuarioAtualId, onFechar, onSalvo, onExcluido }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ empresa_id: '', nome: '', membros: [] });
  const [pessoas, setPessoas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setForm(
      plano
        ? { empresa_id: plano.empresa_id, nome: plano.nome, membros: plano.membros.map(String) }
        : { empresa_id: empresas[0]?.value || '', nome: '', membros: [] }
    );
  }, [aberto, plano, empresas]);

  useEffect(() => {
    if (!aberto || !form.empresa_id) {
      setPessoas([]);
      return;
    }
    listarResponsaveis(form.empresa_id)
      .then((lista) => setPessoas(lista.filter((u) => u.id !== (plano?.criador_id ?? usuarioAtualId))))
      .catch(() => setPessoas([]));
  }, [aberto, form.empresa_id, plano, usuarioAtualId]);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const dados = { nome: form.nome, membros: form.membros.map(Number) };
      const r = plano ? await atualizarPlano(plano.id, dados) : await criarPlano({ ...dados, empresa_id: Number(form.empresa_id) });
      onSalvo(r);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar o plano de voo.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const ok = await confirm({
      title: 'Excluir plano de voo',
      description: `Excluir "${plano.nome}"? As macro tarefas são apagadas; as atividades continuam no Kanban, sem plano.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirPlano(plano.id);
      onExcluido();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível excluir o plano de voo.');
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title={plano ? 'Editar plano de voo' : 'Novo plano de voo'} maxWidthClass="max-w-xl">
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
          <SearchableSelect
            value={form.empresa_id}
            onChange={(v) => setForm((f) => ({ ...f, empresa_id: v || '', membros: [] }))}
            options={empresas}
            disabled={Boolean(plano)}
            clearable={false}
            placeholder="Selecione a empresa"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome do plano de voo</label>
          <input
            type="text"
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            maxLength={150}
            className={INPUT}
            placeholder="ex.: Lançamento Residencial Serra Azul"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Pessoas que podem ver o plano</label>
          <SearchableSelect
            multiple
            value={form.membros}
            onChange={(v) => setForm((f) => ({ ...f, membros: v }))}
            options={pessoas.map((u) => ({ value: String(u.id), label: u.nome }))}
            disabled={!form.empresa_id}
            placeholder={form.empresa_id ? 'Selecione as pessoas' : 'Escolha a empresa primeiro'}
            emptyMessage="Nenhum funcionário encontrado para esta empresa."
          />
          <p className="mt-1 text-xs text-gray-400">Quem cria o plano sempre tem acesso. Só quem criou pode alterá-lo.</p>
        </div>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {plano ? (
            <button
              type="button"
              onClick={excluir}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} /> Excluir plano
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              {plano ? 'Salvar' : 'Criar plano de voo'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
