import { useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import Modal from './Modal';
import WhatsAppPreview from './WhatsAppPreview';
import EmailPreview from './EmailPreview';

// Pré-visualização de como uma mensagem apareceria de verdade — uma aba
// WhatsApp (aberta por padrão) e uma aba E-mail, cada uma com um mockup bem
// próximo do app original. Componente genérico: quem chama decide o
// conteúdo (mensagem de exemplo fixa, na Régua de Cobrança; texto real do
// template com variáveis já substituídas, em Comunicação).
export default function TemplatePreviewModal({
  open,
  onClose,
  mensagemWhatsApp,
  mensagemEmail,
  assuntoEmail,
  contatoNome,
  anexo = false,
  legenda,
}) {
  const [aba, setAba] = useState('whatsapp');

  return (
    <Modal open={open} onClose={onClose} title="Pré-visualizar mensagem" maxWidthClass="max-w-lg">
      {legenda && <p className="mb-4 text-xs text-gray-500">{legenda}</p>}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setAba('whatsapp')}
          aria-pressed={aba === 'whatsapp'}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
            aba === 'whatsapp' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <MessageCircle size={13} />
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => setAba('email')}
          aria-pressed={aba === 'email'}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
            aba === 'email' ? 'border-primary-100 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Mail size={13} />
          E-mail
        </button>
      </div>

      {aba === 'whatsapp' ? (
        <WhatsAppPreview mensagem={mensagemWhatsApp} contatoNome={contatoNome} anexo={anexo} />
      ) : (
        <EmailPreview assunto={assuntoEmail} mensagem={mensagemEmail} remetenteNome={contatoNome} anexo={anexo} />
      )}
    </Modal>
  );
}
