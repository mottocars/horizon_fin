import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import { getComunicarConfigRepassesCef, salvarComunicarConfigRepassesCef } from '../../../api/repassesCef.api';
import { listZapiIntegracoes } from '../../../api/zapi.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', BASICO: 'Básico' };

const DIAS_SEMANA = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

// Mesmo par âmbar (vazio)/azul (preenchido) da aba Configurações de Saldo Contas Bancárias.
const COR_CAMPO_VAZIO = 'border-amber-300 bg-amber-50 hover:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 hover:border-primary-500';
const corCampo = (preenchido) => (preenchido ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO);

function SectionHeader({ titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// 'YYYY-MM-DD HH:MM' (Brasília, vindo do backend) → "segunda-feira, 12/10/2026 às 08:30".
function formatarProximoEnvio(texto) {
  if (!texto) return null;
  const [data, hora] = texto.split(' ');
  const [ano, mes, dia] = data.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
  return `${diaSemana}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} às ${hora}`;
}

function formatarDataHora(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

// Aba Configurações da tela Repasses CEF — comunicado semanal por WhatsApp (resumo dos
// contratos que não viraram assinatura e dos retidos em assinatura + planilha por etapa).
// Mesmo padrão da aba Configurações de Saldo Contas Bancárias: um Card por parâmetro e um
// Salvar só no fim. O envio roda no agendador do servidor (a cada minuto confere se chegou
// o dia/horário — ver comunicarRepasses.service.js::verificarAgendamentos).
export default function ConfiguracoesRepassesCef({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [elegiveis, setElegiveis] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [zapiOpcoes, setZapiOpcoes] = useState([]);
  const [zapiIntegracaoId, setZapiIntegracaoId] = useState(null);
  const [diaSemana, setDiaSemana] = useState(null);
  const [horario, setHorario] = useState('');
  const [proximoEnvio, setProximoEnvio] = useState(null);
  const [ultimoEnvioEm, setUltimoEnvioEm] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aplicar(config) {
    setElegiveis(config.elegiveis);
    setSelecionados(config.selecionados.map(String));
    setZapiIntegracaoId(config.zapiIntegracaoId);
    setDiaSemana(config.diaSemana);
    setHorario(config.horario || '');
    setProximoEnvio(config.proximoEnvio);
    setUltimoEnvioEm(config.ultimoEnvioEm);
  }

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    setSalvo(false);
    Promise.all([
      getComunicarConfigRepassesCef(empresaId),
      listZapiIntegracoes({ empresa_id: empresaId, ativo: true, limit: 100 }),
    ])
      .then(([config, zapi]) => {
        aplicar(config);
        setZapiOpcoes(zapi.data.map((i) => ({ value: i.id, label: i.nome_conexao })));
      })
      .catch(() => setErro('Não foi possível carregar as configurações.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alterado(setter) {
    return (valor) => {
      setter(valor);
      setSalvo(false);
    };
  }

  async function handleSalvar() {
    setErro('');
    setSalvo(false);
    setSalvando(true);
    try {
      const config = await salvarComunicarConfigRepassesCef(empresaId, {
        usuarioIds: selecionados.map(Number),
        zapiIntegracaoId,
        diaSemana,
        horario: horario || null,
      });
      aplicar(config);
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

  const faltando = [
    !zapiIntegracaoId && 'a conexão',
    selecionados.length === 0 && 'os destinatários',
    diaSemana === null && 'o dia da semana',
    !horario && 'o horário',
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          titulo="Conexão de disparo"
          texto="Qual conexão de WhatsApp (Z-API) desta empresa envia o comunicado semanal de Repasses CEF."
        />
        <div className="mt-4 max-w-xs">
          {carregando ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-gray-700">Conexão WhatsApp (Z-API)</label>
              <SearchableSelect
                value={zapiIntegracaoId ?? ''}
                onChange={alterado((value) => setZapiIntegracaoId(value === '' ? null : value))}
                options={zapiOpcoes}
                placeholder="Nenhuma conexão selecionada"
                emptyMessage="Nenhuma conexão Z-API cadastrada para esta empresa."
                corClasses={corCampo(Boolean(zapiIntegracaoId))}
              />
            </>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          titulo="Destinatários"
          texto="Quem recebe o comunicado de Repasses CEF desta empresa. A lista de disponíveis já traz todos os Master e os Administradores/Básicos com acesso a esta empresa. O WhatsApp vai para o telefone do cadastro do usuário."
        />
        <div className="mt-4">
          {carregando ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : (
            <TransferList
              itens={elegiveis}
              selecionados={selecionados}
              onChange={alterado(setSelecionados)}
              getId={(u) => u.id}
              getLabel={(u) => `${u.nome} (${ROTULO_PERMISSAO[u.permissao] || u.permissao})`}
              tituloDisponiveis="Disponíveis"
              tituloSelecionados="Recebem o comunicado"
              vazioDisponiveisTexto="Nenhum usuário disponível."
              vazioSelecionadosTexto="Nenhum usuário selecionado."
              corSelecionados={corCampo(selecionados.length > 0)}
            />
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          titulo="Dia da semana e horário de envio"
          texto="O comunicado é enviado uma vez por semana, no dia e horário escolhidos (horário de Brasília)."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="w-56">
              <label className="mb-1 block text-sm font-medium text-gray-700">Dia da semana</label>
              <SearchableSelect
                value={diaSemana ?? ''}
                onChange={alterado((value) => setDiaSemana(value === '' || value === null ? null : Number(value)))}
                options={DIAS_SEMANA}
                placeholder="Selecione o dia"
                corClasses={corCampo(diaSemana !== null)}
              />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-sm font-medium text-gray-700">Horário</label>
              <input
                type="time"
                value={horario}
                onChange={(e) => alterado(setHorario)(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo(Boolean(horario))}`}
              />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 pb-2 text-xs text-gray-500">
              <CalendarClock size={15} className="shrink-0 text-gray-400" />
              {proximoEnvio ? (
                <span>
                  Próximo envio: <strong className="font-medium text-gray-700">{formatarProximoEnvio(proximoEnvio)}</strong>
                  {ultimoEnvioEm && <> · último em {formatarDataHora(ultimoEnvioEm)}</>}
                </span>
              ) : (
                <span>Sem envio agendado{faltando.length > 0 ? ` — falta escolher ${faltando.join(', ')}` : ' — salve as configurações'}.</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSalvar} loading={salvando} disabled={carregando}>
            Salvar configurações
          </Button>
          {salvo && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Configurações salvas
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
