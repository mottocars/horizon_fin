import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, Settings, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import {
  obterConfiguracoesDre,
  previaPocDre,
  salvarDocumentosExcluidosDre,
  salvarPocReceitaDre,
} from '../../../api/dreConfiguracoes.api';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (iso) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}` : '');
const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const moeda = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const ORIGENS = { P: 'a pagar', R: 'a receber', E: 'extrato' };

// Mesmo destaque dos campos da aba Parâmetros da DFC (CampoParametro.jsx — duplicado aqui de
// propósito, telas não importam umas das outras): em branco fica âmbar; preenchido, azul claro.
const estadoCampo = (preenchido) =>
  preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400';

// Cabeçalho de sessão — mesmo da aba Parâmetros da DFC (DfcParametrosTab.jsx).
function SectionHeader({ selo, titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      {selo && <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>}
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Um parâmetro: rótulo e explicação à esquerda, campo à direita (mesmo par de CampoParametro.jsx).
// `travado`: regra fixa do sistema — mostra o valor com cadeado, sem edição. `extra`: abaixo da
// explicação.
function Linha({ label, desc, primeiro = false, travado = null, extra = null, children }) {
  return (
    <div className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_320px] sm:items-start sm:gap-4 ${primeiro ? '' : 'border-t border-gray-100'}`}>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
        {extra}
        {travado && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
            <Lock size={10} /> Regra fixa do sistema — não editável
          </p>
        )}
      </div>
      <div>
        {travado ? (
          <div className="flex w-full items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <Lock size={13} className="shrink-0 text-gray-400" />
            <span>{travado}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function Chips({ itens, cor }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {itens.length ? (
        itens.map((m) => (
          <span key={m.id} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>
            {m.descricao}
          </span>
        ))
      ) : (
        <span className="text-[11px] text-gray-400">Nenhuma máscara marcada na aba Máscaras.</span>
      )}
    </div>
  );
}

function Barra({ valor, cor }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <span className={`block h-full ${cor}`} style={{ width: `${Math.min(100, (valor || 0) * 100)}%` }} />
    </div>
  );
}

