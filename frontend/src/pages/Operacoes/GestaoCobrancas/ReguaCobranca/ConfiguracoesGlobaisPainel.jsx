import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import SearchableSelect from '../../../../components/SearchableSelect';
import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR } from './constantes';
import {
  listParametrosDisparoReguaCobranca,
  salvarParametroDisparoReguaCobranca,
  getDataSistemaReguaCobranca,
  salvarDataSistemaReguaCobranca,
  getComunicacaoAutomaticaReguaCobranca,
  salvarComunicacaoAutomaticaReguaCobranca,
} from '../../../../api/reguaCobranca.api';
import { listZapiIntegracoes } from '../../../../api/zapi.api';
import { listEmailIntegracoes } from '../../../../api/emailIntegracao.api';

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

function CampoData({ valor, onCommit }) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  return (
    <input
      type="date"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local && local !== valor) onCommit(local);
      }}
      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-100"
    />
  );
}

function Switch({ ativo, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={ativo}
      className={`relative h-[19px] w-[34px] shrink-0 rounded-full border transition-colors ${
        ativo ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-gray-100'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow transition-all ${
          ativo ? 'left-[17px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

// Parâmetros da régua como um todo, fora dos 5 clusters — aparece no mesmo
// lugar do conteúdo de um cluster (troca de conteúdo pela seleção na barra
// de abas, ver ReguaCobrancaTab.jsx), não numa janela separada. 2 módulos
// bem separados: quem/quando dispara cada cluster (conexões Z-API/Email +
// horário) e a data que o sistema considera "hoje" pros disparos (real, no
// fuso brasileiro, ou uma data fictícia pra testes).
export default function ConfiguracoesGlobaisPainel({ empresaId }) {
  const [parametros, setParametros] = useState(null);
  const [zapiOptions, setZapiOptions] = useState([]);
  const [emailOptions, setEmailOptions] = useState([]);
  const [dataSistema, setDataSistema] = useState(null);
  const [comunicacaoAutomatica, setComunicacaoAutomatica] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    setParametros(null);
    setDataSistema(null);
    setComunicacaoAutomatica(null);
    listParametrosDisparoReguaCobranca(empresaId).then(setParametros);
    getDataSistemaReguaCobranca(empresaId).then(setDataSistema);
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

  async function handleToggleDataReal() {
    const usarDataReal = !dataSistema.usar_data_real;
    const payload = {
      usar_data_real: usarDataReal,
      data_ficticia: usarDataReal ? dataSistema.data_ficticia : dataSistema.data_ficticia || dataSistema.data_efetiva,
    };
    const atualizado = await salvarDataSistemaReguaCobranca(empresaId, payload);
    setDataSistema(atualizado);
  }

  async function handleSalvarDataFicticia(data) {
    const atualizado = await salvarDataSistemaReguaCobranca(empresaId, {
      usar_data_real: false,
      data_ficticia: data,
    });
    setDataSistema(atualizado);
  }

  async function handleToggleComunicacaoAutomatica() {
    const atualizado = await salvarComunicacaoAutomaticaReguaCobranca(empresaId, !comunicacaoAutomatica.ativa);
    setComunicacaoAutomatica(atualizado);
  }

  const carregando = !parametros || !dataSistema || !comunicacaoAutomatica;

  return (
    <Card>
      {carregando ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-6">
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
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Data do sistema</h3>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <Switch ativo={dataSistema.usar_data_real} label="Usar data real" onClick={handleToggleDataReal} />
              <span className="text-sm font-medium text-gray-700">Usar data real</span>
              {!dataSistema.usar_data_real && (
                <CampoData valor={dataSistema.data_ficticia} onCommit={handleSalvarDataFicticia} />
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Comunicação automática</h3>
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <Switch
                ativo={comunicacaoAutomatica.ativa}
                label="Ativar Comunicação Automática"
                onClick={handleToggleComunicacaoAutomatica}
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Ativar Comunicação Automática</p>
                <p className="mt-0.5 max-w-xl text-xs text-gray-500">
                  {comunicacaoAutomatica.ativa
                    ? 'Ligada: o sistema deverá realizar diariamente o envio das comunicações de WhatsApp e e-mail das etapas liberadas para rotina.'
                    : 'Desligada: na Rotina do dia, o responsável precisa marcar manualmente que enviou o WhatsApp e o e-mail — o mesmo funcionamento já usado para a Ligação.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}
