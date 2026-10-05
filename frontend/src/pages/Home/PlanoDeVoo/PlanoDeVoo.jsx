import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plane, TriangleAlert, UserRound, Users } from 'lucide-react';
import Tabs from '../../../components/Tabs';
import { useAuth } from '../../../auth/AuthContext';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listarCards, moverCard } from '../../../api/projetos.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import KanbanBoard from './KanbanBoard';
import CardModal from './CardModal';
import { BUCKETS } from './kanban';

// Mesmo padrão de abas da DRE Gerencial (abas no estilo navegador encaixadas num painel).
const TABS = [
  { id: 'minhas', label: 'Minhas atividades', icon: UserRound },
  { id: 'equipe', label: 'Atividades da equipe', icon: Users },
  { id: 'plano-de-voo', label: 'Plano de voo', icon: Plane },
];

// Home: "Minhas atividades" = sou o responsável; "Atividades da equipe" = criei pra outras
// pessoas e acompanho o andamento. A página rola com o tamanho do quadro.
export default function PlanoDeVoo() {
  const { user } = useAuth();
  const { empresaIds } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const aba = TABS.some((t) => t.id === searchParams.get('aba')) ? searchParams.get('aba') : 'minhas';
  const visao = aba === 'equipe' ? 'equipe' : 'minhas';
  const ehQuadro = aba !== 'plano-de-voo';

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

  const opcoesEmpresa = useMemo(
    () =>
      empresas
        .filter((e) => !empresaIds || empresaIds.includes(String(e.id)))
        .map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })),
    [empresas, empresaIds]
  );

  const carregar = useCallback(
    (silencioso = false) => {
      if (!ehQuadro) return Promise.resolve();
      if (!silencioso) setCarregando(true);
      setErro('');
      return listarCards({ visao })
        .then(setDados)
        .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as atividades.'))
        .finally(() => setCarregando(false));
    },
    [visao, ehQuadro]
  );

  useEffect(() => {
    setDados(null);
    carregar();
  }, [carregar]);

  // Arrastar: atualiza na hora (otimista) e confirma no servidor; se recusar, volta.
  async function mover(card, destino) {
    const anterior = dados;
    setAviso('');
    setMovendoId(card.id);
    setDados((d) => ({
      ...d,
      cards: d.cards.map((c) =>
        c.id === card.id ? { ...c, bucket: destino, status: destino, finalizado_em: destino === 'FINALIZADO' ? new Date().toISOString() : null } : c
      ),
    }));
    try {
      await moverCard(card.id, destino);
      await carregar(true);
    } catch (e) {
      setDados(anterior);
      setAviso(e.response?.data?.message || 'Não foi possível mover a atividade.');
      setTimeout(() => setAviso(''), 6000);
    } finally {
      setMovendoId(null);
    }
  }

  function fecharModal(idCriado) {
    setModal(idCriado ? { aberto: true, cardId: idCriado } : { aberto: false, cardId: null });
  }

  return (
    <div>
      <Tabs tabs={TABS} activeId={aba} onChange={(id) => setSearchParams({ aba: id }, { replace: true })} />

      <div className="rounded-card rounded-tl-none bg-white p-4 shadow-card">
        {!ehQuadro ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-2 text-center">
            <Plane size={26} className="-rotate-12 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">Plano de voo</p>
            <p className="max-w-sm text-xs text-gray-400">Em construção.</p>
          </div>
        ) : (
          <>
            {aviso && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-700">
                <TriangleAlert size={14} className="shrink-0" /> {aviso}
              </p>
            )}

            {erro ? (
              <p className="py-12 text-center text-sm text-red-600">{erro}</p>
            ) : carregando && !dados ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {BUCKETS.map((b) => (
                  <div key={b.id} className="h-56 animate-pulse rounded-xl bg-gray-50" />
                ))}
              </div>
            ) : (
              <KanbanBoard
                cards={dados?.cards || []}
                hoje={dados?.hoje}
                usuarios={dados?.usuarios || {}}
                visao={visao}
                usuarioAtualId={user?.id}
                movendoId={movendoId}
                onAbrir={(id) => setModal({ aberto: true, cardId: id })}
                onMover={mover}
                onAdicionar={() => setModal({ aberto: true, cardId: null })}
              />
            )}
          </>
        )}
      </div>

      <CardModal
        aberto={modal.aberto}
        cardId={modal.cardId}
        onFechar={fecharModal}
        onAlterado={() => carregar(true)}
        empresas={opcoesEmpresa}
        visao={visao}
        usuarioAtualId={user?.id}
      />
    </div>
  );
}
