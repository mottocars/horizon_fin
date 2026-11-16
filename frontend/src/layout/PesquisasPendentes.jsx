import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, LogOut, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { formulariosPendentes, responderFormulario } from '../api/formularios.api';
import FormularioResponder from '../pages/Formularios/FormularioResponder';
import { corAlpha } from '../pages/Formularios/tipos';
import '../pages/Formularios/formularios.css';

// Formulários privados (Cadastros › Formulários) que o usuário logado ainda precisa responder:
//   PRIVADO             → janela ao entrar; "Responder depois" fecha só até a próxima entrada (sessionStorage,
//                         limpo no login/logout) — e o botão "Pesquisa pendente" da barra do topo reabre;
//   PRIVADO_OBRIGATORIO → janela sem fechar; o conteúdo da tela nem é montado (AppShell) até responder.
// Um formulário por vez, os obrigatórios primeiro.

export const CHAVE_DISPENSADOS = 'horizon_formularios_dispensados';

function lerDispensados() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_DISPENSADOS) || '[]');
  } catch {
    return [];
  }
}

function gravarDispensados(ids) {
  try {
    sessionStorage.setItem(CHAVE_DISPENSADOS, JSON.stringify(ids));
  } catch {
    // sem armazenamento: a janela só volta a aparecer ao recarregar
  }
}

const Contexto = createContext({ bloqueado: false, adiados: [], reabrir: () => {} });
export const usePesquisasPendentes = () => useContext(Contexto);

export function PesquisasPendentesProvider({ children }) {
  const { user } = useAuth();
  const [pendentes, setPendentes] = useState([]);
  const [dispensados, setDispensados] = useState(lerDispensados);
  const [forcado, setForcado] = useState(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    let vivo = true;
    formulariosPendentes()
      .then((l) => vivo && setPendentes(l))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  const obrigatorio = pendentes.find((f) => f.modalidade === 'PRIVADO_OBRIGATORIO');
  const atual = obrigatorio || (forcado && pendentes.find((f) => f.id === forcado)) || pendentes.find((f) => !dispensados.includes(f.id));
  const adiados = pendentes.filter((f) => f.modalidade === 'PRIVADO' && dispensados.includes(f.id));

  const dispensar = useCallback(
    (id) => {
      const prox = [...new Set([...dispensados, id])];
      setDispensados(prox);
      gravarDispensados(prox);
      setForcado(null);
    },
    [dispensados]
  );

  const concluir = useCallback((id) => {
    setPendentes((l) => l.filter((f) => f.id !== id));
    setForcado(null);
  }, []);

  const reabrir = useCallback((id) => setForcado(id ?? null), []);

  const valor = useMemo(() => ({ bloqueado: Boolean(obrigatorio), adiados, reabrir }), [obrigatorio, adiados, reabrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {atual && <JanelaPesquisa key={atual.id} formulario={atual} restantes={pendentes.length - 1} onDispensar={() => dispensar(atual.id)} onConcluir={() => concluir(atual.id)} />}
    </Contexto.Provider>
  );
}

function JanelaPesquisa({ formulario: f, restantes, onDispensar, onConcluir }) {
  const { logout } = useAuth();
  const obrigatorio = f.modalidade === 'PRIVADO_OBRIGATORIO';
  const cor = f.cor_tema || '#2563eb';

  useEffect(() => {
    if (obrigatorio) return undefined;
    const esc = (e) => e.key === 'Escape' && onDispensar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [obrigatorio, onDispensar]);

  return (
    <div className="form-janela-fundo fixed inset-0 z-[70] flex items-stretch justify-center bg-gray-900/60 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={f.titulo}>
      <div className="form-janela flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: corAlpha(cor, 0.12), color: cor }}>
              {obrigatorio ? <ShieldAlert size={17} /> : <ClipboardList size={17} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {obrigatorio ? 'Pesquisa obrigatória' : 'Pesquisa para você'}
                {f.empresa_nome && <span className="font-normal text-gray-400"> · {f.empresa_nome}</span>}
              </p>
              <p className="truncate text-xs text-gray-500">
                {obrigatorio ? 'Responda para continuar usando o Horizon.' : 'Leva poucos minutos — você também pode responder depois.'}
                {f.anonimo && ' Suas respostas são anônimas.'}
              </p>
            </div>
          </div>
          {obrigatorio ? (
            <button type="button" onClick={logout} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <LogOut size={14} />
              Sair
            </button>
          ) : (
            <button type="button" onClick={onDispensar} title="Responder depois" aria-label="Fechar" className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8" style={{ backgroundColor: corAlpha(cor, 0.07) }}>
          <FormularioResponder
            formulario={f}
            compacto
            onEnviar={(respostas) => responderFormulario(f.id, respostas)}
            rodape={
              !obrigatorio && (
                <button type="button" onClick={onDispensar} className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-white hover:text-gray-800">
                  Responder depois
                </button>
              )
            }
            aposEnviar={
              <button
                type="button"
                onClick={onConcluir}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                style={{ backgroundColor: cor }}
              >
                {restantes > 0 ? 'Próxima pesquisa' : 'Continuar'}
                <ArrowRight size={16} />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}

// Botão da barra do topo: aparece quando há pesquisa adiada ("Responder depois") — reabre a janela.
export function BotaoPesquisasAdiadas() {
  const { adiados, reabrir } = usePesquisasPendentes();
  if (!adiados.length) return null;
  return (
    <button
      type="button"
      onClick={() => reabrir(adiados[0].id)}
      title={adiados.map((f) => f.titulo).join('\n')}
      className="relative flex items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
    >
      <ClipboardList size={15} />
      {adiados.length === 1 ? 'Pesquisa pendente' : `${adiados.length} pesquisas pendentes`}
      <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
      </span>
    </button>
  );
}
