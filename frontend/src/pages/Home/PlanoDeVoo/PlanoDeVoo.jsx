import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plane, Plus, Search, TriangleAlert, UserRound, Users } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useAuth } from '../../../auth/AuthContext';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listarCards, moverCard } from '../../../api/projetos.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import KanbanBoard from './KanbanBoard';
import CardModal from './CardModal';
import { BUCKETS } from './kanban';

const VISOES = [
  { id: 'minhas', rotulo: 'Minhas atividades', Icone: UserRound, dica: 'Atividades em que você é o responsável' },
  { id: 'equipe', rotulo: 'Atividades da equipe', Icone: Users, dica: 'Atividades que você criou para outras pessoas' },
];

// Home > Plano de Voo: quadro Kanban de atividades (Aguardando, Progresso, Atrasado,
// Finalizado). "Minhas atividades" = sou o responsável; "Atividades da equipe" = criei pra
// outras pessoas e acompanho o andamento. A página rola com o tamanho do quadro (as colunas
// crescem com os cards; nada de rolagem interna).
export default function PlanoDeVoo() {
  const { user } = useAuth();
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();

  const [visao, setVisao] = useState('minhas');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [movendoId, setMovendoId] = useState(null);
  const [modal, setModal] = useState({ aberto: false, cardId: null });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 }).then((r) => setEmpresas(r.data));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaFiltro(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  const opcoesEmpresa = useMemo(
    () =>
      empresas
        .filter((e) => !empresaIds || empresaIds.includes(String(e.id)))
        .map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })),
    [empresas, empresaIds]
  );

  const carregar = useCallback(
    (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      setErro('');
      return listarCards({ visao, empresaId: empresaFiltro })
        .then(setDados)
        .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as atividades.'))
        .finally(() => setCarregando(false));
    },
    [visao, empresaFiltro]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const cardsVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const cards = dados?.cards || [];
    if (!termo) return cards;
    return cards.filter((c) => {
      const resp = dados.usuarios[c.responsavel_id]?.nome || '';
      return `${c.assunto} ${c.descricao || ''} ${c.empresa_nome} ${resp}`.toLowerCase().includes(termo);
    });
  }, [dados, busca]);

  const contagem = useMemo(() => Object.fromEntries(BUCKETS.map((b) => [b.id, cardsVisiveis.filter((c) => c.bucket === b.id).length])), [cardsVisiveis]);
  const total = cardsVisiveis.length;
  const pctFinalizado = total ? Math.round((contagem.FINALIZADO / total) * 100) : 0;

  // Arrastar: atualiza na hora (otimista) e confirma no servidor; se recusar, volta.
  async function mover(card, destino) {
    const anterior = dados;
    setAviso('');
    setMovendoId(card.id);
    setDados((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === card.id ? { ...c, bucket: destino, status: destino, finalizado_em: destino === 'FINALIZADO' ? new Date().toISOString() : null } : c)),
    }));
    try {
      await moverCard(card.id, destino);
      await carregar(true);
    } catch (e) {
      setDados(anterior);
      setAviso(e.response?.data?.message || 'Não foi possível mover a atividade.');
    } finally {
      setMovendoId(null);
    }
  }

  function fecharModal(idCriado) {
    if (idCriado) setModal({ aberto: true, cardId: idCriado });
    else setModal({ aberto: false, cardId: null });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Plane size={22} className="-rotate-12" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Plano de Voo</h1>
              <p className="text-xs text-gray-500">Atividades e projetos em andamento, no quadro Kanban.</p>
            </div>
          </div>

          <div className="inline-flex self-start rounded-xl border border-gray-200 bg-gray-50 p-1 xl:self-auto">
            {VISOES.map(({ id, rotulo, Icone, dica }) => (
              <button
                key={id}
                type="button"
                title={dica}
                onClick={() => setVisao(id)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  visao === id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icone size={16} />
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 lg:flex-row lg:items-end">
          <div className="min-w-0 lg:w-64">
            <label className="mb-1 block text-xs font-medium text-gray-500">Empresa</label>
            <SearchableSelect
              value={empresaFiltro}
              onChange={(v) => setEmpresaFiltro(v || '')}
              options={opcoesEmpresa}
              disabled={empresaTravada}
              placeholder="Todas as empresas"
            />
          </div>
          <div className="min-w-0 flex-1 lg:max-w-sm">
            <label className="mb-1 block text-xs font-medium text-gray-500">Buscar</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Assunto, descrição, empresa ou responsável..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          {/* Resumo por bucket + andamento */}
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            {BUCKETS.map((b) => (
              <span key={b.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${b.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${b.ponto}`} />
                {b.titulo}
                <span className="font-semibold tabular-nums">{contagem[b.id]}</span>
              </span>
            ))}
            {total > 0 && (
              <span className="flex items-center gap-2 pl-1 text-xs text-gray-500">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pctFinalizado}%` }} />
                </span>
                {pctFinalizado}% finalizado
              </span>
            )}
          </div>

          <Button type="button" onClick={() => setModal({ aberto: true, cardId: null })} className="shrink-0">
            <Plus size={16} />
            Nova atividade
          </Button>
        </div>
      </Card>

      {aviso && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <TriangleAlert size={16} className="shrink-0" /> {aviso}
        </div>
      )}

      {erro ? (
        <Card>
          <p className="py-8 text-center text-sm text-red-600">{erro}</p>
        </Card>
      ) : carregando && !dados ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUCKETS.map((b) => (
            <div key={b.id} className="h-64 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {dados?.cards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-5 text-center">
              <p className="text-sm font-medium text-gray-700">
                {visao === 'minhas' ? 'Nenhuma atividade sob sua responsabilidade.' : 'Você ainda não criou atividades para a equipe.'}
              </p>
              <p className="mt-1 text-xs text-gray-400">Clique em "Nova atividade" para criar o primeiro card.</p>
            </div>
          )}
          <KanbanBoard
            cards={cardsVisiveis}
            hoje={dados?.hoje}
            usuarios={dados?.usuarios || {}}
            visao={visao}
            usuarioAtualId={user?.id}
            movendoId={movendoId}
            onAbrir={(id) => setModal({ aberto: true, cardId: id })}
            onMover={mover}
          />
        </>
      )}

      <CardModal
        aberto={modal.aberto}
        cardId={modal.cardId}
        onFechar={fecharModal}
        onAlterado={() => carregar(true)}
        empresas={opcoesEmpresa}
        empresaPadrao={empresaFiltro}
        visao={visao}
        usuarioAtualId={user?.id}
      />
    </div>
  );
}
