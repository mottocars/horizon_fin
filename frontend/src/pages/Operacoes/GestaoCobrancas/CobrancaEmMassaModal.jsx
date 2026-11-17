import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Layers } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { previaCobrancaEmMassa, registrarCobrancaEmMassa } from '../../../api/reguaCobrancaHistorico.api';
import { copiarTexto } from './RegistrarComunicacaoModal';
import { formatarData } from './GestaoParcelas/constantes';

const NOME_CANAL = { whatsapp: 'WhatsApp', email: 'e-mail', ligacao: 'ligação' };
const TITULO_CANAL = { whatsapp: 'Cobrança em massa · WhatsApp', email: 'Cobrança em massa · E-mail', ligacao: 'Ligação em massa' };

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Aberto ao soltar o botão depois de arrastar na coluna de um canal da Rotina
// (ver RotinasTab.jsx::iniciarArraste) com 2 ou mais títulos do mesmo
// cliente. Mostra quais títulos e parcelas vão ser cobrados juntos e a
// mensagem (template fixo de "Comunicação em massa" da aba Comunicação, com
// os dados reais — montada no backend, sem boleto). Enviar = 1 mensagem só
// + 1 registro no Histórico de Etapas por linha selecionada, como um envio
// normal daquele canal. Ligação: 1 observação aplicada a todos os títulos.
// No Tipo de Comunicação "copiar", o botão copia a mensagem e registra.
export default function CobrancaEmMassaModal({ open, onClose, empresaId, canal, itens, clientName, onRegistrado }) {
  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [observacao, setObservacao] = useState('');
  const [concluido, setConcluido] = useState(null);

  const ehLigacao = canal === 'ligacao';

  useEffect(() => {
    if (!open || !itens?.length) return;
    let ativo = true;
    setPrevia(null);
    setErro('');
    setObservacao('');
    setConcluido(null);
    setCarregando(true);
    previaCobrancaEmMassa(empresaId, { canal, itens: paraApi(itens) })
      .then((r) => ativo && setPrevia(r))
      .catch((err) => ativo && setErro(err.response?.data?.message || 'Não foi possível montar a cobrança em massa.'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [open, empresaId, canal, itens]);

  async function handleEnviar() {
    setEnviando(true);
    setErro('');
    if (previa?.copiar) {
      try {
        await copiarTexto(previa.mensagem || '');
      } catch {
        setErro('Não foi possível copiar a mensagem — selecione o texto e copie manualmente.');
        setEnviando(false);
        return;
      }
    }
    try {
      const r = await registrarCobrancaEmMassa(empresaId, { canal, itens: paraApi(itens), observacao: ehLigacao ? observacao : undefined });
      setConcluido(r);
      onRegistrado?.();
    } catch (err) {
      setErro(err.response?.data?.message || `Não foi possível concluir a cobrança em massa por ${NOME_CANAL[canal]}.`);
    } finally {
      setEnviando(false);
    }
  }

  const bloqueado = !previa || previa.avisos.length > 0;
  const rotuloBotao = ehLigacao ? 'Registrar ligação' : previa?.copiar ? 'Copiar e registrar' : 'Enviar';

  return (
    <Modal open={open} onClose={onClose} title={TITULO_CANAL[canal] || 'Cobrança em massa'} maxWidthClass="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-900">{previa?.cliente.nome || clientName}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
            <Layers size={12} className="shrink-0" />
            {itens?.length || 0} títulos selecionados em massa para uma cobrança única
            {previa?.centro_custo ? ` · ${previa.centro_custo}` : ''}
          </p>
        </div>

        {carregando && <div className="py-6 text-center text-sm text-gray-400">Montando a cobrança...</div>}

        {previa && (
          <>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                {concluido ? 'Títulos cobrados juntos' : 'Títulos que serão cobrados juntos'}
              </label>
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Título / Parcela</th>
                      <th className="px-3 py-1.5 text-center font-medium">Vencimento</th>
                      <th className="px-3 py-1.5 text-right font-medium">Valor em aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.titulos.map((t) => (
                      <tr key={`${t.bill_id}-${t.installment_id}`} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 tabular-nums text-gray-700">{t.titulo}</td>
                        <td className="px-3 py-1.5 text-center text-gray-500">{formatarData(t.vencimento)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{formatarMoeda(t.valor)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                      <td className="px-3 py-1.5" colSpan={2}>
                        Total · {previa.quantidade_titulos} {previa.quantidade_titulos === 1 ? 'parcela' : 'parcelas'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(previa.valor_total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {ehLigacao ? (
              !concluido && (
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Observação da ligação</label>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="O que foi conversado com o cliente (opcional) — vale para todos os títulos acima"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              )
            ) : (
              <>
                {canal === 'email' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Assunto</label>
                    <input
                      type="text"
                      value={previa.assunto || ''}
                      readOnly
                      className="w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Mensagem (template Comunicação em massa — sem boleto)
                  </label>
                  <textarea
                    value={previa.mensagem || ''}
                    readOnly
                    rows={9}
                    className="w-full cursor-default resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 focus:outline-none"
                  />
                </div>
              </>
            )}

            {previa.avisos.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {previa.avisos.map((a) => (
                  <p key={a} className="flex items-start gap-1.5">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    {a}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {concluido && (
          <p className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} className="mt-px shrink-0" />
            <span>
              {ehLigacao
                ? 'Ligação registrada em todos os títulos: '
                : concluido.copiar
                  ? `Mensagem copiada — cole no ${NOME_CANAL[canal]} do cliente. Cobrança registrada nos títulos: `
                  : `Cobrança única enviada por ${NOME_CANAL[canal]}. Títulos cobrados juntos: `}
              <b className="font-semibold">{concluido.titulos.join(', ')}</b>.
            </span>
          </p>
        )}

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          {concluido ? (
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleEnviar} loading={enviando} disabled={bloqueado}>
                {previa?.copiar && !ehLigacao ? (
                  <span className="flex items-center gap-1.5">
                    <Copy size={14} />
                    {rotuloBotao}
                  </span>
                ) : (
                  rotuloBotao
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function paraApi(itens) {
  return itens.map((i) => ({ bill_id: i.bill_id, installment_id: i.installment_id, data_registro: i.data }));
}
