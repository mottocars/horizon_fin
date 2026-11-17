import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Check, CheckCircle2, Copy, KeyRound, Loader2, Play, RefreshCw, ShieldCheck, X } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Interruptor from '../../components/Interruptor';
import { useConfirm } from '../../confirm/ConfirmContext';
import { LogoParceiro } from '../../layout/LojaAplicativos';
import { StatusParceiro, dataHora } from './comum';
import {
  aprovarParceiro,
  definirPermissoesParceiro,
  novoSecretParceiro,
  obterParceiro,
  reativarParceiro,
  recusarParceiro,
  suspenderParceiro,
  verificarParceiro,
} from '../../api/parceiros.api';

const ROTULO = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const BLOCO = 'rounded-xl border border-gray-200';

const EVENTOS = {
  SOLICITADO: 'Solicitação recebida',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  SUSPENSO: 'Suspenso',
  REATIVADO: 'Reativado',
  SECRET_TEMPORARIO: 'client_secret temporário gerado',
  SECRET_OFICIAL: 'client_secret oficial gerado',
  WHATSAPP_FALHOU: 'WhatsApp não enviado',
  PERMISSOES: 'Permissões alteradas',
};

function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* sem permissão: seleciona e copia na mão */
        }
      }}
      className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  );
}

function Campo({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <p className={ROTULO}>{rotulo}</p>
      <div className="mt-0.5 text-sm text-gray-800">{children}</div>
    </div>
  );
}

function Url({ url }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate font-mono text-[12.5px] text-primary-600 hover:text-primary-700"
      >
        {url}
      </a>
      <BotaoCopiar texto={url} />
    </span>
  );
}

