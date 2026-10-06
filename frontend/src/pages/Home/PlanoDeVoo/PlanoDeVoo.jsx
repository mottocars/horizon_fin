import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plane, TriangleAlert, UserRound, Users } from 'lucide-react';
import Tabs from '../../../components/Tabs';
import { useAuth } from '../../../auth/AuthContext';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { finalizarCard, listarCards, listarPlanos, moverCard } from '../../../api/projetos.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import KanbanBoard from './KanbanBoard';
import CardModal from './CardModal';
import PlanosLista from './PlanosLista';
import PlanoGantt from './PlanoGantt';
import PlanoFormModal from './PlanoFormModal';
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
  const planoAberto = !ehQuadro && Number(searchParams.get('plano')) ? Number(searchParams.get('plano')) : null;

  const [empresas, setEmpresas] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [movendoId, setMovendoId] = useState(null);
  const [finalizandoId, setFinalizandoId] = useState(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [modal, setModal] = useState({ aberto: false, cardId: null, inicialPlano: null });
  // aba "Plano de voo"
  const [planos, setPlanos] = useState(null);
  const [erroPlanos, setErroPlanos] = useState('');
  const [planoForm, setPlanoForm] = useState({ aberto: false, plano: null });
  const [ganttToken, setGanttToken] = useState(0);

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

  const carregarPlanos = useCallback(() => {
    setErroPlanos('');
    return listarPlanos()
      .then(setPlanos)
      .catch((e) => setErroPlanos(e.response?.data?.message || 'Não foi possível carregar os planos de voo.'));
  }, []);

  useEffect(() => {
    if (!ehQuadro && !planoAberto) carregarPlanos();
  }, [ehQuadro, planoAberto, carregarPlanos]);

  const abrirPlano = (id) => setSearchParams(id ? { aba: 'plano-de-voo', plano: String(id) } : { aba: 'plano-de-voo' });

  // Card mudou (criado/editado/movido): atualiza o que estiver na tela.
  function cardAlterado() {
    if (ehQuadro) carregar(true);
    else if (planoAberto) setGanttToken((n) => n + 1);
    else carregarPlanos();
  }

  // Arrastar: atualiza na hora (otimista) e confirma no servidor; se recusar, volta.
  async function mover(card, destino) {
    const anterior = dados;
    setAviso('');
    setMovendoId(card.id);
    setDados((d) => ({
      ...d,
      cards: d.cards.map((c) =>
        c.id === card.id ? { ...c, bucket: destino, status: destino, concluido_em: destino === 'CONCLUIDO' ? new Date().toISOString() : null } : c
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

  // Finalizar (só o criador, a partir de Concluído): botão verde no card.
  async function finalizar(card) {
    setAviso('');
    setFinalizandoId(card.id);
    try {
      await finalizarCard(card.id);
      await carregar(true);
    } catch (e) {
      setAviso(e.response?.data?.message || 'Não foi possível finalizar a atividade.');
      setTimeout(() => setAviso(''), 6000);
    } finally {
      setFinalizandoId(null);
    }
  }

  function fecharModal(idCriado) {
    setModal(idCriado ? { aberto: true, cardId: idCriado, inicialPlano: null } : { aberto: false, cardId: null, inicialPlano: null });
  }

  return (
    <div className="relative">
      <Tabs tabs={TABS} activeId={aba} onChange={(id) => setSearchParams({ aba: id }, { replace: true })} />

      {/* Canto superior direito: mostrar a coluna Finalizado (padrão: não). */}
      {ehQuadro && (
        <div className="absolute right-0 top-1 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Finalizados</span>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {[
              { valor: false, rotulo: 'Não' },
              { valor: true, rotulo: 'Sim' },
            ].map((o) => (
              <button
                key={o.rotulo}
                type="button"
                onClick={() => setMostrarFinalizados(o.valor)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mostrarFinalizados === o.valor
                    ? o.valor
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-gray-100 text-gray-700'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-card rounded-tl-none bg-white p-4 shadow-card">
        {!ehQuadro ? (
          planoAberto ? (
            <PlanoGantt
              planoId={planoAberto}
              recarregarToken={ganttToken}
              onVoltar={() => abrirPlano(null)}
              onEditar={(plano) => setPlanoForm({ aberto: true, plano })}
              onAbrirCard={(id) => setModal({ aberto: true, cardId: id, inicialPlano: null })}
              onNovoCard={(inicialPlano) => setModal({ aberto: true, cardId: null, inicialPlano })}
            />
          ) : erroPlanos ? (
            <p className="py-12 text-center text-sm text-red-600">{erroPlanos}</p>
          ) : !planos ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-50" />
              ))}
            </div>
          ) : (
            <PlanosLista
              planos={planos.planos}
              usuarios={planos.usuarios}
              onAbrir={abrirPlano}
              onNovo={() => setPlanoForm({ aberto: true, plano: null })}
            />
          )
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {BUCKETS.slice(0, 4).map((b) => (
                  <div key={b.id} className="h-56 animate-pulse rounded-xl bg-gray-50" />
                ))}
              </div>
            ) : (
              <KanbanBoard
                cards={dados?.cards || []}
                hoje={dados?.hoje}
                usuarios={dados?.usuarios || {}}
                empresasLogos={dados?.empresasLogos}
                visao={visao}
                usuarioAtualId={user?.id}
                movendoId={movendoId}
                finalizandoId={finalizandoId}
                mostrarFinalizados={mostrarFinalizados}
                onFinalizar={finalizar}
                onAbrir={(id) => setModal({ aberto: true, cardId: id, inicialPlano: null })}
                onMover={mover}
                onAdicionar={() => setModal({ aberto: true, cardId: null, inicialPlano: null })}
              />
            )}
          </>
        )}
      </div>

      <CardModal
        aberto={modal.aberto}
        cardId={modal.cardId}
        onFechar={fecharModal}
        onAlterado={cardAlterado}
        inicialPlano={modal.inicialPlano}
        empresas={opcoesEmpresa}
        visao={visao}
        usuarioAtualId={user?.id}
      />

      <PlanoFormModal
        aberto={planoForm.aberto}
        plano={planoForm.plano}
        empresas={opcoesEmpresa}
        usuarioAtualId={user?.id}
        onFechar={() => setPlanoForm({ aberto: false, plano: null })}
        onSalvo={(r) => {
          setPlanoForm({ aberto: false, plano: null });
          // criado: já abre o Gantt para cadastrar as macro tarefas
          if (planoAberto === r.plano.id) setGanttToken((n) => n + 1);
          else abrirPlano(r.plano.id);
        }}
        onExcluido={() => {
          setPlanoForm({ aberto: false, plano: null });
          abrirPlano(null);
        }}
      />
    </div>
  );
}
