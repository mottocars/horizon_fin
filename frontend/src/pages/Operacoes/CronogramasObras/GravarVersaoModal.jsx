import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import WhatsAppPreview from '../../../components/WhatsAppPreview';
import { gravarVersaoCronograma } from '../../../api/cronogramaCentros.api';
import { linhasDaObra } from './cronogramaObras';
import LinhaAlteracao from './LinhaAlteracao';
import ResultadoComunicado from './ResultadoComunicado';

// Janela "Gravar versão N" da aba Centros de Custos (versionamento do cronograma — pedido do
// usuário): o que entra no cronograma, uma observação opcional (vai na mensagem), quem recebe e a
// prévia do WhatsApp com a planilha anexa. Gravar aplica as pendências e manda o comunicado; a
// janela mostra o resultado do envio.
export default function GravarVersaoModal({ empresaId, aberto, pendencias, onFechar, onGravada }) {
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(null);

  useEffect(() => {
    if (aberto) {
      setObservacao('');
      setErro('');
      setVersao(null);
    }
  }, [aberto]);

  if (!aberto) return null;
  const { alteracoes, comunicado, proximaVersao } = pendencias;
  const semComunicado = !comunicado.conexao || !comunicado.destinatarios.length;

  async function gravar() {
    setErro('');
    setSalvando(true);
    try {
      setVersao(await gravarVersaoCronograma(empresaId, { observacao: observacao.trim() || null }));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível gravar a versão.');
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    if (salvando) return;
    if (versao) onGravada();
    onFechar();
  }

  // A prévia com a observação digitada (o servidor monta a mensagem sem ela).
  const previa = observacao.trim()
    ? comunicado.previa.replace('\n\n📎', `\n\n📝 _${observacao.trim()}_\n\n📎`)
    : comunicado.previa;

  return (
    <Modal open title={versao ? `Versão ${versao.numero} gravada` : `Gravar versão ${proximaVersao} do cronograma`} onClose={fechar} maxWidthClass="max-w-4xl">
      <div className="overflow-y-auto p-5">
        {versao ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-gray-700">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              As alterações de {alteracoes.length === 1 ? '1 obra entraram' : `${alteracoes.length} obras entraram`} no cronograma.
            </p>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm">
              <ResultadoComunicado comunicado={versao.comunicado} />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">O que entra no cronograma</h3>
                <ul className="mt-2 max-h-64 space-y-2.5 overflow-y-auto rounded-lg border border-gray-100 px-3 py-2.5">
                  {alteracoes.map((obra) => (
                    <li key={obra.sienge_id}>
                      <p className="text-[13px] font-semibold text-gray-900">{obra.nome}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {linhasDaObra(obra).map((l) => (
                          <LinhaAlteracao key={l.chave} linha={l} />
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label htmlFor="obs-versao" className="mb-1 block text-sm font-medium text-gray-700">
                  Observação <span className="font-normal text-gray-400">(opcional — vai na mensagem)</span>
                </label>
                <textarea
                  id="obs-versao"
                  rows={3}
                  maxLength={500}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: reprogramação da obra depois da reunião de planejamento"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                {semComunicado ? (
                  <p className="flex items-start gap-1.5 text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Sem {!comunicado.conexao ? 'conexão de disparo' : 'destinatários'} na aba Configurações: a versão é gravada, mas ninguém
                    recebe o comunicado.
                  </p>
                ) : (
                  <>
                    <p>
                      O comunicado vai por WhatsApp (conexão <b>{comunicado.conexao}</b>) para:
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {comunicado.destinatarios.map((d) => (
                        <li
                          key={d.nome}
                          title={d.semTelefone ? 'Sem telefone no cadastro do usuário — não vai receber' : undefined}
                          className={`rounded-full px-2 py-0.5 ${d.semTelefone ? 'bg-red-50 text-red-600 line-through' : 'bg-white text-gray-700 ring-1 ring-gray-200'}`}
                        >
                          {d.nome}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-gray-400">Com a planilha do cronograma novo anexa e o link do dashboard.</p>
                  </>
                )}
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={fechar} disabled={salvando}>
                  Cancelar
                </Button>
                <Button type="button" onClick={gravar} loading={salvando}>
                  {semComunicado ? 'Gravar versão' : 'Gravar e enviar'}
                </Button>
              </div>
            </div>
            {!semComunicado && comunicado.previa && (
              <div className="hidden md:block">
                <p className="mb-2 text-center text-xs font-medium text-gray-500">Prévia da mensagem</p>
                <WhatsAppPreview mensagem={previa} contatoNome="Horizon Finanças" anexo={comunicado.nomeArquivo} />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
