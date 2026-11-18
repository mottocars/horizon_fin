import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { getConfigDfcReforma, restaurarConfigDfcReforma, salvarConfigDfcReforma } from '../../../api/reformaTributaria.api';

const corCampo = (preenchido) => (preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400');
const ANOS_SPLIT = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

function SectionHeader({ titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Cartões de rádio (mesmo desenho das Configurações de Cronogramas Obras).
function Opcoes({ nome, opcoes, valor, onChange }) {
  return (
    <div role="radiogroup" className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-2">
      {opcoes.map((o) => {
        const ativo = valor === o.value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              ativo ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input type="radio" name={nome} checked={ativo} onChange={() => onChange(o.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
            <span>
              <span className="block text-sm font-medium text-gray-900">{o.titulo}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{o.texto}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CampoMeses({ rotulo, valor, onChange }) {
  return (
    <div className="mt-4 max-w-xs">
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={24}
          step={1}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={`w-28 rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo(valor !== '')}`}
        />
        <span className="text-sm text-gray-500">meses</span>
      </div>
    </div>
  );
}

// Uma lista de contas do DFC: seleção múltipla com busca e, embaixo, as contas marcadas.
function CampoContas({ rotulo, ajuda, valor, onChange, opcoes, nomes, sugestao }) {
  const marcadas = valor.map((id) => nomes.get(String(id))).filter(Boolean);
  const igualSugestao = sugestao.length === valor.length && sugestao.every((id) => valor.includes(String(id)));
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      <SearchableSelect
        multiple
        todosELimpar
        value={valor}
        onChange={onChange}
        options={opcoes}
        placeholder="Nenhuma conta"
        larguraPainel={520}
        alturaLista="max-h-80"
        corClasses={corCampo(valor.length > 0)}
      />
      <p className="mt-1 text-xs leading-relaxed text-gray-500">
        {ajuda}
        {!igualSugestao && sugestao.length > 0 && (
          <>
            {' '}
            <button type="button" onClick={() => onChange(sugestao.map(String))} className="font-medium text-primary-600 hover:text-primary-700">
              Usar a sugestão ({sugestao.length})
            </button>
          </>
        )}
      </p>
      {marcadas.length > 0 && <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{marcadas.join(' · ')}</p>}
    </div>
  );
}

// Aba Configurações DFC: o que o Impacto DFC precisa saber do fluxo de caixa — quais contas são os
// recebimentos de venda (base do imposto), os pagamentos de custo de obra (crédito) e o RET de hoje — e
// como o imposto é pago (prazo, split payment, saldo credor). Um Card por parâmetro e um Salvar no fim.
export default function ConfiguracoesDfcTab({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [contas, setContas] = useState([]);
  const [sugestao, setSugestao] = useState({ contas_receita: [], contas_custo: [], contas_ret: [] });
  const [receita, setReceita] = useState([]);
  const [custo, setCusto] = useState([]);
  const [ret, setRet] = useState([]);
  const [prazo, setPrazo] = useState('');
  const [split, setSplit] = useState('NAO');
  const [splitAno, setSplitAno] = useState('2027');
  const [saldoCredor, setSaldoCredor] = useState('COMPENSAR');
  const [prazoRess, setPrazoRess] = useState('');
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aplicar(c) {
    setContas(c.contas);
    setSugestao(c.sugestao);
    setReceita(c.contas_receita.map(String));
    setCusto(c.contas_custo.map(String));
    setRet(c.contas_ret.map(String));
    setPrazo(String(c.prazo_recolhimento));
    setSplit(c.split_inicio ? 'SIM' : 'NAO');
    setSplitAno(c.split_inicio ? c.split_inicio.slice(0, 4) : '2027');
    setSaldoCredor(c.saldo_credor);
    setPrazoRess(String(c.prazo_ressarcimento));
    setInfo({ padrao: c.padrao, atualizado_em: c.atualizado_em, usuario: c.usuario });
  }

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    setSalvo(false);
    getConfigDfcReforma(empresaId)
      .then(aplicar)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as configurações do DFC.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const opcoes = useMemo(() => contas.map((c) => ({ value: String(c.id), label: `${c.id} · ${c.nome} — ${c.mascara}` })), [contas]);
  const nomes = useMemo(() => new Map(contas.map((c) => [String(c.id), c.nome])), [contas]);
  const alterado = (setter) => (v) => {
    setter(v);
    setSalvo(false);
  };

  async function salvar() {
    setErro('');
    setSalvo(false);
    if (prazo === '' || prazoRess === '') {
      setErro('Informe os prazos (use 0 para o mesmo mês).');
      return;
    }
    setSalvando(true);
    try {
      aplicar(
        await salvarConfigDfcReforma(empresaId, {
          contas_receita: receita.map(Number),
          contas_custo: custo.map(Number),
          contas_ret: ret.map(Number),
          prazo_recolhimento: Number(prazo),
          split_inicio: split === 'SIM' ? `${splitAno}-01` : null,
          saldo_credor: saldoCredor,
          prazo_ressarcimento: Number(prazoRess),
        })
      );
      setSalvo(true);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    setErro('');
    setSalvando(true);
    try {
      aplicar(await restaurarConfigDfcReforma(empresaId));
      setSalvo(true);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível restaurar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ajustar como a reforma entra no fluxo de caixa.</p>
      </Card>
    );
  }

  const ressarcimentoVale = split === 'SIM' || saldoCredor === 'RESSARCIR';

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          titulo="Contas do DFC"
          texto="Quais contas do plano do DFC entram no cálculo. Os recebimentos de venda são a base do imposto sobre a receita (o RET de hoje e o IBS/CBS); os pagamentos de custo de obra geram crédito, no percentual de cada obra (aba Centros de Custos); as contas do RET saem da projeção, porque o imposto de hoje é recalculado sobre os recebimentos."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <CampoContas
              rotulo="Recebimentos de venda"
              ajuda="Parcelas dos clientes, repasses e medições da Caixa. Não marque financiamento PJ nem aportes."
              valor={receita}
              onChange={alterado(setReceita)}
              opcoes={opcoes}
              nomes={nomes}
              sugestao={sugestao.contas_receita}
            />
            <CampoContas
              rotulo="Pagamentos de custo de obra (geram crédito)"
              ajuda="Materiais, empreiteiros, equipamentos. A folha própria pode ficar: o % de cada obra já desconta o que não gera crédito."
              valor={custo}
              onChange={alterado(setCusto)}
              opcoes={opcoes}
              nomes={nomes}
              sugestao={sugestao.contas_custo}
            />
            <CampoContas
              rotulo="Contas do RET"
              ajuda="Onde o DFC projeta o RET de hoje, se projetar."
              valor={ret}
              onChange={alterado(setRet)}
              opcoes={opcoes}
              nomes={nomes}
              sugestao={sugestao.contas_ret}
            />
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="Pagamento do imposto"
          texto="Quando o imposto sai do caixa. Sem split payment, o imposto apurado no mês é pago depois do prazo de recolhimento. Com split payment, o IBS/CBS é retido no próprio recebimento: o dinheiro já chega líquido."
        />
        {!carregando && (
          <>
            <CampoMeses rotulo="Prazo de recolhimento (do fato ao pagamento)" valor={prazo} onChange={alterado(setPrazo)} />
            <Opcoes
              nome="split"
              valor={split}
              onChange={alterado(setSplit)}
              opcoes={[
                { value: 'NAO', titulo: 'Sem split payment', texto: 'A empresa apura e paga o IBS/CBS: débito do mês − crédito − saldo credor, no prazo de recolhimento.' },
                { value: 'SIM', titulo: 'Com split payment', texto: 'O IBS/CBS de cada recebimento é retido na hora. O crédito não abate a retenção: vira saldo credor e volta por ressarcimento.' },
              ]}
            />
            {split === 'SIM' && (
              <div className="mt-4 max-w-xs">
                <label className="mb-1 block text-sm font-medium text-gray-700">Split payment a partir de</label>
                <SearchableSelect
                  value={splitAno}
                  onChange={alterado((v) => setSplitAno(v || '2027'))}
                  clearable={false}
                  options={ANOS_SPLIT.map((a) => ({ value: String(a), label: `janeiro de ${a}` }))}
                  corClasses={corCampo(true)}
                />
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="Saldo credor"
          texto="Na obra, as compras costumam gerar mais crédito do que o débito dos recebimentos. O que sobra de crédito vira saldo credor: ou abate o imposto dos meses seguintes, ou é pedido de volta (ressarcimento). Com split payment, ele sempre volta por ressarcimento."
        />
        {!carregando && (
          <>
            <Opcoes
              nome="saldo-credor"
              valor={split === 'SIM' ? 'RESSARCIR' : saldoCredor}
              onChange={(v) => split !== 'SIM' && alterado(setSaldoCredor)(v)}
              opcoes={[
                { value: 'COMPENSAR', titulo: 'Compensar', texto: 'Abate o IBS/CBS a pagar nos meses seguintes. O que sobrar no fim da obra fica parado.' },
                { value: 'RESSARCIR', titulo: 'Pedir ressarcimento', texto: 'O saldo credor de cada mês é pedido de volta e entra no caixa depois do prazo do ressarcimento.' },
              ]}
            />
            {ressarcimentoVale && <CampoMeses rotulo="Prazo do ressarcimento" valor={prazoRess} onChange={alterado(setPrazoRess)} />}
          </>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={salvar} loading={salvando} disabled={carregando}>
            Salvar configurações
          </Button>
          <Button type="button" variant="secondary" onClick={restaurar} disabled={carregando || salvando || info?.padrao}>
            Restaurar padrão
          </Button>
          {salvo ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Configurações salvas
            </span>
          ) : (
            info && (
              <span className="text-xs text-gray-500">
                {info.padrao
                  ? 'Usando o padrão: contas sugeridas pelo nome, imposto pago no mês seguinte, sem split payment.'
                  : `Salvo em ${new Date(info.atualizado_em).toLocaleDateString('pt-BR')}${info.usuario ? ` por ${info.usuario}` : ''}.`}
              </span>
            )
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
