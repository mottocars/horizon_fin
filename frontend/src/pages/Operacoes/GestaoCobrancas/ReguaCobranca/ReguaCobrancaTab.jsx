import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Settings } from 'lucide-react';
import Card from '../../../../components/Card';
import {
  atualizarEtapaReguaCobranca,
  criarEtapaReguaCobranca,
  getResumoReguaCobranca,
  listEtapasReguaCobranca,
  listResponsaveisReguaCobranca,
  removerEtapaReguaCobranca,
} from '../../../../api/reguaCobranca.api';
import { listTemplatesComunicacao } from '../../../../api/comunicacao.api';
import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR, CLUSTER_TAB_ATIVA, compararDias } from './constantes';
import ReguaVisual from './ReguaVisual';
import EtapasTabela from './EtapasTabela';
import ConfiguracoesGlobaisPainel from './ConfiguracoesGlobaisPainel';

// Id especial de `regua_cluster` pra "Configurações Globais" — não é um
// cluster (não está em CLUSTERS), mas usa a mesma barra de abas e o mesmo
// parâmetro de URL, trocando o conteúdo abaixo dela igual à troca entre
// clusters (ver render mais abaixo).
const CONFIG_GLOBAIS_ID = 'config-globais';

// Réplica da tela de configuração de régua de cobrança (protótipo:
// regua-cobranca-configuracao.html) — uma régua por cluster: os 4 do score
// (Novo/Bom/Duvidoso/Mau) mais Inadimplência, que é um 5º cluster que
// existe só aqui dentro da régua (não mexe em cobranca_clientes_clusters,
// que continua com só os 4 — ver plano desta entrega). A fronteira entre
// as réguas (`limite`) vem do Motor de Risco (dias_vencidos_regua_cobranca
// da versão vigente), só leitura aqui.
export default function ReguaCobrancaTab({ empresaId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const clusterId = searchParams.get('regua_cluster') || 'novo';
  const mostrandoConfigGlobais = clusterId === CONFIG_GLOBAIS_ID;
  const cluster = CLUSTERS.find((c) => c.id === clusterId) || CLUSTERS[0];

  function selecionarCluster(id) {
    const next = new URLSearchParams(searchParams);
    next.set('regua_cluster', id);
    setSearchParams(next, { replace: true });
  }

  const [resumo, setResumo] = useState(null);
  const [erroResumo, setErroResumo] = useState('');
  const [etapas, setEtapas] = useState([]);
  const [carregandoEtapas, setCarregandoEtapas] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Recarrega o resumo (fronteira/contagens/maior dia da régua de
  // Inadimplência) sem esconder o que já está na tela — chamado toda hora
  // que uma etapa muda (ver handleAtualizar/handleRemover/handleNovaEtapa
  // abaixo), então NÃO pode piscar um "Carregando..." por cima da tabela a
  // cada edição (isso já aconteceu: a tabela some, a página encolhe, e o
  // navegador reseta a rolagem pro topo — o "carregandoResumo" antigo
  // gatilhava exatamente isso). `resumo` só fica `null` na primeiríssima
  // carga (ou ao trocar de empresa, ver useEffect abaixo); depois disso o
  // valor anterior continua na tela até o novo chegar.
  const carregarResumo = useCallback(() => {
    if (!empresaId) return Promise.resolve();
    setErroResumo('');
    return getResumoReguaCobranca(empresaId)
      .then(setResumo)
      .catch((err) => {
        setErroResumo(err.response?.data?.message || 'Não foi possível carregar a régua de cobrança.');
      });
  }, [empresaId]);

  useEffect(() => {
    setResumo(null);
    carregarResumo();
  }, [carregarResumo]);

  const carregarEtapas = useCallback(() => {
    if (!empresaId || mostrandoConfigGlobais) return Promise.resolve();
    setCarregandoEtapas(true);
    return listEtapasReguaCobranca(empresaId, cluster.id)
      .then(setEtapas)
      .finally(() => setCarregandoEtapas(false));
  }, [empresaId, cluster.id, mostrandoConfigGlobais]);

  useEffect(() => {
    setEtapas([]);
    carregarEtapas();
  }, [carregarEtapas]);

  useEffect(() => {
    if (!empresaId || mostrandoConfigGlobais) {
      setUsuarios([]);
      return;
    }
    // Só usuários com esta empresa registrada no cadastro, nunca Master —
    // governança: ver reguaCobranca.service.js::listResponsaveis (aplicada
    // de novo no backend em toda criação/edição, não só aqui no combobox).
    listResponsaveisReguaCobranca(empresaId).then(setUsuarios);
  }, [empresaId, mostrandoConfigGlobais]);

  useEffect(() => {
    if (!empresaId || mostrandoConfigGlobais) {
      setTemplates([]);
      return;
    }
    // Biblioteca inteira da empresa (sem filtro de cluster aqui) — quem
    // decide quais aparecem no combobox de cada cluster é EtapasTabela.jsx,
    // filtrando por `clusters.includes(cluster.id)` (o mesmo campo que
    // governa a autorização, validada de novo no backend em toda
    // criação/edição — ver reguaCobranca.service.js::garantirTemplateElegivel).
    listTemplatesComunicacao(empresaId).then(setTemplates);
  }, [empresaId, mostrandoConfigGlobais]);

  async function handleAtualizar(id, patch) {
    const etapaAtualizada = await atualizarEtapaReguaCobranca(id, patch);
    setEtapas((prev) => prev.map((e) => (e.id === id ? etapaAtualizada : e)).sort(compararDias));
    // dias/ativa mudam a contagem de etapas ativas (badge da aba) — recarrega
    // o resumo em segundo plano, sem travar a edição.
    carregarResumo();
  }

  async function handleRemover(id) {
    await removerEtapaReguaCobranca(id);
    setEtapas((prev) => prev.filter((e) => e.id !== id));
    carregarResumo();
  }

  async function handleNovaEtapa() {
    // Nasce em branco e inativa (ver reguaCobranca.service.js::criarEtapa)
    // — nenhum dado extra pra mandar aqui, os defaults já fazem isso.
    const nova = await criarEtapaReguaCobranca(empresaId, cluster.id);
    setEtapas((prev) => [...prev, nova].sort(compararDias));
    carregarResumo();
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para configurar a régua de cobrança.</p>
      </Card>
    );
  }

  if (erroResumo) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <AlertTriangle size={24} className="mb-3 text-amber-400" />
        <h2 className="text-sm font-semibold text-gray-900">Não foi possível carregar a régua</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">{erroResumo}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <div className="flex flex-wrap items-center gap-2">
          {CLUSTERS.map((c, i) => {
            // Compara com `clusterId` (o parâmetro cru da URL), não com
            // `cluster.id` — este último cai pro fallback CLUSTERS[0] quando
            // clusterId é CONFIG_GLOBAIS_ID, o que marcaria "Novo cliente"
            // como ativo ao mesmo tempo que Configurações Globais.
            const ativa = c.id === clusterId;
            const contagem = resumo?.contagem_por_cluster?.[c.id] ?? 0;
            const Icone = CLUSTER_ICON[c.id];
            return (
              <div key={c.id} className="flex items-center gap-2">
                {i === 4 && <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => selecionarCluster(c.id)}
                  aria-pressed={ativa}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    ativa ? CLUSTER_TAB_ATIVA[c.id] : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icone size={13} className={ativa ? '' : CLUSTER_ICON_COR[c.id]} />
                  {c.nome}
                  <b
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-normal ${
                      ativa ? 'bg-white/60' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {contagem}
                  </b>
                </button>
              </div>
            );
          })}

          {/* Mesmo divisor visual usado antes de Inadimplência (i === 4
              acima) — aqui separando "Configurações Globais" de
              Inadimplência do mesmo jeito, porque não é um cluster: é um
              parâmetro da régua inteira, não desta ou daquela régua. Mesmo
              comportamento de aba dos clusters acima: troca o conteúdo
              abaixo, não abre janela nenhuma. */}
          <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => selecionarCluster(CONFIG_GLOBAIS_ID)}
            aria-pressed={mostrandoConfigGlobais}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              mostrandoConfigGlobais ? 'border-gray-300 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Settings size={13} />
            Configurações Globais
          </button>
        </div>
      </Card>

      {mostrandoConfigGlobais ? (
        <ConfiguracoesGlobaisPainel empresaId={empresaId} />
      ) : (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
              <h3 className="text-sm font-semibold text-gray-900">Cluster {cluster.nome}</h3>
              {resumo && (
                <span className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1 font-mono text-[11px] text-gray-500">
                  Fronteira em D+{resumo.limite} · parâmetro do Motor de Risco
                </span>
              )}
            </div>

            {!resumo ? (
              <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
            ) : (
              <ReguaVisual cluster={cluster} limite={resumo.limite} etapas={etapas} maiorDiaInad={resumo.maior_dia_inad} />
            )}
          </Card>

          <Card>
            {!resumo ? (
              <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
            ) : carregandoEtapas ? (
              <div className="py-8 text-center text-sm text-gray-400">Carregando etapas...</div>
            ) : (
              <EtapasTabela
                cluster={cluster}
                limite={resumo.limite}
                etapas={etapas}
                usuarios={usuarios}
                templates={templates}
                onAtualizar={handleAtualizar}
                onRemover={handleRemover}
                onNovaEtapa={handleNovaEtapa}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
