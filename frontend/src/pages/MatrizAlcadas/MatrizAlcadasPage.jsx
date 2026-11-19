import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Loader2, TriangleAlert, UserCheck } from 'lucide-react';
import Card from '../../components/Card';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { listarMatrizAlcadas, salvarItemMatrizAlcadas } from '../../api/matrizAlcadas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';
import Avatar from '../Home/PlanoDeVoo/Avatar';

const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Cadastros > Matriz de Alçadas (pedido do usuário): por empresa e por classificação, o usuário de cada item.
// Por enquanto: DRE › Aprovador — quem aprova a versão salva da DRE (Operações › DRE Construtoras › Versões);
// só depois da aprovação ela é publicada. Escolheu, gravou (sem botão Salvar). Só aparecem os usuários com
// acesso à empresa e à tela da classificação (backend: modules/matriz-alcadas).
export default function MatrizAlcadasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const empresaId = searchParams.get('empresa_id') || '';
  const trocarEmpresa = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('empresa_id', String(id));
    else next.delete('empresa_id');
    setSearchParams(next, { replace: true });
  };

  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);
  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) trocarEmpresa(empresaIdTravada);
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) trocarEmpresa(empresas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas]);

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(null); // `${classificacao}|${item}`
  const [gravado, setGravado] = useState(null);
  useEffect(() => {
    setDados(null);
    setErro('');
    if (!empresaId) return undefined;
    let ativo = true;
    listarMatrizAlcadas(empresaId)
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível carregar a matriz.'));
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  async function escolher(classificacao, item, usuarioId) {
    const chave = `${classificacao}|${item}`;
    setErro('');
    setGravando(chave);
    try {
      setDados(await salvarItemMatrizAlcadas(empresaId, classificacao, item, usuarioId ? Number(usuarioId) : null));
      setGravado(chave);
      setTimeout(() => setGravado((g) => (g === chave ? null : g)), 2000);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível gravar.');
    } finally {
      setGravando(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="sm:max-w-xs">
          <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
          <SearchableSelect
            value={empresaId}
            onChange={(v) => trocarEmpresa(v || null)}
            disabled={carregandoEmpresas || empresaTravada}
            options={empresas.map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) }))}
            placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
            emptyMessage="Nenhuma empresa encontrada."
          />
        </div>
      </Card>

      {!empresaId ? (
        <Card className="flex min-h-60 flex-col items-center justify-center text-center">
          <UserCheck size={28} className="mb-3 text-gray-300" />
          <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">A matriz de alçadas é por empresa.</p>
        </Card>
      ) : (
        <Card>
          {erro && (
            <p className="mb-3 flex items-center gap-1.5 text-sm text-red-600">
              <TriangleAlert size={15} /> {erro}
            </p>
          )}
          {!dados ? (
            <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
                    <th className="py-2.5 pl-3 pr-3 font-medium">Classificação</th>
                    <th className="py-2.5 pr-3 font-medium">Item</th>
                    <th className="w-80 py-2.5 pr-3 font-medium">Usuário</th>
                    <th className="py-2.5 pr-3 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.classificacoes.flatMap((c) =>
                    c.itens.map((i, n) => {
                      const chave = `${c.id}|${i.id}`;
                      return (
                        <tr key={chave} className="border-b border-gray-100 align-top">
                          <td className="py-3 pl-3 pr-3">
                            {n === 0 && (
                              <>
                                <span className="font-semibold text-gray-900">{c.rotulo}</span>
                                <span className="mt-0.5 block text-xs text-gray-400">{c.descricao}</span>
                              </>
                            )}
                          </td>
                          <td className="py-3 pr-3">
                            <span className="font-medium text-gray-800">{i.rotulo}</span>
                            <span className="mt-0.5 block max-w-sm text-xs text-gray-500">{i.descricao}</span>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              {i.usuario && <Avatar usuario={i.usuario} tamanho="sm" anel={false} />}
                              <div className="min-w-0 flex-1">
                                <SearchableSelect
                                  value={i.usuario ? String(i.usuario.id) : ''}
                                  onChange={(v) => escolher(c.id, i.id, v || null)}
                                  disabled={gravando === chave}
                                  options={c.usuarios.map((u) => ({ value: String(u.id), label: u.nome }))}
                                  placeholder="Ninguém definido"
                                  emptyMessage="Nenhum usuário com acesso a esta empresa e à tela."
                                />
                              </div>
                              <span className="w-4 shrink-0">
                                {gravando === chave ? (
                                  <Loader2 size={15} className="animate-spin text-gray-400" />
                                ) : gravado === chave ? (
                                  <Check size={15} className="text-emerald-600" />
                                ) : null}
                              </span>
                            </div>
                            {!i.usuario && c.id === 'DRE' && i.id === 'APROVADOR' && (
                              <p className="mt-1 text-xs text-amber-700">Sem Aprovador, a versão da DRE é publicada assim que é salva.</p>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-xs text-gray-600">
                            {i.atualizado_em ? (
                              <>
                                <span className="block tabular-nums text-gray-800">{dataHora(i.atualizado_em)}</span>
                                {i.atualizado_por && <span className="text-gray-400">por {i.atualizado_por}</span>}
                              </>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
