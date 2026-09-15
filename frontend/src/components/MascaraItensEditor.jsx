import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ListTree, Trash2 } from 'lucide-react';
import Button from './Button';
import { listMascaras, createMascaraItem, updateMascaraItem, deleteMascaraItem } from '../api/mascaras.api';
import { useAlert, useConfirm } from '../confirm/ConfirmContext';

// Lista editável de itens de uma máscara (sequência + descrição), com
// criação/edição/exclusão inline. Usado tanto na tela de Máscaras (Cadastros)
// quanto na aba "Máscaras" de Repasses CEF — mesmo componente nos dois
// lugares, pra garantir que o comportamento seja idêntico.
export default function MascaraItensEditor({ tipo, empresaId, grupo, itemLabel }) {
  // Prazo (SLA) só faz sentido pra micro etapa de Repasses — nos demais
  // tipos (DRE, DFC, PACOTES...) o item é um código de classificação, não
  // um passo de funil com prazo esperado.
  const mostrarSla = tipo === 'REPASSES';
  const confirm = useConfirm();
  const alert = useAlert();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const focusIdRef = useRef(null);
  const inputRefs = useRef(new Map());

  const loadItens = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const result = await listMascaras(tipo, empresaId, grupo);
      setItens(result);
    } finally {
      setLoading(false);
    }
  }, [tipo, empresaId, grupo]);

  useEffect(() => {
    loadItens();
  }, [loadItens]);

  useEffect(() => {
    if (focusIdRef.current == null) return;
    const input = inputRefs.current.get(focusIdRef.current);
    if (input) {
      input.focus();
      focusIdRef.current = null;
    }
  }, [itens]);

  async function handleAddRow() {
    setCreating(true);
    try {
      const novoItem = await createMascaraItem(tipo, Number(empresaId), grupo);
      focusIdRef.current = novoItem.id;
      setItens((prev) => [...prev, novoItem]);
    } finally {
      setCreating(false);
    }
  }

  function handleCampoChange(id, campo, valor) {
    setItens((prev) => prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));
  }

  async function handleSalvar(id, dados) {
    await updateMascaraItem(id, dados);
  }

  async function handleDeleteRow(item) {
    const confirmado = await confirm({
      title: 'Excluir linha',
      description: item.descricao
        ? `Excluir a linha ${item.sequencia} — "${item.descricao}"?`
        : `Excluir a linha ${item.sequencia}?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!confirmado) return;

    setDeletingId(item.id);
    try {
      await deleteMascaraItem(item.id);
      await loadItens();
    } catch (err) {
      await alert({
        title: 'Não foi possível excluir',
        description: err.response?.data?.message || 'Tente novamente em instantes.',
        variant: 'danger',
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <ListTree size={22} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">
            Nenhum item cadastrado em {itemLabel} ainda.
          </p>
          <p className="text-xs text-gray-400">Comece criando a primeira linha.</p>
        </div>
        <Button onClick={handleAddRow} loading={creating}>
          <Plus size={16} />
          Gerar primeiro registro
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex gap-4 px-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        <span className="w-9 shrink-0">Seq.</span>
        <span className="flex-1">Descrição</span>
        {mostrarSla && <span className="w-24 shrink-0">SLA (dias)</span>}
      </div>

      <div className="divide-y divide-gray-50">
        {itens.map((item) => (
          <MascaraRow
            key={item.id}
            item={item}
            mostrarSla={mostrarSla}
            registerRef={(el) => {
              if (el) inputRefs.current.set(item.id, el);
              else inputRefs.current.delete(item.id);
            }}
            onChange={(campo, valor) => handleCampoChange(item.id, campo, valor)}
            onSave={(dados) => handleSalvar(item.id, dados)}
            onEnterOnLastRow={handleAddRow}
            onDelete={() => handleDeleteRow(item)}
            deleting={deletingId === item.id}
            isLast={item.id === itens[itens.length - 1].id}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddRow}
        disabled={creating}
        title="Adicionar linha"
        className="mt-3 flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-primary-300 hover:text-primary-600 disabled:opacity-60"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function MascaraRow({ item, registerRef, mostrarSla, onChange, onSave, onEnterOnLastRow, onDelete, deleting, isLast }) {
  // Um snapshot só, com os dois campos — descrição e SLA são salvos juntos
  // (mesmo PUT), então o blur de qualquer um dos dois compara e manda os
  // dois, não só o que mudou.
  const lastSavedRef = useRef({ descricao: item.descricao, sla_dias: item.sla_dias });

  function handleBlur() {
    if (item.descricao !== lastSavedRef.current.descricao || item.sla_dias !== lastSavedRef.current.sla_dias) {
      lastSavedRef.current = { descricao: item.descricao, sla_dias: item.sla_dias };
      onSave({ descricao: item.descricao, sla_dias: item.sla_dias });
    }
  }

  function handleKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.currentTarget.blur();
    if (isLast) onEnterOnLastRow();
  }

  return (
    <div className="group flex items-center gap-4 rounded-md px-1 py-1.5 hover:bg-gray-50/60">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
        {item.sequencia}
      </span>
      <input
        ref={registerRef}
        type="text"
        value={item.descricao}
        onChange={(e) => onChange('descricao', e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Digite a descrição..."
        className="w-full flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 transition-colors placeholder:text-gray-300 hover:bg-gray-50 focus:border-primary-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      {mostrarSla && (
        <input
          type="number"
          min="0"
          max="3650"
          value={item.sla_dias ?? ''}
          onChange={(e) => onChange('sla_dias', e.target.value === '' ? null : Number(e.target.value))}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="dias"
          title="Prazo esperado (SLA) desta etapa, em dias"
          className="w-24 shrink-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 transition-colors placeholder:text-gray-300 hover:bg-gray-50 focus:border-primary-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        title="Excluir linha"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-60 group-hover:opacity-100"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
