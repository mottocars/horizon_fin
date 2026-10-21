import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings, X } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { getCronogramaConfig, salvarCronogramaConfig } from '../../../api/cronogramaConfig.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', BASICO: 'Básico' };

const REGRAS_ATRASO = [
  { value: 'FIXA', titulo: 'Regra fixa', texto: 'A obra conta como atrasada a partir de um número fixo de meses de obra.' },
  { value: 'PLANEJAMENTO', titulo: 'Planejamento', texto: 'O atraso é contado pelo planejamento de um sistema de planejamento da obra.' },
];

// Hoje só o Prevision; a combobox fica pronta pra outros sistemas (pedido do usuário).
const SISTEMAS_PLANEJAMENTO = [{ value: 'PREVISION', label: 'Prevision' }];

const CANAIS = [
  { value: 'WHATSAPP', label: 'WhatsApp (Z-API)' },
  { value: 'EMAIL', label: 'E-mail' },
];

// Mesmo par âmbar (vazio)/azul (preenchido) da aba Configurações de Repasses CEF.
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

// Aba Configurações de Operações > Cronogramas Obras (pedido do usuário) — mesmo padrão da aba
// Configurações de Repasses CEF: um Card por parâmetro e um Salvar só no fim. Parâmetros:
// - Regra de Atraso de Obra: regra fixa (meses de obra) ou o planejamento de um sistema (Prevision);
// - Comunicação de alteração de cronograma: canal, conexão e quem recebe.
// Por enquanto só guarda os parâmetros (ver cronogramaConfig.service.js).
export default function ConfiguracoesCronogramas({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [atrasoRegra, setAtrasoRegra] = useState(null);
  const [atrasoMeses, setAtrasoMeses] = useState('');
  const [atrasoSistema, setAtrasoSistema] = useState(null);
  const [comunicarCanal, setComunicarCanal] = useState(null);
  const [conexaoId, setConexaoId] = useState(null);
  const [usuarioIds, setUsuarioIds] = useState([]);
  const [elegiveis, setElegiveis] = useState([]);
  const [opcoesConexao, setOpcoesConexao] = useState({ WHATSAPP: [], EMAIL: [] });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aplicar(c) {
    setAtrasoRegra(c.atrasoRegra);
    setAtrasoMeses(c.atrasoMeses ?? '');
    setAtrasoSistema(c.atrasoSistema);
    setComunicarCanal(c.comunicarCanal);
    setConexaoId(c.conexaoId);
    setUsuarioIds(c.usuarioIds.map(String));
    setElegiveis(c.elegiveis);
    setOpcoesConexao(c.opcoesConexao);
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
        comunicarCanal,
        conexaoId,
        usuarioIds: usuarioIds.map(Number),
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

  const conexoesDoCanal = comunicarCanal ? opcoesConexao[comunicarCanal] || [] : [];

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
          titulo="Comunicação de alteração de cronograma"
          texto="Por onde sai o aviso quando o cronograma de uma obra é alterado, e quem recebe. A lista de usuários traz todos os Master e os usuários com acesso a esta empresa; o aviso vai para o WhatsApp ou o e-mail do cadastro do usuário."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Comunicação</label>
              <SearchableSelect
                value={comunicarCanal ?? ''}
                onChange={alterado((v) => {
                  setComunicarCanal(v || null);
                  setConexaoId(null);
                })}
                options={CANAIS}
                placeholder="Selecione o canal"
                corClasses={corCampo(Boolean(comunicarCanal))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Conexão</label>
              <SearchableSelect
                value={conexaoId ?? ''}
                onChange={alterado((v) => setConexaoId(v === '' || v === null ? null : Number(v)))}
                options={conexoesDoCanal.map((c) => ({ value: c.id, label: c.nome }))}
                disabled={!comunicarCanal}
                placeholder={comunicarCanal ? 'Selecione a conexão' : 'Escolha a comunicação primeiro'}
                emptyMessage={comunicarCanal === 'EMAIL' ? 'Nenhuma conexão de e-mail cadastrada para esta empresa.' : 'Nenhuma conexão Z-API cadastrada para esta empresa.'}
                corClasses={corCampo(Boolean(conexaoId))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Quem recebe os comunicados</label>
              <SearchableSelect
                multiple
                value={usuarioIds}
                onChange={alterado((lista) => setUsuarioIds((lista || []).map(String)))}
                options={elegiveis.map((u) => ({ value: String(u.id), label: `${u.nome} (${ROTULO_PERMISSAO[u.permissao] || u.permissao})` }))}
                placeholder="Selecione os usuários"
                emptyMessage="Nenhum usuário disponível."
                corClasses={corCampo(usuarioIds.length > 0)}
                larguraPainel={360}
              />
              {/* quem já recebe, à vista (o campo só diz "N selecionados"); o × tira da lista */}
              {usuarioIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {elegiveis
                    .filter((u) => usuarioIds.includes(String(u.id)))
                    .map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary-700"
                      >
                        {u.nome}
                        <button
                          type="button"
                          onClick={() => alterado(setUsuarioIds)(usuarioIds.filter((id) => id !== String(u.id)))}
                          title={`Tirar ${u.nome}`}
                          aria-label={`Tirar ${u.nome}`}
                          className="rounded-full p-0.5 text-primary-600 hover:bg-primary-100"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                </div>
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
