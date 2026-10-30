import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock, Settings, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';
import {
  obterConfiguracoesDre,
  previaPocDre,
  salvarAvaliacaoVerticalDre,
  salvarDocumentosExcluidosDre,
  salvarPocReceitaDre,
} from '../../../api/dreConfiguracoes.api';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (iso) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}` : '');
const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const moeda = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v) => (v === null || v === undefined ? '' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
// POC com 6 casas decimais, como no cálculo da DRE (backend utils/poc.js).
const pctPoc = (v) => (v === null || v === undefined ? '' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}%`);
const ORIGENS = { P: 'a pagar', R: 'a receber', E: 'extrato' };

// Mesmo par âmbar (vazio)/azul (preenchido) da aba Configurações do Saldo Contas Bancárias.
const corCampo = (preenchido) =>
  preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400';

// Cabeçalho de sessão — mesmo da aba Configurações do Saldo Contas Bancárias (título + descrição
// curta, separados do conteúdo por uma linha); `selo` ao lado do título.
function SectionHeader({ titulo, texto, selo }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        {titulo}
        {selo}
      </h3>
      {texto && <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Fórmula em "fração": numerador sobre denominador, como na apresentação do método.
function Formula({ rotulo, numerador, denominador, nota }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{rotulo}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="text-center">
          <p className="border-b border-gray-300 px-2 pb-1 text-sm font-medium text-gray-800">{numerador}</p>
          <p className="px-2 pt-1 text-sm text-gray-600">{denominador}</p>
        </div>
        {nota && <p className="text-xs text-gray-500">{nota}</p>}
      </div>
    </div>
  );
}

function Chips({ titulo, itens, cor }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] text-gray-400">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.length ? (
          itens.map((m) => (
            <span key={m.id} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>
              {m.descricao}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-gray-400">Nenhuma máscara marcada (aba Máscaras).</span>
        )}
      </div>
    </div>
  );
}

function Barra({ valor, cor }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <span className={`block h-full ${cor}`} style={{ width: `${Math.min(100, (valor || 0) * 100)}%` }} />
      </div>
      <span className="w-24 text-right text-xs tabular-nums text-gray-700">{pctPoc(valor)}</span>
    </div>
  );
}

