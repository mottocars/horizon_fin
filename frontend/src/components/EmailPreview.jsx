import { Archive, ArrowLeft, Clock, CornerUpLeft, CornerUpRight, MoreVertical, Paperclip, Star, Trash2 } from 'lucide-react';

// Painel de leitura de e-mail, estilo cliente de e-mail comum (Gmail/Apple
// Mail) — sem logo/marca de ninguém, só o padrão visual (barra de ações,
// remetente com avatar, assunto, corpo) que já é bem reconhecível. Só
// decorativo/protótipo: nada aqui manda e-mail de verdade. Componente
// genérico (recebe assunto/mensagem por prop) — ver WhatsAppPreview.jsx
// pro mesmo raciocínio de reaproveitamento entre Régua e Comunicação.
export default function EmailPreview({ assunto, mensagem, remetenteNome = 'Financeiro', anexo = false }) {
  const dominio = remetenteNome.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Barra de ações — só enfeite */}
      <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2.5 text-gray-400">
        <ArrowLeft size={16} />
        <div className="flex flex-1 items-center gap-4">
          <Archive size={16} />
          <Trash2 size={16} />
          <Clock size={16} />
        </div>
        <MoreVertical size={16} />
      </div>

      {/* Assunto */}
      <div className="px-5 pt-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-normal leading-snug text-gray-900">{assunto || '(sem assunto)'}</h3>
          <Star size={16} className="mt-1 shrink-0 text-gray-300" />
        </div>
        <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-[10.5px] text-gray-500">Caixa de entrada</span>
      </div>

      {/* Remetente */}
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-medium text-white">
          {remetenteNome[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-medium text-gray-900">
              {remetenteNome} <span className="font-normal text-gray-400">&lt;financeiro@{dominio}.com.br&gt;</span>
            </p>
            <p className="shrink-0 text-[11px] text-gray-400">09:41</p>
          </div>
          <p className="text-[11.5px] text-gray-400">para mim</p>
        </div>
      </div>

      {/* Corpo */}
      <div className="whitespace-pre-line px-5 text-[13px] leading-relaxed text-gray-700">{mensagem}</div>

      {anexo && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
          <Paperclip size={14} className="shrink-0 text-gray-400" />
          <span className="text-[12px] text-gray-600">boleto.pdf</span>
        </div>
      )}

      {/* Ações de resposta — só enfeite */}
      <div className="mt-4 flex gap-2 border-t border-gray-100 px-5 py-3">
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs text-gray-500"
        >
          <CornerUpLeft size={13} />
          Responder
        </button>
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs text-gray-500"
        >
          <CornerUpRight size={13} />
          Encaminhar
        </button>
      </div>
    </div>
  );
}
