import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import SearchableSelect from '../../../../components/SearchableSelect';
import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR } from './constantes';
import {
  listParametrosDisparoReguaCobranca,
  salvarParametroDisparoReguaCobranca,
  getComunicacaoAutomaticaReguaCobranca,
  salvarComunicacaoAutomaticaReguaCobranca,
} from '../../../../api/reguaCobranca.api';
import { listZapiIntegracoes } from '../../../../api/zapi.api';
import { listEmailIntegracoes } from '../../../../api/emailIntegracao.api';
import DistribuicaoRotinaSecao from './DistribuicaoRotinaSecao';

// Opções do "Tipo de Comunicação" (ver reguaCobranca.service.js::
// getComunicacaoAutomatica) — decide como WhatsApp/E-mail aparecem na
// Rotina do dia (RotinasTab.jsx/RegistrarComunicacaoModal.jsx).
const TIPOS_COMUNICACAO = [
  {
    valor: 'automatica',
    titulo: 'Comunicação Automática',
    descricao: 'O sistema envia o WhatsApp e o e-mail nos horários agendados. Na Rotina, só aparece o status do envio.',
  },
  {
    valor: 'visualizar',
    titulo: 'Visualizar antes de enviar',
    descricao: 'Na Rotina, o responsável abre a mensagem, confere e clica em Enviar.',
  },
  {
    valor: 'copiar',
    titulo: 'Copiar conteúdo para envio manual',
    descricao: 'Na Rotina, o responsável copia a mensagem (e baixa o boleto) e envia pelo próprio WhatsApp ou e-mail.',
  },
];

// Mesmo buffer local de EtapasTabela.jsx::CampoBuffer — só grava no blur,
// não a cada tecla/seleção do seletor nativo.
function CampoHorario({ valor, onCommit }) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  return (
    <input
      type="time"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local && local !== valor) onCommit(local);
      }}
      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-100"
    />
  );
}

// Parâmetros da régua como um todo, fora dos 5 clusters — aparece no mesmo
// lugar do conteúdo de um cluster (troca de conteúdo pela seleção na barra
// de abas, ver ReguaCobrancaTab.jsx), não numa janela separada. 3 módulos
// bem separados: a Distribuição da Rotina (responsável por etapa ou
// distribuição automática — DistribuicaoRotinaSecao.jsx), quem/quando
// dispara cada cluster (conexões Z-API/Email + horário) e o Tipo de
// Comunicação.
export default function ConfiguracoesGlobaisPainel({ empresaId }) {
  const [parametros, setParametros] = useState(null);
  const [zapiOptions, setZapiOptions] = useState([]);
  const [emailOptions, setEmailOptions] = useState([]);
  const [comunicacaoAutomatica, setComunicacaoAutomatica] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    setParametros(null);
    setComunicacaoAutomatica(null);
    listParametrosDisparoReguaCobranca(empresaId).then(setParametros);
    getComunicacaoAutomaticaReguaCobranca(empresaId).then(setComunicacaoAutomatica);
    listZapiIntegracoes({ empresa_id: empresaId, ativo: true, limit: 100 }).then((res) =>
      setZapiOptions(res.data.map((i) => ({ value: i.id, label: i.nome_conexao })))
    );
    listEmailIntegracoes({ empresa_id: empresaId, ativo: true, limit: 100 }).then((res) =>
      setEmailOptions(res.data.map((i) => ({ value: i.id, label: i.nome_conexao })))
    );
  }, [empresaId]);

  async function handleAtualizarParametro(cluster, patch) {
    const atual = parametros.find((p) => p.cluster === cluster);
    const payload = {
      horario: atual.horario,
      zapi_integracao_id: atual.zapi_integracao_id,
      email_integracao_id: atual.email_integracao_id,
      ...patch,
    };
    const atualizado = await salvarParametroDisparoReguaCobranca(empresaId, cluster, payload);
    setParametros((prev) => prev.map((p) => (p.cluster === cluster ? atualizado : p)));
  }

  async function handleSalvarTipoComunicacao(tipo) {
    if (tipo === comunicacaoAutomatica.tipo) return;
    const atualizado = await salvarComunicacaoAutomaticaReguaCobranca(empresaId, tipo);
    setComunicacaoAutomatica(atualizado);
  }

  const carregando = !parametros || !comunicacaoAutomatica;

  return (
    <Card>
      {carregando ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-6">
          <DistribuicaoRotinaSecao empresaId={empresaId} />

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Disparo por cluster</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-3 py-2 font-medium">Cluster</th>
                    <th className="px-3 py-2 font-medium">Horário</th>
                    <th className="px-3 py-2 font-medium">Whatsapp Z-API</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {CLUSTERS.map((cluster) => {
                    const parametro = parametros.find((p) => p.cluster === cluster.id);
                    const Icone = CLUSTER_ICON[cluster.id];
                    return (
                      <tr key={cluster.id} className="border-b border-gray-50 last:border-0">
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="flex items-center gap-1.5 font-medium text-gray-700">
                            <Icone size={14} className={CLUSTER_ICON_COR[cluster.id]} />
                            {cluster.nome}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <CampoHorario
                            valor={parametro.horario}
                            onCommit={(horario) => handleAtualizarParametro(cluster.id, { horario })}
                          />
                        </td>
                        <td className="min-w-[160px] px-3 py-2">
                          <SearchableSelect
                            value={parametro.zapi_integracao_id ?? ''}
                            onChange={(value) =>
                              handleAtualizarParametro(cluster.id, { zapi_integracao_id: value === '' ? null : value })
                            }
                            options={zapiOptions}
                            placeholder="Nenhuma conexão"
                            emptyMessage="Nenhuma conexão cadastrada."
                          />
                        </td>
                        <td className="min-w-[160px] px-3 py-2">
                          <SearchableSelect
                            value={parametro.email_integracao_id ?? ''}
                            onChange={(value) =>
                              handleAtualizarParametro(cluster.id, { email_integracao_id: value === '' ? null : value })
                            }
                            options={emailOptions}
                            placeholder="Nenhuma conexão"
                            emptyMessage="Nenhuma conexão cadastrada."
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Tipo de Comunicação</h3>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de Comunicação">
              {TIPOS_COMUNICACAO.map((opcao) => {
                const selecionado = comunicacaoAutomatica.tipo === opcao.valor;
                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    role="radio"
                    aria-checked={selecionado}
                    onClick={() => handleSalvarTipoComunicacao(opcao.valor)}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                      selecionado
                        ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selecionado ? 'border-primary-600' : 'border-gray-300'
                      }`}
                    >
                      {selecionado && <span className="h-2 w-2 rounded-full bg-primary-600" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-gray-700">{opcao.titulo}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{opcao.descricao}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}
