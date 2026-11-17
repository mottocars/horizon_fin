import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, Mail, Phone, Store, Trash2, User } from 'lucide-react';
import Tabs from '../../components/Tabs';
import Modal from '../../components/Modal';
import { listarLojaAplicativos } from '../../api/parceiros.api';
import { LogoParceiro } from '../../layout/LojaAplicativos';
import { useAplicativosInstalados } from '../../layout/AplicativosInstalados';

const ABAS = [{ id: 'aplicativos', label: 'Aplicativos', icon: Store }];

// Janela do aplicativo: logomarca, nome, descrição, dados do desenvolvedor e Instalar / Desinstalar.
// Instalar só põe o ícone no menu lateral (ele se solta desta janela e voa até lá); a conexão com o
// sistema do parceiro acontece ao abrir o aplicativo pelo menu (pages/LojaAplicativos/AplicativoPage).
function JanelaAplicativo({ app, onFechar, onAlterado }) {
  const { instalar, desinstalar } = useAplicativosInstalados();
  const logoRef = useRef(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setErro('');
    setSalvando(false);
  }, [app?.id]);

  async function alternar() {
    setErro('');
    setSalvando(true);
    try {
      if (app.instalado) {
        await desinstalar(app.id);
        onAlterado(app.id, false);
      } else {
        // A janela fecha quando o ícone se solta dela.
        await instalar(app, { origem: logoRef.current, aoSoltar: onFechar });
        onAlterado(app.id, true);
      }
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível concluir. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const dados = app
    ? [
        { icone: User, rotulo: 'Nome', valor: app.responsavel_nome },
        { icone: Mail, rotulo: 'E-mail', valor: app.responsavel_email, href: `mailto:${app.responsavel_email}` },
        { icone: Phone, rotulo: 'Telefone', valor: app.responsavel_telefone },
      ]
    : [];
  return (
    <Modal open={Boolean(app)} title={app?.nome} onClose={onFechar} maxWidthClass="max-w-lg">
      {app && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <span ref={logoRef} className="block shrink-0">
              <LogoParceiro id={app.id} nome={app.nome} loja className="h-20 w-20" />
            </span>
            <p className="min-w-0 text-sm leading-relaxed text-gray-600">{app.descricao}</p>
          </div>

          <div className="rounded-xl border border-gray-100">
            <p className="border-b border-gray-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Desenvolvedor
            </p>
            <dl className="divide-y divide-gray-100 text-sm">
              {dados.map(({ icone: Icone, rotulo, valor, href }) => (
                <div key={rotulo} className="flex items-center gap-3 px-4 py-2.5">
                  <Icone size={15} className="shrink-0 text-gray-400" />
                  <dt className="w-20 shrink-0 text-gray-500">{rotulo}</dt>
                  <dd className="min-w-0 break-words font-medium text-gray-800">
                    {href ? (
                      <a href={href} className="text-primary-600 hover:text-primary-700">
                        {valor}
                      </a>
                    ) : (
                      valor
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

          <div className="flex justify-end">
            {app.instalado ? (
              <button
                type="button"
                onClick={alternar}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Desinstalar
              </button>
            ) : (
              <button
                type="button"
                onClick={alternar}
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Instalar
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Loja de aplicativos (botão do topo): um card por aplicativo de parceiro aprovado em
// Cadastros › Parceiros. Clicar no card abre a janela do aplicativo.
export default function LojaAplicativosPage() {
  const [apps, setApps] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    listarLojaAplicativos()
      .then(setApps)
      .catch((e) => {
        setApps([]);
        setErro(e.response?.data?.message || 'Não foi possível carregar a loja de aplicativos.');
      });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <Tabs tabs={ABAS} activeId="aplicativos" onChange={() => {}} />
        <div className="rounded-card rounded-tl-none bg-white shadow-card">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Aplicativos dos parceiros</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Clique num aplicativo para ver os detalhes e instalar. Os instalados ficam no fim do menu lateral.
            </p>
          </div>

          {erro && <p className="mx-5 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

          {apps === null ? (
            <div className="py-14 text-center text-sm text-gray-400">Carregando...</div>
          ) : apps.length === 0 ? (
            !erro && (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Store size={22} />
                </span>
                <p className="text-sm font-medium text-gray-800">Nenhum aplicativo disponível por enquanto.</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
              {apps.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAberto(a)}
                  className="flex items-start gap-4 rounded-xl border border-gray-200 p-4 text-left transition hover:border-primary-200 hover:bg-primary-50/40"
                >
                  <LogoParceiro id={a.id} nome={a.nome} loja className="h-14 w-14" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      {a.nome}
                      {a.instalado && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 size={11} />
                          Instalado
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-500">{a.descricao}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <JanelaAplicativo
        app={aberto}
        onFechar={() => setAberto(null)}
        onAlterado={(id, instalado) => {
          setApps((lista) => lista.map((a) => (a.id === id ? { ...a, instalado } : a)));
          setAberto((atual) => (atual?.id === id ? { ...atual, instalado } : atual));
        }}
      />
    </div>
  );
}
