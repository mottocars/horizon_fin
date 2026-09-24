import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import { getComunicarSaldos, salvarComunicarSaldos } from '../../../api/saldoContasBancarias.api';
import { listZapiIntegracoes } from '../../../api/zapi.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', ADMINISTRADOR: 'Administrador', BASICO: 'Básico' };

// Mesmo padrão de cabeçalho de seção usado em GestaoCobrancas/MotorRisco/MotorRiscoTab.jsx —
// título + descrição curta, separados do conteúdo por uma linha. Cada parâmetro da tela de
// Configurações ganha o seu próprio Card com esse cabeçalho, pra ficar claro onde uma
// configuração termina e a próxima começa.
function SectionHeader({ selo, titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      {selo && (
        <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Parâmetros da tela de Saldo Contas Bancárias — por enquanto só "Comunicar Saldos": qual
// conexão WhatsApp (Z-API) e quais usuários recebem aviso sobre os saldos lançados desta
// empresa, no momento em que o período for encerrado. A lista de usuários elegíveis (todo
// MASTER + ADMINISTRADOR/BASICO vinculado a esta empresa) e as conexões Z-API ativas da
// empresa vêm prontas do backend — ver saldos.service.js::listUsuariosComunicarSaldos e
// zapi.api.js::listZapiIntegracoes. Só guarda a configuração; o disparo em si (mandar a
// mensagem de verdade ao encerrar o período) ainda não existe, fica pra quando o conteúdo da
// mensagem for definido.
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
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e ajustar os parâmetros desta tela.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          selo="Comunicar Saldos"
          titulo="Conexão de disparo"
          texto="Qual conexão de WhatsApp (Z-API) desta empresa é usada para enviar o aviso de saldos."
        />
        <div className="mt-4 max-w-xs">
          {carregando ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          titulo="Destinatários"
          texto="Quem recebe o aviso de saldos desta empresa, no momento em que o período for encerrado. A lista de disponíveis já traz todos os Master e os Administradores/Básicos com acesso a esta empresa."
        />
        <div className="mt-4">
          {carregando ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : (
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
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
          <Button type="button" onClick={handleSalvar} loading={salvando} disabled={carregando}>
            Salvar
          </Button>
          {salvo && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Salvo
            </span>
          )}
          {erro && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle size={15} className="shrink-0" /> {erro}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
