import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, Puzzle, RefreshCw } from 'lucide-react';
import Tabs from '../../components/Tabs';
import SearchableSelect from '../../components/SearchableSelect';
import { listarParceiros } from '../../api/parceiros.api';
import { LogoParceiro } from '../../layout/LojaAplicativos';
import ParceiroModal from './ParceiroModal';
import { OPCOES_STATUS, StatusParceiro, dataHora } from './comum';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';
const ABAS = [{ id: 'parceiros', label: 'Parceiros', icon: Puzzle }];
// Formulário público (api-docs/parceiros/); em dev, o Vite da documentação na 5182.
const URL_FORMULARIO = import.meta.env.DEV ? 'http://localhost:5182/parceiros/' : 'https://api.horizonhub.com.br/parceiros/';

function ResumoVerificacoes({ itens }) {
  if (!itens) return <span className="text-gray-400">Verificando…</span>;
  const atencao = itens.filter((i) => !i.ok).length;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 size={13} />
        {itens.length - atencao} ok
      </span>
      {atencao > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <AlertTriangle size={13} />
          {atencao} atenção
        </span>
      )}
    </span>
  );
}

// Cadastros › Parceiros: as solicitações que chegam pelo formulário "Quero ser um Parceiro" de
// api.horizonhub.com.br (celular já confirmado pelo WhatsApp). Clicar numa linha abre todos os
// dados, as verificações automáticas e as ações (ParceiroModal).
export default function ParceirosPage() {
  const [status, setStatus] = useState('');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [abertoId, setAbertoId] = useState(null);

  const carregar = useCallback(() => {
    setErro('');
    listarParceiros(status || undefined)
      .then(setLista)
      .catch((e) => {
        setLista([]);
        setErro(e.response?.data?.message || 'Não foi possível carregar os parceiros.');
      });
  }, [status]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div>
        <Tabs tabs={ABAS} activeId="parceiros" onChange={() => {}} />
        <div className="rounded-card rounded-tl-none bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Aplicativos parceiros</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Solicitações do formulário{' '}
                <a href={URL_FORMULARIO} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary-600 hover:text-primary-700">
                  Quero ser um Parceiro
                  <ExternalLink size={11} />
                </a>
                . Aprovados aparecem na Loja de aplicativos do topo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-48">
                <SearchableSelect value={status} onChange={(v) => setStatus(v || '')} options={OPCOES_STATUS} placeholder="Todos os status" />
              </div>
              <button
                type="button"
                onClick={carregar}
                title="Atualizar"
                className="rounded-lg bg-primary-600 p-2 text-white transition hover:bg-primary-700"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {erro && <p className="mx-5 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

          {lista === null ? (
            <div className="py-14 text-center text-sm text-gray-400">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Puzzle size={22} />
              </span>
              <p className="text-sm font-medium text-gray-800">{status ? 'Nenhum parceiro com este status.' : 'Nenhuma solicitação ainda.'}</p>
              <p className="mt-1 max-w-md text-xs text-gray-500">
                As solicitações chegam aqui depois que o responsável técnico confirma o código enviado por WhatsApp.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-225 text-left text-xs">
                <thead>
                  <tr className={CABECALHO}>
                    <th className="py-2.5 pl-5 pr-3 font-medium">Aplicativo</th>
                    <th className="py-2.5 pr-3 font-medium">Responsável técnico</th>
                    <th className="py-2.5 pr-3 font-medium">Verificações</th>
                    <th className="py-2.5 pr-3 font-medium">Recebida em</th>
                    <th className="py-2.5 pr-5 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      onClick={() => setAbertoId(p.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setAbertoId(p.id)}
                      className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50"
                    >
                      <td className="max-w-md py-3 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <LogoParceiro id={p.id} nome={p.app_nome} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{p.app_nome}</p>
                            <p className="mt-0.5 line-clamp-1 text-gray-500">{p.app_descricao}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-gray-800">{p.responsavel_nome}</p>
                        <p className="text-gray-500">
                          {p.responsavel_email} · {p.telefone_formatado}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <ResumoVerificacoes itens={p.verificacoes} />
                      </td>
                      <td className="py-3 pr-3 tabular-nums text-gray-600">{dataHora(p.criado_em)}</td>
                      <td className="py-3 pr-5 text-right">
                        <StatusParceiro status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ParceiroModal parceiroId={abertoId} onFechar={() => setAbertoId(null)} onAlterado={carregar} />
    </div>
  );
}
