import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileText, Paperclip, UploadCloud, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { baixarBoletoParcela, registrarObservacaoHistoricoRegua } from '../../../api/reguaCobrancaHistorico.api';
import { formatarData } from './GestaoParcelas/constantes';

const TAMANHO_MAXIMO_ANEXO = 2 * 1024 * 1024;

// Texto por canal — o mesmo modal serve pra Ligação (sempre manual) e pra
// WhatsApp/E-mail quando "Ativar Comunicação Automática" está desligada
// (ver ConfiguracoesGlobaisPainel.jsx e RotinasTab.jsx).
const TEXTO_POR_CANAL = {
  ligacao: {
    titulo: 'Registrar ligação',
    rotuloObservacao: 'Observação da ligação',
    placeholder: 'O que foi conversado com o cliente (opcional)',
    erro: 'Não foi possível registrar a ligação.',
  },
  whatsapp: {
    titulo: 'Enviar WhatsApp',
    rotuloObservacao: 'Mensagem que será enviada (modelo da etapa — não pode ser alterada)',
    placeholder: '',
    erro: 'Não foi possível enviar o WhatsApp.',
  },
  email: {
    titulo: 'Enviar E-mail',
    rotuloObservacao: 'Mensagem que será enviada (modelo da etapa — não pode ser alterada)',
    placeholder: '',
    erro: 'Não foi possível enviar o e-mail.',
  },
};

// Tipo de Comunicação = 'copiar' (Configurações Globais): o botão Enviar
// vira Copiar — o responsável manda pelo próprio WhatsApp/e-mail.
const TITULO_COPIAR = { whatsapp: 'Copiar WhatsApp', email: 'Copiar E-mail' };

