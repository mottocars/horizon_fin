import { X } from 'lucide-react';

export default function Modal({ open, title, onClose, children, maxWidthClass = 'max-w-md' }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`flex max-h-[90vh] w-full ${maxWidthClass} flex-col rounded-card bg-white shadow-card`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        {/* flex flex-col + min-h-0: sem isso, um `height: 100%` (ou
            `flex-1`) usado por um filho — pra fazer só uma parte do
            conteúdo rolar, não o modal inteiro — não tem efeito, porque
            uma div bloco comum não repassa uma altura "definida" pros
            filhos calcularem porcentagem em cima (mesmo esta div já tendo
            uma altura definida na prática, por ela mesma encolher dentro
            do `max-h-[90vh]` do wrapper). Ver HistoricoEtapasModal.jsx
            pra um caso de uso disso. Não muda nada visualmente pros
            modais que só têm um bloco de conteúdo comum. */}
        <div className="flex min-h-0 flex-col overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