function Bloco({ titulo, subtitulo, acao, children }) {
  return (
    <section className={BLOCO}>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
        </div>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

// Motivo (recusa/suspensão) ou opção do novo client_secret: uma janelinha por cima do detalhe.
function JanelaAcao({ acao, parceiro, onCancelar, onConfirmar, enviando }) {
  const [motivo, setMotivo] = useState('');
  const [revogar, setRevogar] = useState(false);
  if (!acao) return null;
  const textos = {
    recusar: {
      titulo: 'Recusar solicitação',
      texto: 'O responsável recebe um aviso por WhatsApp com o motivo (se informado).',
      botao: 'Recusar',
      variante: 'danger',
    },
    suspender: {
      titulo: 'Suspender parceiro',
      texto: 'O aplicativo sai da Loja de aplicativos e o parceiro não consegue gerar o client_secret oficial até ser reativado.',
      botao: 'Suspender',
      variante: 'danger',
    },
    novoSecret: {
      titulo: 'Novo client_secret temporário',
      texto: `Um client_secret temporário novo (vale 6 dias, uso único) vai por WhatsApp para ${parceiro.telefone_formatado}. O parceiro usa ele para gerar um client_secret oficial novo. O temporário anterior deixa de valer.`,
      botao: 'Gerar e enviar',
      variante: 'primary',
    },
  }[acao];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">{textos.titulo}</h3>
          <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-600">{textos.texto}</p>
        {acao === 'novoSecret' ? (
          parceiro.secret_oficial_gerado_em && (
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={revogar}
                onChange={(e) => setRevogar(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-red-600"
              />
              <span>
                Revogar já o client_secret oficial atual
                <span className="block text-xs text-gray-500">
                  Use se ele vazou. Sem marcar, o oficial atual continua valendo até o parceiro gerar o novo.
                </span>
              </span>
            </label>
          )
        ) : (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo (opcional)</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant={textos.variante} loading={enviando} onClick={() => onConfirmar({ motivo: motivo.trim(), revogar })}>
            {textos.botao}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Resultado da aprovação / novo client_secret / recusa: WhatsApp enviado ou, se falhou, as
// credenciais para repassar por outro meio (aparecem só nesse caso, uma vez).
function Resultado({ resultado, onFechar }) {
  if (!resultado) return null;
  const { whatsapp, credenciais } = resultado;
  if (whatsapp?.enviado) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={16} />
          {resultado.mensagem} Enviado por WhatsApp para {whatsapp.telefone}.
        </span>
        <button type="button" onClick={onFechar} className="text-emerald-600 hover:text-emerald-800">
          <X size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle size={16} />
          {resultado.mensagem} Mas o WhatsApp não foi enviado: {whatsapp?.erro}
        </p>
        <button type="button" onClick={onFechar} className="text-amber-600 hover:text-amber-800">
          <X size={15} />
        </button>
      </div>
      {credenciais && (
        <div className="mt-2 space-y-1.5 rounded-md bg-white/70 p-2.5">
          <p className="text-xs">Repasse ao responsável por outro meio seguro. Estas credenciais não aparecem de novo:</p>
          {[
            ['client_id', credenciais.client_id],
            ['client_secret temporário', credenciais.client_secret_temporario],
          ].map(([r, v]) => (
            <div key={r} className="flex items-center gap-2">
              <span className="w-44 shrink-0 text-xs text-amber-800">{r}</span>
              <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-gray-900">{v}</code>
              <BotaoCopiar texto={v} />
            </div>
          ))}
          <p className="text-xs">Vale até {dataHora(credenciais.expira_em)}.</p>
        </div>
      )}
    </div>
  );
}

function SituacaoSecret({ p }) {
  let temporario;
  if (!p.secret_temporario_gerado_em) temporario = <span className="text-gray-400">—</span>;
  else if (p.secret_temporario_usado_em)
    temporario = <span className="text-gray-600">Usado em {dataHora(p.secret_temporario_usado_em)}</span>;
  else if (p.secret_temporario_vencido)
    temporario = <span className="text-amber-700">Venceu em {dataHora(p.secret_temporario_expira_em)} sem uso</span>;
  else temporario = <span className="text-gray-700">Aguardando uso · vale até {dataHora(p.secret_temporario_expira_em)}</span>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Campo rotulo="client_id">
          <span className="flex items-center gap-1">
            <code className="break-all font-mono text-[12.5px]">{p.client_id}</code>
            <BotaoCopiar texto={p.client_id} />
          </span>
        </Campo>
      </div>
      <Campo rotulo="client_secret temporário">{temporario}</Campo>
      <Campo rotulo="client_secret oficial">
        {p.secret_oficial_gerado_em ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <ShieldCheck size={14} />
            Gerado em {dataHora(p.secret_oficial_gerado_em)}
          </span>
        ) : (
          <span className="text-amber-700">Ainda não gerado pelo parceiro</span>
        )}
      </Campo>
    </div>
  );
}

// Detalhe de um parceiro (Cadastros › Parceiros): dados enviados, verificações automáticas,
// credenciais, histórico e as ações conforme o status.
export default function ParceiroModal({ parceiroId, onFechar, onAlterado }) {
  const confirm = useConfirm();
  const [p, setP] = useState(null);
  const [erro, setErro] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [acao, setAcao] = useState(null); // 'recusar' | 'suspender' | 'novoSecret'
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const carregar = useCallback(() => {
    if (!parceiroId) return Promise.resolve();
    return obterParceiro(parceiroId)
      .then(setP)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir o parceiro.'));
  }, [parceiroId]);

  useEffect(() => {
    setP(null);
    setErro('');
    setResultado(null);
    setAcao(null);
    carregar();
  }, [carregar]);

  const verificar = useCallback(async () => {
    setVerificando(true);
    try {
      const r = await verificarParceiro(parceiroId);
      setP((atual) => ({
        ...atual,
        verificacoes: r.verificacoes,
        verificado_em: new Date().toISOString(),
      }));
      onAlterado?.();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível rodar as verificações.');
    } finally {
      setVerificando(false);
    }
  }, [parceiroId, onAlterado]);

  // Ainda sem verificações (acabou de chegar): roda na hora.
  useEffect(() => {
    if (p && p.id === parceiroId && !p.verificacoes && !verificando) verificar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  async function executar(fn, mensagem) {
    setEnviando(true);
    setErro('');
    try {
      const r = await fn();
      setAcao(null);
      setResultado(r?.whatsapp ? { ...r, mensagem } : null);
      await carregar();
      onAlterado?.();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível concluir a ação.');
    } finally {
      setEnviando(false);
    }
  }

  async function aprovar() {
    const atencao = (p.verificacoes || []).filter((i) => !i.ok).length;
    const ok = await confirm({
      title: 'Aprovar parceiro',
      description: `Aprovar "${p.app_nome}"? O client_id e o client_secret temporário (vale 6 dias) vão por WhatsApp para ${p.telefone_formatado}, e o aplicativo entra na Loja de aplicativos.${
        atencao ? ` Há ${atencao} ${atencao === 1 ? 'verificação' : 'verificações'} em atenção.` : ''
      }`,
      confirmLabel: 'Aprovar',
    });
    if (ok) executar(() => aprovarParceiro(p.id), 'Parceiro aprovado e credenciais geradas.');
  }

  async function reativar() {
    const ok = await confirm({
      title: 'Reativar parceiro',
      description: `Reativar "${p.app_nome}"? Ele volta para a Loja de aplicativos. As credenciais continuam as mesmas.`,
      confirmLabel: 'Reativar',
    });
    if (ok) executar(() => reativarParceiro(p.id));
  }

  function confirmarAcao({ motivo, revogar }) {
    if (acao === 'recusar') executar(() => recusarParceiro(p.id, motivo), 'Solicitação recusada.');
    else if (acao === 'suspender') executar(() => suspenderParceiro(p.id, motivo));
    else if (acao === 'novoSecret') executar(() => novoSecretParceiro(p.id, revogar), 'Novo client_secret temporário gerado.');
  }

  async function alternarPermissao(chave, ligado) {
    setErro('');
    try {
      setP(await definirPermissoesParceiro(p.id, { [chave]: ligado }));
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível alterar a permissão.');
    }
  }

  const titulo = p ? `Solicitação #${p.id}` : 'Parceiro';

  return (
    <Modal open={Boolean(parceiroId)} title={titulo} onClose={onFechar} maxWidthClass="max-w-6xl">
      {!p ? (
        <div className="py-14 text-center text-sm text-gray-400">{erro || 'Carregando...'}</div>
      ) : (
        <div className="space-y-4">
          {/* Cabeçalho: logo + nome + status + ações */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <LogoParceiro id={p.id} nome={p.app_nome} xadrez className="h-16 w-16" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{p.app_nome}</h2>
                  <StatusParceiro status={p.status} />
                </div>
                <p className="mt-0.5 text-xs text-gray-500">Recebida em {dataHora(p.criado_em)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {['EM_ANALISE', 'RECUSADO'].includes(p.status) && (
                <>
                  {p.status === 'EM_ANALISE' && (
                    <Button variant="secondary" onClick={() => setAcao('recusar')} disabled={enviando}>
                      <X size={15} />
                      Recusar
                    </Button>
                  )}
                  <Button onClick={aprovar} loading={enviando}>
                    <Check size={15} />
                    Aprovar
                  </Button>
                </>
              )}
              {p.status === 'APROVADO' && (
                <>
                  <Button variant="secondary" onClick={() => setAcao('suspender')} disabled={enviando}>
                    <Ban size={15} />
                    Suspender
                  </Button>
                  <Button variant="secondary" onClick={() => setAcao('novoSecret')} disabled={enviando}>
                    <KeyRound size={15} />
                    Novo client_secret temporário
                  </Button>
                </>
              )}
              {p.status === 'SUSPENSO' && (
                <Button onClick={reativar} loading={enviando}>
                  <Play size={15} />
                  Reativar
                </Button>
              )}
            </div>
          </div>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
          <Resultado resultado={resultado} onFechar={() => setResultado(null)} />
          {p.motivo && ['RECUSADO', 'SUSPENSO'].includes(p.status) && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span className="font-medium">Motivo {p.status === 'RECUSADO' ? 'da recusa' : 'da suspensão'}:</span> {p.motivo}
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Bloco titulo="Aplicativo">
                <div className="space-y-3">
                  <Campo rotulo="Nome">{p.app_nome}</Campo>
                  <Campo rotulo="Descrição">{p.app_descricao}</Campo>
                  <Campo rotulo="URL de abertura">
                    <Url url={p.url_abertura} />
                  </Campo>
                  <Campo rotulo="URL de retorno / callback">
                    <Url url={p.url_callback} />
                  </Campo>
                  <Campo rotulo="Logomarca">
                    <span className="text-gray-600">
                      PNG · {p.logo_largura}×{p.logo_altura} px · {Math.max(1, Math.round((p.logo_tamanho || 0) / 1024))} KB
                    </span>
                  </Campo>
                </div>
              </Bloco>
              <Bloco
                titulo="Permissões dentro do Horizon"
                subtitulo="O que o aplicativo pode pedir ao navegador quando abre dentro do Horizon. O navegador ainda pergunta ao usuário."
              >
                <Interruptor
                  ligado={(p.permissoes || []).includes('localizacao')}
                  onChange={(ligado) => alternarPermissao('localizacao', ligado)}
                  rotulo="Localização"
                  descricao="Libere só para quem precisa: o navegador guarda o “permitir” em nome do Horizon, não do aplicativo."
                />
              </Bloco>
              <Bloco titulo="Responsável técnico">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo rotulo="Nome">{p.responsavel_nome}</Campo>
                  <Campo rotulo="E-mail">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{p.responsavel_email}</span>
                      <BotaoCopiar texto={p.responsavel_email} />
                    </span>
                  </Campo>
                  <Campo rotulo="Celular (WhatsApp)">
                    <span className="inline-flex items-center gap-1.5">
                      {p.telefone_formatado}
                      {p.telefone_confirmado_em && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-emerald-700">
                          <CheckCircle2 size={12} />
                          confirmado
                        </span>
                      )}
                    </span>
                  </Campo>
                </div>
              </Bloco>
              {p.client_id && (
                <Bloco titulo="Credenciais" subtitulo="O Horizon guarda só o hash dos client_secret: eles não podem ser vistos aqui.">
                  <SituacaoSecret p={p} />
                </Bloco>
              )}
            </div>

            <div className="space-y-4">
              <Bloco
                titulo="Verificações automáticas"
                subtitulo={p.verificado_em ? `Feitas em ${dataHora(p.verificado_em)}` : 'Ainda não feitas'}
                acao={
                  <button
                    type="button"
                    onClick={verificar}
                    disabled={verificando}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={verificando ? 'animate-spin' : ''} />
                    Verificar de novo
                  </button>
                }
              >
                {!p.verificacoes ? (
                  <p className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 size={15} className="animate-spin" />
                    Verificando as URLs e a logomarca…
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {p.verificacoes.map((v) => (
                      <li key={v.id} className="flex gap-2.5">
                        {v.ok ? (
                          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-500" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {v.titulo}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase ${
                                v.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {v.ok ? 'ok' : 'atenção'}
                            </span>
                          </p>
                          <p className="mt-0.5 break-words text-xs text-gray-500">{v.detalhe}</p>
                          {v.informativo && !v.ok && (
                            <p className="mt-0.5 text-xs text-gray-400">Não bloqueia a aprovação — é um sinal de confiança.</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Bloco>

              <Bloco titulo="Histórico">
                <ul className="space-y-2.5">
                  {p.eventos.map((e) => (
                    <li key={e.id} className="text-xs">
                      <p className="text-gray-800">
                        <span className="font-semibold">{EVENTOS[e.tipo] || e.tipo}</span>
                        <span className="text-gray-400">
                          {' '}
                          · {dataHora(e.criado_em)}
                          {e.usuario_nome ? ` · ${e.usuario_nome}` : ''}
                        </span>
                      </p>
                      {e.detalhe && <p className="mt-0.5 text-gray-500">{e.detalhe}</p>}
                    </li>
                  ))}
                </ul>
              </Bloco>
            </div>
          </div>
        </div>
      )}
      <JanelaAcao
        key={acao || 'nenhuma'}
        acao={acao}
        parceiro={p || {}}
        enviando={enviando}
        onCancelar={() => setAcao(null)}
        onConfirmar={confirmarAcao}
      />
    </Modal>
  );
}
