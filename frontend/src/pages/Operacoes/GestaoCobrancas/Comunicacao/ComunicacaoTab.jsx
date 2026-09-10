import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../../../components/Card';
import {
  atualizarTemplateComunicacao,
  criarTemplateComunicacao,
  listTemplatesComunicacao,
  removerTemplateComunicacao,
} from '../../../../api/comunicacao.api';
import TemplateList from './TemplateList';
import TemplateFormModal from './TemplateFormModal';

// Marcador na URL pra "criando um novo, ainda não existe no banco" — só um
// id de verdade abre em modo de edição.
const NOVO = 'novo';

// A tela em si é só a listagem de templates (ver TemplateList.jsx) — criar
// ou editar acontece numa janela à parte (TemplateFormModal.jsx), aberta ao
// clicar em "+ Novo template" ou num template da lista. O estado da janela
// fica na URL (`comm_template` = id existente, "novo", ou ausente/fechada),
// mesmo espírito do `regua_cluster` da Régua de Cobrança. A janela só grava
// de verdade (POST ou PUT, ver handleSalvar) quando "Salvar template" é
// clicado — fechar sem salvar não persiste nada.
export default function ComunicacaoTab({ empresaId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTemplate = searchParams.get('comm_template');
  const criandoNovo = paramTemplate === NOVO;
  const selecionadoId = paramTemplate && !criandoNovo ? Number(paramTemplate) : null;

  const [templates, setTemplates] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroCluster, setFiltroCluster] = useState('todos');

  // Insere uma @variável no cursor do corpo da mensagem — compartilhado
  // entre o combobox do "@" (dentro do MentionTextarea) e o clique num chip
  // de variável (ver TemplateFormModal.jsx).
  const mentionRef = useRef(null);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setTemplates([]);
      return;
    }
    setCarregando(true);
    listTemplatesComunicacao(empresaId)
      .then(setTemplates)
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirModal(id) {
    const next = new URLSearchParams(searchParams);
    next.set('comm_template', id);
    setSearchParams(next, { replace: true });
  }

  function fecharModal() {
    const next = new URLSearchParams(searchParams);
    next.delete('comm_template');
    setSearchParams(next, { replace: true });
  }

  // `id` nulo = ainda não existe (criando) → POST; senão → PUT. Fecha a
  // janela ao terminar de salvar (padrão "salvar e fechar").
  async function handleSalvar(id, dados) {
    if (id) {
      const atualizado = await atualizarTemplateComunicacao(id, dados);
      setTemplates((prev) => prev.map((t) => (t.id === id ? atualizado : t)));
    } else {
      const criado = await criarTemplateComunicacao(empresaId, dados);
      setTemplates((prev) => [criado, ...prev]);
    }
    fecharModal();
  }

  async function handleExcluir(id) {
    await removerTemplateComunicacao(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    fecharModal();
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para gerenciar os templates.</p>
      </Card>
    );
  }

  const templateSelecionado = criandoNovo ? null : templates.find((t) => t.id === selecionadoId) || null;
  const modalAberto = criandoNovo || Boolean(templateSelecionado);

  return (
    <div className="space-y-4">
      {carregando ? (
        <Card className="rounded-tl-none">
          <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
        </Card>
      ) : (
        <TemplateList
          templates={templates}
          onSelecionar={abrirModal}
          onNovo={() => abrirModal(NOVO)}
          busca={busca}
          onBusca={setBusca}
          filtroCluster={filtroCluster}
          onFiltroCluster={setFiltroCluster}
        />
      )}

      <TemplateFormModal
        open={modalAberto}
        onClose={fecharModal}
        template={templateSelecionado}
        onSalvar={handleSalvar}
        onExcluir={handleExcluir}
        mentionRef={mentionRef}
      />
    </div>
  );
}
