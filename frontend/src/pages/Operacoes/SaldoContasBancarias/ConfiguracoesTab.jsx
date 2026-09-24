import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Settings } from 'lucide-react';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import { getComunicarSaldos, salvarComunicarSaldos } from '../../../api/saldoContasBancarias.api';
import { listZapiIntegracoes } from '../../../api/zapi.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', ADMINISTRADOR: 'Administrador', BASICO: 'Básico' };

// Parâmetros da tela de Saldo Contas Bancárias — por enquanto só "Comunicar Saldos": qual
// conexão WhatsApp (Z-API) e quais usuários recebem aviso sobre os saldos lançados desta
// empresa. A lista de usuários elegíveis (todo MASTER + ADMINISTRADOR/BASICO vinculado a esta
// empresa) e as conexões Z-API ativas da empresa vêm prontas do backend — ver
// saldos.service.js::listUsuariosComunicarSaldos e zapi.api.js::listZapiIntegracoes. Só guarda
// a configuração; o disparo em si (mandar a mensagem de verdade ao encerrar o período) ainda
// não existe, fica pra quando o conteúdo da mensagem for definido.
export default function ConfiguracoesTab({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [elegiveis, setElegiveis] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [zapiOpcoes, setZapiOpcoes] = useState([]);
  const [zapiIntegracaoId, setZapiIntegracaoId] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    Promise.all([getComunicarSaldos(empresaId), listZapiIntegracoes({ empresa_id: empresaId, ativo: true, limit: 100 })])
      .then(([comunicar, zapi]) => {
        setElegiveis(comunicar.elegiveis);
        setSelecionados(comunicar.selecionados.map(String));
        setZapiIntegracaoId(comunicar.zapiIntegracaoId);
        setZapiOpcoes(zapi.data.map((i) => ({ value: i.id, label: i.nome_conexao })));
      })
      .catch(() => setErro('Não foi possível carregar as opções desta tela.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleSalvar() {
    setErro('');
    setSalvo(false);
    setSalvando(true);
    try {
      await salvarComunicarSaldos(empresaId, {
        usuarioIds: selecionados.map(Number),
        zapiIntegracaoId,
      });
      setSalvo(true);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e ajustar os parâmetros desta tela.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      <div className="max-w-2xl space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Comunicar Saldos</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Quem deve ser avisado, e por qual conexão de WhatsApp, sobre os saldos desta empresa.
          </p>
        </div>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        {carregando ? (
          <div className="py-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <>
            <div className="max-w-xs">
              <label className="mb-1 block text-sm font-medium text-gray-700">Conexão WhatsApp (Z-API)</label>
              <SearchableSelect
                value={zapiIntegracaoId ?? ''}
                onChange={(value) => {
                  setZapiIntegracaoId(value === '' ? null : value);
                  setSalvo(false);
                }}
                options={zapiOpcoes}
                placeholder="Nenhuma conexão selecionada"
                emptyMessage="Nenhuma conexão Z-API cadastrada para esta empresa."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Destinatários</label>
              <TransferList
                itens={elegiveis}
                selecionados={selecionados}
                onChange={(valores) => {
                  setSelecionados(valores);
                  setSalvo(false);
                }}
                getId={(u) => u.id}
                getLabel={(u) => `${u.nome} (${ROTULO_PERMISSAO[u.permissao] || u.permissao})`}
                tituloDisponiveis="Disponíveis"
                tituloSelecionados="Recebem aviso"
                vazioDisponiveisTexto="Nenhum usuário disponível."
                vazioSelecionadosTexto="Nenhum usuário selecionado."
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button type="button" onClick={handleSalvar} loading={salvando}>
                Salvar
              </Button>
              {salvo && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 size={15} /> Salvo
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