// Resumo (lado direito, como o da aba Parâmetros da DFC): a POC de cada obra até hoje, com a
// configuração salva — POC de Receita só existe com a máscara configurada.
function ResumoPoc({ previa, carregando }) {
  return (
    <Card className="xl:sticky xl:top-4">
      <SectionHeader
        titulo="Resumo"
        texto={
          carregando && !previa
            ? 'Calculando a POC das obras...'
            : `POC de cada obra até ${dataBr(previa?.ate)}, com a configuração salva.`
        }
      />
      {!previa ? null : !previa.obras.length ? (
        <p className="py-6 text-center text-xs text-gray-400">Nenhuma obra com orçamento ou unidades entre os centros com "Realiza DRE".</p>
      ) : (
        <div className={`-mx-2 mt-2 max-h-[70vh] space-y-1 overflow-y-auto ${carregando ? 'opacity-60' : ''}`}>
          {!previa.mascara && (
            <p className="mx-2 mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Sem Máscara DRE Nível 2, a POC de Receita não é gerada.
            </p>
          )}
          {previa.obras.map((o) => {
            const estourou = o.orcamento > 0 && o.custo_acumulado > o.orcamento;
            return (
              <div key={o.centro_id} className="rounded-lg px-2 py-2 hover:bg-gray-50">
                <p className="truncate text-xs font-medium text-gray-800" title={o.nome}>
                  {o.nome}
                </p>
                <p className="text-[11px] tabular-nums text-gray-400">
                  {o.orcamento ? `Orçamento ${moeda(o.orcamento)} · desde ${mesAno(o.orcamento_desde)}` : 'Sem orçamento (aba Orçamento)'}
                </p>
                {previa.mascara && o.orcamento > 0 && (
                  <p className={`text-[11px] tabular-nums ${estourou ? 'text-amber-700' : 'text-gray-400'}`}>
                    {estourou && <AlertTriangle size={10} className="mr-1 inline" />}
                    Custo acumulado {moeda(o.custo_acumulado)}
                  </p>
                )}
                <div className="mt-1.5 grid grid-cols-[56px_1fr_56px] items-center gap-2 text-[11px]">
                  <span className="text-gray-500">Receita</span>
                  <Barra valor={o.poc_receita} cor={estourou ? 'bg-amber-500' : 'bg-emerald-500'} />
                  <span className="text-right tabular-nums text-gray-700">{pct(o.poc_receita)}</span>
                  <span className="text-gray-500">Despesa</span>
                  <Barra valor={o.poc_despesa} cor="bg-red-400" />
                  <span
                    className="text-right tabular-nums text-gray-700"
                    title={o.poc_despesa === null ? '' : `Vendida ${pct(o.fracao_vendida)} + permuta ${pct(o.fracao_permuta)} · ${o.unidades} unidades`}
                  >
                    {pct(o.poc_despesa)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Operações > DRE Gerencial > Configurações (por empresa — regras em
// dre-configuracoes/dreConfiguracoes.service.js), no modelo da aba Parâmetros da DFC
// (DfcParametrosTab.jsx): cartão de status, uma sessão por assunto com os parâmetros em linhas
// (rótulo + explicação | campo) e o Resumo à direita. O botão "Salvar configurações" mora na barra da
// página (DreGerencialPage.jsx): esta aba expõe `salvar()` via ref e avisa o estado
// (`podeSalvar`/`salvando`) via `onStatusChange`.
// - Sessão 1, POC: Máscara DRE Nível 2 da POC de Receita (custo acumulado dela ÷ orçamento vigente
//   da obra, até 100%) — obrigatória, livre escolha, pelo id; sem ela a POC de Receita não é gerada.
//   A POC de Despesa (fração ideal vendida) é regra fixa, só explicada.
// - Sessão 2, Tipos de documento financeiro: à direita = fora da DRE (somem da aba Financeiro e do
//   custo da POC); tipo novo que chegar do Sienge entra sempre à esquerda.
const ConfiguracoesDreTab = forwardRef(function ConfiguracoesDreTab({ empresaId, onStatusChange }, ref) {
  const [dados, setDados] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [mascaraId, setMascaraId] = useState('');
  const [excluidos, setExcluidos] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState('');
  const [erro, setErro] = useState('');

  const aplicar = (d) => {
    setDados(d);
    setMascaraId(d.poc_receita_mascara_id ?? '');
    setExcluidos(d.excluidos);
  };

  const carregarPrevia = useCallback(() => {
    if (!empresaId) return;
    setCarregandoPrevia(true);
    previaPocDre(empresaId)
      .then(setPrevia)
      .catch(() => setPrevia(null))
      .finally(() => setCarregandoPrevia(false));
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    setDados(null);
    setPrevia(null);
    setErroCarga('');
    setSucesso('');
    setErro('');
    obterConfiguracoesDre(empresaId)
      .then(aplicar)
      .catch((e) => setErroCarga(e.response?.data?.message || 'Não foi possível carregar as configurações.'));
    carregarPrevia();
  }, [empresaId, carregarPrevia]);

  const opcoesMascara = useMemo(
    () => (dados?.mascaras || []).flatMap((g) => g.filhos.map((f) => ({ value: f.id, label: f.descricao, grupo: g.descricao }))),
    [dados]
  );
  const filhos = useMemo(() => (dados?.mascaras || []).flatMap((g) => g.filhos), [dados]);
  const receitaPoc = filhos.filter((f) => f.realiza_poc && f.tipo_poc === 'RECEITA');
  const despesaPoc = filhos.filter((f) => f.realiza_poc && f.tipo_poc === 'DESPESA');

  const mudouPoc = Boolean(dados) && String(mascaraId || '') !== String(dados.poc_receita_mascara_id ?? '');
  const mudouDocs = Boolean(dados) && [...excluidos].sort().join('|') !== [...dados.excluidos].sort().join('|');
  const podeSalvar = Boolean(dados) && (mudouPoc || mudouDocs) && !salvando;

  useEffect(() => {
    onStatusChange?.({ podeSalvar, salvando });
  }, [podeSalvar, salvando, onStatusChange]);

  async function salvar() {
    if (!podeSalvar) return;
    setErro('');
    setSucesso('');
    setSalvando(true);
    try {
      let d = dados;
      if (mudouPoc && mascaraId !== '') d = await salvarPocReceitaDre(empresaId, Number(mascaraId));
      if (mudouDocs) d = await salvarDocumentosExcluidosDre(empresaId, excluidos);
      aplicar(d);
      setSucesso('Configurações salvas.');
      carregarPrevia();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSalvando(false);
    }
  }

  useImperativeHandle(ref, () => ({ salvar }));

  const mexeu = () => {
    setSucesso('');
    setErro('');
  };

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] flex-col items-center justify-center rounded-tl-none text-center">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as configurações da DRE.</p>
      </Card>
    );
  }

  if (erroCarga || !dados) {
    return (
      <Card className="flex min-h-[280px] flex-col items-center justify-center rounded-tl-none text-center">
        {erroCarga ? (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <TriangleAlert size={15} /> {erroCarga}
          </p>
        ) : (
          <p className="text-sm text-gray-400">Carregando...</p>
        )}
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="space-y-4">
        <Card className="rounded-tl-none">
          <p className="text-sm font-medium text-gray-800">
            Configurações da DRE
            {dados.atualizado_em && (
              <span className="font-normal text-gray-400">
                {' '}
                · última alteração{dados.atualizado_por ? ` por ${dados.atualizado_por}` : ''} em {dataHora(dados.atualizado_em)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Valem para todas as obras da empresa. Ajuste as sessões abaixo e salve no botão do topo.
          </p>
          {erro && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle size={15} className="shrink-0" /> {erro}
            </div>
          )}
          {sucesso && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              <CheckCircle2 size={15} className="shrink-0" /> {sucesso}
            </div>
          )}
          {!erro && !sucesso && (mudouPoc || mudouDocs) && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600">
              <AlertTriangle size={15} className="shrink-0" /> Alterações não salvas.
              <button type="button" onClick={() => aplicar(dados)} className="ml-auto text-xs font-medium text-amber-700 hover:underline">
                Descartar
              </button>
            </div>
          )}
          {!erro && !sucesso && !(mudouPoc || mudouDocs) && !dados.poc_receita_mascara_id && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600">
              <AlertTriangle size={15} className="shrink-0" /> Escolha a Máscara DRE Nível 2 da POC de Receita — sem ela, a POC de Receita não é gerada.
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader
            selo="Sessão 1"
            titulo="POC — Percentual de obra concluída"
            texto="Como a DRE reconhece receitas e custos das obras ao longo da construção."
          />
          <div>
            <Linha
              primeiro
              label="Máscara DRE Nível 2"
              desc="Obrigatória. O custo acumulado desta máscara (aba Financeiro, desde o começo da obra), dividido pelo orçamento vigente da obra (aba Orçamento), dá a POC de Receita — limitada a 100%. Fica gravada pela máscara, não pelo nome: renomear não perde a configuração."
            >
              <SearchableSelect
                value={mascaraId}
                onChange={(v) => {
                  setMascaraId(v ?? '');
                  mexeu();
                }}
                options={opcoesMascara}
                placeholder="Selecione a máscara"
                emptyMessage="Nenhuma máscara de nível 2 (aba Máscaras)."
                clearable={false}
                corClasses={estadoCampo(Boolean(mascaraId))}
                larguraPainel={380}
              />
            </Linha>
            <Linha
              label="POC de Receita"
              desc="Custo acumulado da máscara acima ÷ orçamento vigente da obra, até 100%. Reconhece as máscaras marcadas com POC Receita na aba Máscaras:"
              extra={<Chips itens={receitaPoc} cor="bg-emerald-50 text-emerald-700" />}
              travado="Custo acumulado ÷ Orçamento vigente"
            />
            <Linha
              label="POC de Despesa"
              desc="Fração ideal das unidades vendidas — contratos ativos + permutas, sobre 100% do empreendimento (aba Unidades); distratos estornam a fração da unidade. Reconhece as máscaras marcadas com POC Despesa:"
              extra={<Chips itens={despesaPoc} cor="bg-red-50 text-red-600" />}
              travado="Fração ideal vendida"
            />
          </div>
        </Card>

        <Card>
          <SectionHeader
            selo="Sessão 2"
            titulo="Tipos de documento financeiro"
            texto="Os tipos à direita não entram na DRE: somem da aba Financeiro e do custo da POC. Todo tipo novo que chegar do Sienge entra sempre à esquerda (considerado). Clique para destacar e use as setas."
          />
          <div className="mt-4">
            <TransferList
              itens={dados.documentos}
              selecionados={excluidos}
              onChange={(lista) => {
                setExcluidos(lista);
                mexeu();
              }}
              getId={(d) => d.documento}
              getLabel={(d) =>
                `${d.documento}${d.nome ? ` — ${d.nome}` : ''} · ${d.lancamentos.toLocaleString('pt-BR')} (${
                  d.origens
                    .split('')
                    .map((o) => ORIGENS[o])
                    .join(', ') || 'sem lançamentos'
                })`
              }
              tituloDisponiveis="Considerados na DRE"
              tituloSelecionados="Fora da DRE"
              vazioDisponiveisTexto="Nenhum tipo considerado."
              vazioSelecionadosTexto="Nenhum tipo fora da DRE."
              corSelecionados={excluidos.length ? 'border-red-200' : 'border-gray-200'}
            />
          </div>
        </Card>
      </div>

      <ResumoPoc previa={previa} carregando={carregandoPrevia} />
    </div>
  );
});

export default ConfiguracoesDreTab;