// navigator.clipboard só existe em https/localhost; fora disso cai no
// execCommand antigo, que ainda funciona dentro de um clique.
async function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('copy');
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Aberto ao marcar o check de Ligação (sempre) ou de WhatsApp/E-mail
// (quando a empresa está com "Ativar Comunicação Automática" desligada) na
// Rotina do dia. Ligação pede uma observação livre de quem registra;
// WhatsApp/E-mail são diferentes — o campo já vem preenchido com a
// mensagem de verdade do template desta etapa (`item.mensagem_whatsapp`/
// `item.mensagem_email`, calculada no backend com os dados reais do
// cliente, ver rotinas.service.js) e travado (sem `onChange`, só leitura):
// "Enviar" aqui dispara o envio de verdade (Z-API pro WhatsApp, SMTP da
// integração configurada pro e-mail — ver
// historicoCliente.service.js::registrarObservacao) — o texto mostrado é
// exatamente o que sai, sem chance de alteração nem no front nem no back.
// Em qualquer canal, registra no Histórico de Etapas desta parcela (mesma
// tabela regua_cobranca_historico_registros), na data em que a própria
// etapa foi alcançada (a mesma já mostrada na linha da Rotina).
export default function RegistrarComunicacaoModal({ open, onClose, empresaId, item, canal, clientName, modoCopiar = false, onRegistrado }) {
  const [descricao, setDescricao] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [erro, setErro] = useState('');

  const texto = TEXTO_POR_CANAL[canal] || TEXTO_POR_CANAL.ligacao;
  const ehWhatsapp = canal === 'whatsapp';
  const ehEmail = canal === 'email';
  // Os 2 canais que de fato disparam um envio de verdade (em vez de só
  // registrar uma observação livre) — mesma trava nos dois: mensagem do
  // template, somente leitura, sem anexo manual (ver mais abaixo).
  const canalAutomatizado = ehWhatsapp || ehEmail;
  const mensagemTemplate = ehWhatsapp ? item?.mensagem_whatsapp : ehEmail ? item?.mensagem_email : null;
  const assuntoTemplate = ehEmail ? item?.assunto_email : null;
  const semTemplate = canalAutomatizado && !mensagemTemplate;
  const copiar = modoCopiar && canalAutomatizado;
  const comBoleto = canalAutomatizado && !semTemplate && Boolean(item?.enviar_boleto);
  const [baixandoBoleto, setBaixandoBoleto] = useState(false);
  const [erroBoleto, setErroBoleto] = useState('');
  // Modo copiar: depois do 1º Copiar o envio já está registrado — o modal
  // fica aberto e os cliques seguintes só copiam de novo (sem duplicar o
  // registro no histórico).
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDescricao(canalAutomatizado ? mensagemTemplate || '' : '');
    setArquivos([]);
    setErro('');
    setErroBoleto('');
    setCopiado(false);
  }, [open, item, canal, canalAutomatizado, mensagemTemplate]);

  function handleEscolherArquivos(e) {
    const novos = Array.from(e.target.files || []);
    e.target.value = '';
    const grandes = novos.filter((f) => f.size > TAMANHO_MAXIMO_ANEXO);
    if (grandes.length > 0) {
      setErro(`Arquivo${grandes.length > 1 ? 's' : ''} acima de 2MB: ${grandes.map((f) => f.name).join(', ')}`);
    } else {
      setErro('');
    }
    setArquivos((prev) => [...prev, ...novos.filter((f) => f.size <= TAMANHO_MAXIMO_ANEXO)]);
  }

  function handleRemoverArquivo(nome) {
    setArquivos((prev) => prev.filter((f) => f.name !== nome));
  }

  // Baixa o mesmo boleto que vai anexado na mensagem (buscado na hora no
  // Sienge) — pra quem envia conferir antes, ou mandar por fora. Como a
  // resposta é blob, o erro do backend vem em JSON dentro do blob.
  async function handleBaixarBoleto() {
    setBaixandoBoleto(true);
    setErroBoleto('');
    try {
      const blob = await baixarBoletoParcela(empresaId, item.bill_id, item.installment_id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `boleto-${item.bill_id}-${item.installment_id}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      let mensagem = 'Não foi possível baixar o boleto.';
      try {
        const corpo = JSON.parse(await err.response?.data?.text());
        if (corpo?.message) mensagem = corpo.message;
      } catch {
        // corpo sem JSON legível — fica a mensagem genérica
      }
      setErroBoleto(mensagem);
    } finally {
      setBaixandoBoleto(false);
    }
  }

  // No modo copiar: copia a mensagem e já registra o envio (o check da
  // Rotina acende) — o backend só grava, não dispara nada (ver
  // historicoCliente.service.js::registrarObservacao, `envioManual`).
  async function handleRegistrar() {
    setRegistrando(true);
    setErro('');
    if (copiar) {
      try {
        await copiarTexto(descricao);
      } catch {
        setErro('Não foi possível copiar a mensagem — selecione o texto e copie manualmente.');
        setRegistrando(false);
        return;
      }
      if (copiado) {
        setRegistrando(false);
        return;
      }
    }
    try {
      await registrarObservacaoHistoricoRegua(empresaId, {
        billId: item.bill_id,
        installmentId: item.installment_id,
        dataRegistro: item.data,
        descricao,
        canal,
        arquivos,
      });
      onRegistrado?.();
      if (copiar) setCopiado(true);
      else onClose();
    } catch (err) {
      setErro(err.response?.data?.message || texto.erro);
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={copiar ? TITULO_COPIAR[canal] : texto.titulo} maxWidthClass="max-w-lg">
      {item && (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">{clientName}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {item.etapa_nome} · {formatarData(item.data)}
            </p>
          </div>

          {semTemplate ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Esta etapa não tem um template de {ehWhatsapp ? 'WhatsApp' : 'e-mail'} configurado na Régua de
              Cobrança — configure um antes de enviar.
            </p>
          ) : (
            <>
              {ehEmail && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Assunto (modelo da etapa — não pode ser alterado)
                  </label>
                  <input
                    type="text"
                    value={assuntoTemplate || ''}
                    readOnly
                    className="w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {copiar ? 'Mensagem para enviar (modelo da etapa)' : texto.rotuloObservacao}
                </label>
                <textarea
                  value={descricao}
                  onChange={canalAutomatizado ? undefined : (e) => setDescricao(e.target.value)}
                  readOnly={canalAutomatizado}
                  rows={4}
                  placeholder={texto.placeholder}
                  autoFocus={!canalAutomatizado}
                  className={`w-full resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                    canalAutomatizado
                      ? 'cursor-default border-gray-200 bg-gray-50 text-gray-600'
                      : 'border-gray-200 text-gray-800 focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
                  }`}
                />
              </div>

              {comBoleto && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {copiar ? 'Anexo (baixe e envie junto com a mensagem)' : 'Anexo (enviado junto com a mensagem)'}
                  </label>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-gray-700">
                      <FileText size={16} className="shrink-0 text-red-500" />
                      <span className="truncate">boleto.pdf</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleBaixarBoleto}
                      disabled={baixandoBoleto}
                      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Download size={13} />
                      {baixandoBoleto ? 'Baixando...' : 'Baixar'}
                    </button>
                  </div>
                  {erroBoleto && <p className="mt-1 text-xs text-red-600">{erroBoleto}</p>}
                </div>
              )}
            </>
          )}

          {/* WhatsApp/E-mail nunca mostram o anexo manual: o único anexo
              que sai junto (o boleto) é decidido pelo template da etapa e
              buscado de verdade no Sienge pelo backend (ver
              historicoCliente.service.js::registrarObservacao) — não tem o
              que o usuário escolher aqui. */}
          {!canalAutomatizado && (
            <div>
              <label
                htmlFor="registrar-comunicacao-anexos"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              >
                <UploadCloud size={14} />
                Anexar arquivos (até 2MB cada)
              </label>
              <input
                id="registrar-comunicacao-anexos"
                type="file"
                multiple
                onChange={handleEscolherArquivos}
                className="hidden"
              />
              {arquivos.length > 0 && (
                <div className="mt-2 space-y-1">
                  {arquivos.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Paperclip size={11} className="shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-gray-400">({formatarTamanho(f.size)})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverArquivo(f.name)}
                        className="shrink-0 text-gray-400 hover:text-red-600"
                        title="Remover"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {copiar && !semTemplate && (
            <p className="text-xs text-gray-500">
              Ao clicar em Copiar, a mensagem vai para a área de transferência e o envio fica registrado na Rotina.
              Cole no {ehWhatsapp ? 'WhatsApp' : 'e-mail'} do cliente{comBoleto ? ' e anexe o boleto' : ''}.
            </p>
          )}

          {copiado && (
            <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <Check size={14} className="shrink-0" />
              Mensagem copiada! Cole no {ehWhatsapp ? 'WhatsApp' : 'e-mail'} do cliente.
            </p>
          )}

          {erro && <p className="text-xs text-red-600">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={registrando}>
              {copiado ? 'Fechar' : 'Cancelar'}
            </Button>
            <Button type="button" onClick={handleRegistrar} loading={registrando} disabled={semTemplate}>
              {copiar ? (
                <span className="flex items-center gap-1.5">
                  <Copy size={14} />
                  {copiado ? 'Copiar de novo' : 'Copiar'}
                </span>
              ) : canalAutomatizado ? (
                'Enviar'
              ) : (
                'Registrar'
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
