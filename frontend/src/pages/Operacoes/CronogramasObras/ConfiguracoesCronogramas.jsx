import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import { getCronogramaConfig, salvarCronogramaConfig } from '../../../api/cronogramaConfig.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', BASICO: 'Básico' };

const REGRAS_ATRASO = [
  { value: 'FIXA', titulo: 'Regra fixa', texto: 'A obra conta como atrasada a partir de um número fixo de meses de obra.' },
  { value: 'PLANEJAMENTO', titulo: 'Planejamento', texto: 'O atraso é contado pelo planejamento de um sistema de planejamento da obra.' },
];

// Hoje só o Prevision; a combobox fica pronta pra outros sistemas (pedido do usuário).
const SISTEMAS_PLANEJAMENTO = [{ value: 'PREVISION', label: 'Prevision' }];

// Cor dos meses em atraso quando ninguém escolheu outra (atraso_cor NULL).
const COR_ATRASO_PADRAO = '#dc2626';

// Mesmo par âmbar (vazio)/azul (preenchido) da aba Configurações de Repasses CEF.
const COR_CAMPO_VAZIO = 'border-amber-300 bg-amber-50 hover:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 hover:border-primary-500';
const corCampo = (preenchido) => (preenchido ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO);

// Prévia de uma obra com 6 meses no prazo e 3 em atraso, no mesmo desenho das barras do Gantt
// (meses separados, contagem sequencial sutil).
function PreviaAtraso({ cor }) {
  const meses = [...Array(9)].map((_, i) => ({ n: i + 1, atraso: i >= 6 }));
  return (
    <div className="max-w-md">
      <div className="flex h-7 gap-0.5">
        {meses.map((m) => (
          <div
            key={m.n}
            className="flex flex-1 items-center justify-center text-[10px] font-medium text-white/80 first:rounded-l last:rounded-r"
            style={{ backgroundColor: m.atraso ? cor : '#94a3b8' }}
          >
            {m.n}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex text-[11px] text-gray-500">
        <span style={{ width: `${(6 / 9) * 100}%` }}>No prazo</span>
        <span>Em atraso</span>
      </div>
    </div>
  );
}

function SectionHeader({ titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Aba Configurações de Operações > Cronogramas Obras (pedido do usuário) — mesmo padrão da aba
// Configurações de Repasses CEF (ConfiguracoesRepassesCef.jsx): um Card por parâmetro e um Salvar só
// no fim. Parâmetros:
// - Regra de Atraso de Obra: regra fixa (meses de obra) ou o planejamento de um sistema (Prevision);
// - Cor dos meses em atraso (padrão vermelha);
// - Conexão de disparo e Destinatários do comunicado de alteração de cronograma — iguais aos de
//   Repasses CEF (conexão Z-API e lista de transferência).
// Por enquanto só guarda os parâmetros (ver cronogramaConfig.service.js).
export default function ConfiguracoesCronogramas({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [atrasoRegra, setAtrasoRegra] = useState(null);
  const [atrasoMeses, setAtrasoMeses] = useState('');
  const [atrasoSistema, setAtrasoSistema] = useState(null);
  const [atrasoCor, setAtrasoCor] = useState(null);
  const [zapiOpcoes, setZapiOpcoes] = useState([]);
  const [zapiIntegracaoId, setZapiIntegracaoId] = useState(null);
  const [elegiveis, setElegiveis] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aplicar(c) {
    setAtrasoRegra(c.atrasoRegra);
    setAtrasoMeses(c.atrasoMeses ?? '');
    setAtrasoSistema(c.atrasoSistema);
    setAtrasoCor(c.atrasoCor);
    setZapiOpcoes(c.opcoesZapi.map((z) => ({ value: z.id, label: z.nome })));
    setZapiIntegracaoId(c.zapiIntegracaoId);
    setElegiveis(c.elegiveis);
    setSelecionados(c.selecionados.map(String));
  }

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    setSalvo(false);
    getCronogramaConfig(empresaId)
      .then(aplicar)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar as configurações.'))
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
      const c = await salvarCronogramaConfig(empresaId, {
        atrasoRegra,
        atrasoMeses: atrasoMeses === '' ? null : Number(atrasoMeses),
        atrasoSistema,
        atrasoCor,
        zapiIntegracaoId,
        usuarioIds: selecionados.map(Number),
      });
      aplicar(c);
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
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver e ajustar os parâmetros desta tela.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          titulo="Regra de Atraso de Obra"
          texto="O que deve ser considerado para dizer que uma obra está atrasada: uma regra fixa, com quantos meses de obra ela passa a contar como atrasada, ou o planejamento feito num sistema de planejamento."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <>
            <div role="radiogroup" aria-label="Regra de atraso de obra" className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
              {REGRAS_ATRASO.map((r) => {
                const ativo = atrasoRegra === r.value;
                return (
                  <label
                    key={r.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      ativo ? 'border-primary-500 bg-primary-50' : atrasoRegra ? 'border-gray-200 hover:border-gray-300' : 'border-amber-300 bg-amber-50 hover:border-amber-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="regra-atraso"
                      value={r.value}
                      checked={ativo}
                      onChange={() => alterado(setAtrasoRegra)(r.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{r.titulo}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{r.texto}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {atrasoRegra === 'FIXA' && (
              <div className="mt-4 max-w-xs">
                <label className="mb-1 block text-sm font-medium text-gray-700">Meses de obra para contar como atrasada</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={600}
                    step={1}
                    value={atrasoMeses}
                    onChange={(e) => alterado(setAtrasoMeses)(e.target.value)}
                    className={`w-28 rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo(atrasoMeses !== '')}`}
                  />
                  <span className="text-sm text-gray-500">meses</span>
                </div>
              </div>
            )}

            {atrasoRegra === 'PLANEJAMENTO' && (
              <div className="mt-4 max-w-xs">
                <label className="mb-1 block text-sm font-medium text-gray-700">Sistema de planejamento</label>
                <SearchableSelect
                  value={atrasoSistema ?? ''}
                  onChange={alterado((v) => setAtrasoSistema(v || null))}
                  options={SISTEMAS_PLANEJAMENTO}
                  placeholder="Selecione o sistema"
                  corClasses={corCampo(Boolean(atrasoSistema))}
                />
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="Cor dos meses em atraso"
          texto="Com que cor os meses de atraso de uma obra aparecem nas barras dos cronogramas. Sem escolha, fica a vermelha padrão."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border py-1.5 pl-1.5 pr-3 transition-colors ${corCampo(Boolean(atrasoCor))}`}
              >
                <input
                  type="color"
                  value={atrasoCor || COR_ATRASO_PADRAO}
                  onChange={(e) => alterado(setAtrasoCor)(e.target.value.toLowerCase())}
                  aria-label="Cor dos meses em atraso"
                  className="h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white p-0 shadow-sm"
                />
                <span className="text-sm text-gray-900">{atrasoCor ? 'Cor escolhida' : 'Cor padrão'}</span>
                <span className="font-mono text-xs uppercase text-gray-500">{atrasoCor || COR_ATRASO_PADRAO}</span>
              </label>
              {atrasoCor && atrasoCor !== COR_ATRASO_PADRAO && (
                <button
                  type="button"
                  onClick={() => alterado(setAtrasoCor)(null)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <RotateCcw size={13} /> Usar a padrão
                </button>
              )}
            </div>
            <PreviaAtraso cor={atrasoCor || COR_ATRASO_PADRAO} />
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="Conexão de disparo"
          texto="Qual conexão de WhatsApp (Z-API) desta empresa envia o comunicado de alteração de cronograma de uma obra."
        />
        <div className="mt-4 max-w-xs">
          {carregando ? (
            <div className="text-sm text-gray-400">Carregando...</div>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-gray-700">Conexão WhatsApp (Z-API)</label>
              <SearchableSelect
                value={zapiIntegracaoId ?? ''}
                onChange={alterado((value) => setZapiIntegracaoId(value === '' || value === null ? null : Number(value)))}
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
          texto="Quem recebe o comunicado de alteração de cronograma desta empresa. A lista de disponíveis já traz todos os Master e os Administradores/Básicos com acesso a esta empresa. O WhatsApp vai para o telefone do cadastro do usuário."
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
