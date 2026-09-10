import { useEffect, useState } from 'react';
import { Eye, Save, Trash2 } from 'lucide-react';
import Modal from '../../../../components/Modal';
import TemplatePreviewModal from '../../../../components/TemplatePreviewModal';
import MentionTextarea from './MentionTextarea';
import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR, CLUSTER_TAB_ATIVA, VARS, substituirVariaveis } from './constantes';

const VAZIO = { nome: '', descricao: '', assunto: '', corpo: '', enviar_boleto: false, clusters: [] };

function Switch({ ativo, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={ativo}
      className={`relative h-[19px] w-[34px] shrink-0 rounded-full border transition-colors ${
        ativo ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-gray-100'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow transition-all ${
          ativo ? 'left-[17px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

// Janela de criar/editar 1 template. Diferente do resto da tela de Régua de
// Cobrança (que salva cada campo sozinho), aqui as mudanças ficam num
// rascunho local até clicar em "Salvar template" — o botão só habilita
// quando nome, assunto, corpo e pelo menos 1 cluster estão preenchidos.
// Fechar sem salvar descarta o rascunho (não existe autosave aqui).
// `template` nulo = criando um novo (nada gravado ainda); `onSalvar`
// decide, no pai, se é POST (criação) ou PUT (edição) — ver
// ComunicacaoTab.jsx::handleSalvar.
export default function TemplateFormModal({ open, onClose, template, onSalvar, onExcluir, mentionRef }) {
  const [draft, setDraft] = useState(VAZIO);
  const [previewAberto, setPreviewAberto] = useState(false);

  useEffect(() => {
    if (open) setDraft(template ? { ...VAZIO, ...template } : VAZIO);
  }, [open, template]);

  function campo(chave, valor) {
    setDraft((d) => ({ ...d, [chave]: valor }));
  }

  const valido = draft.nome.trim() && draft.assunto.trim() && draft.corpo.trim() && draft.clusters.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={draft.nome || 'Novo template'} maxWidthClass="max-w-3xl">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Coluna 1: identificação do template */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Nome do template</label>
            <input
              type="text"
              value={draft.nome}
              onChange={(e) => campo('nome', e.target.value)}
              placeholder="Ex.: Lembrete cordial com boleto"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Descrição</label>
            <input
              type="text"
              value={draft.descricao}
              onChange={(e) => campo('descricao', e.target.value)}
              placeholder="Quando usar este template e qual o tom"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Assunto</label>
            <input
              type="text"
              value={draft.assunto}
              onChange={(e) => campo('assunto', e.target.value)}
              placeholder="Assunto do e-mail"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400">Usado apenas no envio por e-mail. WhatsApp e ligação ignoram este campo.</p>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Anexo</label>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2.5">
              <Switch
                ativo={draft.enviar_boleto}
                label="Enviar boleto junto com a mensagem"
                onClick={() => campo('enviar_boleto', !draft.enviar_boleto)}
              />
              <strong className="text-[13px] font-medium text-gray-900">Enviar boleto junto com a mensagem</strong>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Clusters</label>
            <div className="flex flex-wrap gap-1.5">
              {CLUSTERS.map((c) => {
                const ativo = draft.clusters.includes(c.id);
                const Icone = CLUSTER_ICON[c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={ativo}
                    title={c.nome}
                    onClick={() =>
                      campo('clusters', ativo ? draft.clusters.filter((id) => id !== c.id) : [...draft.clusters, c.id])
                    }
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      ativo ? CLUSTER_TAB_ATIVA[c.id] : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Icone size={12} className={ativo ? '' : CLUSTER_ICON_COR[c.id]} />
                    {c.nome}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Coluna 2: corpo da mensagem — cresce até a altura da coluna 1,
            pra ficar proporcional em vez de sobrar espaço em branco. */}
        <div className="flex min-h-0 flex-col">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Corpo da mensagem</label>

          {/* Variáveis em chip, compactas de propósito (a versão em cartão
              não cabia sem rolar) — clicar insere no cursor, igual ao "@". */}
          <div className="mb-1.5 flex flex-wrap gap-1">
            {VARS.map((v) => (
              <button
                key={v.chave}
                type="button"
                title={`${v.rotulo} — ex.: ${v.exemplo}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  mentionRef.current?.inserirVariavel(v.chave);
                }}
                className="rounded-full border border-gray-200 px-2 py-0.5 font-mono text-[10.5px] text-primary-600 hover:border-primary-100 hover:bg-primary-50"
              >
                @{v.chave}
              </button>
            ))}
          </div>

          <MentionTextarea
            ref={mentionRef}
            value={draft.corpo}
            onChange={(v) => campo('corpo', v)}
            wrapperClassName="flex min-h-[220px] flex-1 flex-col"
            className="h-full w-full flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary-100"
          />
          <p className="mt-1 text-xs text-gray-400">
            Digite <b className="font-medium text-gray-600">@</b> pra filtrar, ou clique numa das variáveis acima.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewAberto(true)}
            className="flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <Eye size={14} />
            Pré-visualizar
          </button>
          {template && (
            <button
              type="button"
              onClick={() => onExcluir(template.id)}
              className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
              Excluir
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={!valido}
          title={valido ? '' : 'Preencha nome, assunto, corpo da mensagem e pelo menos 1 cluster'}
          onClick={() => onSalvar(template?.id ?? null, draft)}
          className="flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          <Save size={13} />
          Salvar template
        </button>
      </div>

      <TemplatePreviewModal
        open={previewAberto}
        onClose={() => setPreviewAberto(false)}
        mensagemWhatsApp={substituirVariaveis(draft.corpo)}
        mensagemEmail={substituirVariaveis(draft.corpo)}
        assuntoEmail={substituirVariaveis(draft.assunto)}
        anexo={draft.enviar_boleto}
      />
    </Modal>
  );
}