// Operações > DRE Gerencial > Configurações (por empresa — regras em
// dre-configuracoes/dreConfiguracoes.service.js), em sessões empilhadas como a aba Configurações do
// Saldo Contas Bancárias:
// - POC de Receita: Máscara DRE Nível 2 de livre escolha e obrigatória — sem ela a POC de Receita
//   não é gerada. POC Receita = custo acumulado dessa máscara ÷ orçamento vigente da obra (aba
//   Orçamento), até 100%. Pelo id: o nome da máscara pode mudar.
// - POC de Despesa: fração ideal vendida (aba Unidades) — regra fixa, só explicada.
// - Avaliação Vertical: a linha de nível 1 (grupo ou totalizadora) que vale 100% na coluna AV % da aba
//   DRE; opcional (sem ela a AV % fica com traço).
// - Prévia por obra das duas POCs, até hoje (recalcula depois de salvar).
// - Tipos de documento financeiro: à direita = fora da DRE (somem da aba Financeiro); tipo novo que
//   chegar do Sienge entra sempre à esquerda (só os excluídos ficam gravados).
// Um "Salvar configurações" só, no fim da página.
export default function ConfiguracoesDreTab({ empresaId }) {
  const [dados, setDados] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [mascaraId, setMascaraId] = useState('');
  const [avId, setAvId] = useState('');
  const [excluidos, setExcluidos] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  const aplicar = (d) => {
    setDados(d);
    setMascaraId(d.poc_receita_mascara_id ?? '');
    setAvId(d.av_mascara_id ?? '');
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
    setErroCarga('');
    setSalvo(false);
    setErro('');
    obterConfiguracoesDre(empresaId)
      .then(aplicar)
      .catch((e) => setErroCarga(e.response?.data?.message || 'Não foi possível carregar as configurações.'));
    carregarPrevia();
  }, [empresaId, carregarPrevia]);

  const opcoesMascara = useMemo(
    () =>
      (dados?.mascaras || []).flatMap((g) =>
        g.filhos.map((f) => ({ value: f.id, label: f.descricao, grupo: g.descricao }))
      ),
    [dados]
  );
  // Avaliação Vertical: qualquer linha de nível 1, na ordem da DRE (grupos e totalizadoras).
  const opcoesNivel1 = useMemo(
    () => (dados?.mascaras || []).map((g) => ({ value: g.id, label: g.descricao })),
    [dados]
  );
  const avEscolhida = (dados?.mascaras || []).find((g) => String(g.id) === String(avId));
  const filhos = useMemo(() => (dados?.mascaras || []).flatMap((g) => g.filhos), [dados]);
  const receitaPoc = filhos.filter((f) => f.realiza_poc && f.tipo_poc === 'RECEITA');
  const despesaPoc = filhos.filter((f) => f.realiza_poc && f.tipo_poc === 'DESPESA');
  const mascaraEscolhida = filhos.find((f) => String(f.id) === String(mascaraId));

  const mudouPoc = dados && String(mascaraId || '') !== String(dados.poc_receita_mascara_id ?? '');
  const mudouAv = dados && String(avId || '') !== String(dados.av_mascara_id ?? '');
  const mudouDocs = dados && [...excluidos].sort().join('|') !== [...dados.excluidos].sort().join('|');
  const mudou = mudouPoc || mudouAv || mudouDocs;

  async function salvar() {
    setErro('');
    setSalvo(false);
    // A máscara é obrigatória: sem ela nada é gravado (o backend também recusa).
    if (!mascaraId) {
      setErro('Escolha a Máscara DRE Nível 2 da POC de Receita.');
      return;
    }
    setSalvando(true);
    try {
      let d = dados;
      if (mudouPoc) d = await salvarPocReceitaDre(empresaId, Number(mascaraId));
      if (mudouAv) d = await salvarAvaliacaoVerticalDre(empresaId, avId ? Number(avId) : null);
      if (mudouDocs) d = await salvarDocumentosExcluidosDre(empresaId, excluidos);
      aplicar(d);
      setSalvo(true);
      carregarPrevia();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSalvando(false);
    }
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as configurações da DRE.</p>
      </Card>
    );
  }

  if (erroCarga || !dados) {
    return (
      <Card className="rounded-tl-none">
        {erroCarga ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <TriangleAlert size={15} className="shrink-0" /> {erroCarga}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-tl-none">
          <SectionHeader
            titulo="POC de Receita"
            texto="Percentual de obra concluída usado no reconhecimento das receitas: o custo acumulado da máscara escolhida, dividido pelo orçamento da obra. Vale pelo id da máscara — se o nome mudar, a configuração continua."
          />
          <div className="mt-4">
            <Formula
              rotulo="Como é calculada"
              numerador={mascaraEscolhida ? mascaraEscolhida.descricao : 'Máscara DRE Nível 2'}
              denominador="Orçamento vigente da obra (aba Orçamento)"
              nota="limitada a 100%, mês a mês"
            />
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Máscara DRE Nível 2 <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={mascaraId}
                onChange={(v) => {
                  setMascaraId(v ?? '');
                  setSalvo(false);
                  setErro('');
                }}
                options={opcoesMascara}
                placeholder="Escolha a máscara"
                emptyMessage="Nenhuma máscara de nível 2 (aba Máscaras)."
                corClasses={corCampo(Boolean(mascaraId))}
                larguraPainel={380}
              />
              {!dados.poc_receita_mascara_id ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" /> Obrigatória: sem a máscara, a POC de Receita não é gerada.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-gray-400">
                  Configurado{dados.atualizado_por ? ` por ${dados.atualizado_por}` : ''} em {dataHora(dados.atualizado_em)}
                </p>
              )}
            </div>
            <Chips titulo="Aplica-se às máscaras marcadas com POC Receita" itens={receitaPoc} cor="bg-emerald-50 text-emerald-700" />
          </div>
        </Card>

        <Card>
          <SectionHeader
            titulo="POC de Despesa"
            selo={
              <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                <Lock size={10} /> Regra fixa
              </span>
            }
            texto="Percentual usado no reconhecimento dos custos: a fração ideal das unidades já vendidas. Não é configurável."
          />
          <div className="mt-4">
            <Formula
              rotulo="Como é calculada"
              numerador="Fração ideal vendida (contratos ativos + permutas)"
              denominador="Fração ideal total do empreendimento (100%)"
              nota="distratos estornam a fração da unidade"
            />
            <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-gray-500">
              <Info size={13} className="mt-0.5 shrink-0 text-gray-400" />
              Vem das unidades e contratos do Sienge (aba Unidades): cada unidade tem sua fração ideal, e a soma do
              empreendimento é 100%.
            </p>
            <Chips titulo="Aplica-se às máscaras marcadas com POC Despesa" itens={despesaPoc} cor="bg-red-50 text-red-600" />
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader
          titulo="Avaliação Vertical"
          texto="A linha de nível 1 que vale 100% na coluna AV % da aba DRE: dela para baixo, cada linha aparece como percentual dela, no consolidado e em cada centro de custo. Ex.: na Receita Líquida, a AV % começa com 100% nela e vai até o Lucro Líquido. Pode ser qualquer linha de nível 1 — a Receita Bruta, por exemplo."
        />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Linha de nível 1 (100%)</label>
            <SearchableSelect
              value={avId}
              onChange={(v) => {
                setAvId(v ?? '');
                setSalvo(false);
                setErro('');
              }}
              options={opcoesNivel1}
              placeholder="Sem avaliação vertical"
              emptyMessage="Nenhuma linha de nível 1 (aba Máscaras)."
              corClasses={corCampo(Boolean(avId))}
              larguraPainel={380}
            />
            <div className="mt-1.5 flex items-center gap-3">
              {!dados.av_mascara_id ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" /> Sem a linha, a coluna AV % fica com traço.
                </p>
              ) : (
                <p className="text-[11px] text-gray-400">Configurada: {dados.mascaras.find((g) => g.id === dados.av_mascara_id)?.descricao}</p>
              )}
              {avId && (
                <button
                  type="button"
                  onClick={() => {
                    setAvId('');
                    setSalvo(false);
                  }}
                  className="text-[11px] font-medium text-gray-500 hover:text-red-600"
                >
                  Remover
                </button>
              )}
            </div>
          </div>
          <Formula
            rotulo="Como é calculada"
            numerador="Valor da linha"
            denominador={avEscolhida ? avEscolhida.descricao : 'Linha de nível 1 escolhida'}
            nota="× 100, em cada coluna (consolidado e centros)"
          />
        </div>
      </Card>

      <Card>
        <SectionHeader
          titulo="Prévia da POC por obra"
          texto={`Até ${dataBr(previa?.ate)}, com a configuração salva. Custo acumulado = linhas da aba Financeiro na máscara configurada, desde o começo (com ajustes, plano de contas do centro e só os tipos de documento considerados na DRE).`}
        />
        <div className="mt-4">
          {carregandoPrevia && !previa ? (
            <div className="py-6 text-center text-sm text-gray-400">Calculando...</div>
          ) : !previa || !previa.obras.length ? (
            <p className="text-sm text-gray-400">Nenhuma obra com orçamento ou unidades entre os centros com "Realiza DRE".</p>
          ) : (
            <div className={carregandoPrevia ? 'opacity-60 transition-opacity' : ''}>
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-blue-500 bg-blue-50 text-left text-xs font-medium uppercase tracking-wide text-blue-700">
                    <th className="rounded-tl-lg px-3 py-2.5">Obra</th>
                    <th className="px-3 py-2.5 text-right">Orçamento vigente</th>
                    <th className="px-3 py-2.5 text-right">Custo acumulado</th>
                    <th className="px-3 py-2.5">POC Receita</th>
                    <th className="rounded-tr-lg px-3 py-2.5">POC Despesa</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.obras.map((o) => {
                    const estourou = o.orcamento > 0 && o.custo_acumulado > o.orcamento;
                    return (
                      <tr key={o.centro_id} className="border-b border-gray-100 text-xs">
                        <td className="truncate px-3 py-2 text-gray-800" title={o.nome}>
                          <span className="tabular-nums text-gray-400">{o.centro_id}</span> {o.nome}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {o.orcamento ? (
                            <>
                              {moeda(o.orcamento)}
                              <span className="block text-[10px] text-gray-400">desde {mesAno(o.orcamento_desde)}</span>
                            </>
                          ) : (
                            <span className="text-amber-600">Sem orçamento</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {previa.mascara ? (
                            <span className={estourou ? 'text-amber-700' : ''} title={estourou ? 'O custo acumulado passou do orçamento: a POC fica em 100%' : ''}>
                              {estourou && <AlertTriangle size={11} className="mr-1 inline" />}
                              {moeda(o.custo_acumulado)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {o.poc_receita === null ? (
                            <span className="text-gray-400">{previa.mascara ? 'sem orçamento' : 'não gerada (sem máscara)'}</span>
                          ) : (
                            <Barra valor={o.poc_receita} cor={estourou ? 'bg-amber-500' : 'bg-emerald-500'} />
                          )}
                        </td>
                        <td className="px-3 py-2" title={`Vendida ${pct(o.fracao_vendida)} + permuta ${pct(o.fracao_permuta)} · ${o.unidades} unidades`}>
                          {o.poc_despesa === null ? <span className="text-gray-400">sem unidades</span> : <Barra valor={o.poc_despesa} cor="bg-red-400" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader
          titulo="Tipos de documento financeiro"
          texto="Os tipos à direita não entram na DRE: somem da aba Financeiro e do custo da POC. Todo tipo novo que chegar do Sienge entra sempre à esquerda (considerado). Clique para destacar e use as setas."
        />
        <div className="mt-4">
          <TransferList
            itens={dados.documentos}
            selecionados={excluidos}
            onChange={(lista) => {
              setExcluidos(lista);
              setSalvo(false);
            }}
            getId={(d) => d.documento}
            getLabel={(d) =>
              `${d.documento}${d.nome ? ` — ${d.nome}` : ''} · ${d.lancamentos.toLocaleString('pt-BR')} (${d.origens
                .split('')
                .map((o) => ORIGENS[o])
                .join(', ') || 'sem lançamentos'})`
            }
            tituloDisponiveis="Considerados na DRE"
            tituloSelecionados="Fora da DRE"
            vazioDisponiveisTexto="Nenhum tipo considerado."
            vazioSelecionadosTexto="Nenhum tipo fora da DRE."
            corSelecionados={excluidos.length ? 'border-red-200' : 'border-gray-200'}
          />
        </div>
      </Card>

      {/* Um Salvar só, no fim da página, pra todas as configurações desta aba. */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={salvar} loading={salvando} disabled={!mudou}>
            Salvar configurações
          </Button>
          {mudou && !salvando && <span className="text-xs text-amber-700">Alterações não salvas</span>}
          {mudou && (
            <button
              type="button"
              onClick={() => {
                aplicar(dados);
                setErro('');
              }}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Descartar
            </button>
          )}
          {salvo && !mudou && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Configurações salvas
            </span>
          )}
          {carregandoPrevia && previa && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Recalculando a prévia...
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
