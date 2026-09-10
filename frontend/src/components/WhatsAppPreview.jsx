import { ArrowLeft, BatteryFull, Camera, FileText, Mic, MoreVertical, Paperclip, Phone, Signal, Smile, Video, Wifi } from 'lucide-react';

// Moldura de celular com uma réplica visual do WhatsApp (cores/layout — sem
// nenhum logo/asset oficial, só o padrão visual já bem reconhecível). Só
// decorativo/protótipo: nada aqui manda mensagem de verdade. Componente
// genérico (recebe a mensagem por prop) — usado tanto pela pré-visualização
// da Régua de Cobrança (ReguaCobranca/EtapasTabela.jsx, mensagem de exemplo
// fixa) quanto pela de Comunicação (Comunicacao/TemplateEditor.jsx, texto
// real do template com as variáveis já substituídas).
export default function WhatsAppPreview({ mensagem, contatoNome = 'Financeiro', anexo = false }) {
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[1.75rem] border-[6px] border-gray-900 bg-black shadow-xl">
      <div className="overflow-hidden rounded-[1.25rem]">
        {/* Barra de status — só enfeite */}
        <div className="flex items-center justify-between bg-[#075E54] px-4 pb-1 pt-2 text-[11px] font-medium text-white">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <Signal size={12} />
            <Wifi size={12} />
            <BatteryFull size={13} />
          </div>
        </div>

        {/* Cabeçalho do contato */}
        <div className="flex items-center gap-2.5 bg-[#075E54] px-3 py-2 text-white">
          <ArrowLeft size={18} className="shrink-0 text-white/90" />
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DCF8C6] text-sm font-semibold text-[#075E54]">
            {contatoNome[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium leading-tight">{contatoNome}</p>
            <p className="text-[11px] leading-tight text-white/70">online</p>
          </div>
          <Video size={17} className="shrink-0 text-white/90" />
          <Phone size={15} className="shrink-0 text-white/90" />
          <MoreVertical size={17} className="shrink-0 text-white/90" />
        </div>

        {/* Área de conversa */}
        <div
          className="flex h-[380px] flex-col gap-2 overflow-y-auto px-2.5 py-3"
          style={{
            backgroundColor: '#ECE5DD',
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(0,0,0,0.03) 0, transparent 40%), radial-gradient(circle at 85% 60%, rgba(0,0,0,0.03) 0, transparent 40%)',
          }}
        >
          <div className="flex justify-center">
            <span className="rounded-md bg-[#E1F2FB] px-2.5 py-1 text-[10.5px] text-gray-500 shadow-sm">HOJE</span>
          </div>

          {/* Mensagem recebida (do ponto de vista do cliente lendo) */}
          <div className="relative max-w-[82%] rounded-lg rounded-tl-none bg-white px-2.5 py-2 shadow-sm">
            <p className="whitespace-pre-line text-[13px] leading-snug text-gray-800">{mensagem}</p>
            {anexo && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                <FileText size={16} className="shrink-0 text-red-500" />
                <span className="truncate text-[11.5px] text-gray-600">boleto.pdf</span>
              </div>
            )}
            <div className="mt-1 flex justify-end">
              <span className="text-[10px] text-gray-400">09:41</span>
            </div>
          </div>
        </div>

        {/* Barra de digitação — só visual */}
        <div className="flex items-center gap-2 bg-[#F0F0F0] px-2.5 py-2">
          <Smile size={19} className="shrink-0 text-gray-500" />
          <div className="flex-1 truncate rounded-full bg-white px-3 py-1.5 text-[12.5px] text-gray-400">Mensagem</div>
          <Paperclip size={17} className="shrink-0 rotate-45 text-gray-500" />
          <Camera size={17} className="shrink-0 text-gray-500" />
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white">
            <Mic size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}
