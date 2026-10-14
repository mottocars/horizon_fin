import { useEffect, useState } from 'react';
import { Calculator, RefreshCw, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { getFichaDesembolsoDfc, recalcularFichaDesembolsoDfc } from '../../../api/dfcDesembolso.api';

// M0, M+1, M+2, M+3+ (o tema só tem primary 50/100/500/600/700 — os claros vêm do azul padrão).
const CORES = ['bg-primary-700', 'bg-primary-500', 'bg-blue-300', 'bg-blue-200'];

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const data = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const dataHora = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const CHIPS = {
  alta: ['padrão claro', 'bg-emerald-50 text-emerald-700'],
  media: ['padrão parcial', 'bg-amber-50 text-amber-700'],
  baixa: ['sem padrão', 'bg-red-50 text-red-700'],
  pouca: ['poucos títulos', 'bg-gray-100 text-gray-500'],
};

// Curva com M+3 em diante juntos (o que se usa pra projetar).
function curvaCurta(curva) {
  const m = Object.fromEntries(curva.map((c) => [c.mes, c.pct_valor]));
  const resto = ['M+3', 'M+4', 'M+5', 'M+6 ou mais'].reduce((t, k) => t + (m[k] || 0), 0);
  return [
    ['M0', m.M0 || 0],
    ['M+1', m['M+1'] || 0],
    ['M+2', m['M+2'] || 0],
    ['M+3+', Math.round(resto * 10) / 10],
  ];
}

function Curva({ curva }) {
  const c = curvaCurta(curva);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded bg-gray-100">
        {c.map(([k, v], i) => (v > 0 ? <span key={k} className={CORES[i]} style={{ width: `${v}%` }} title={`${k}: ${pct(v)}`} /> : null))}
      </div>
      <p className="mt-1 font-mono text-[11px] text-gray-500">
        {c
          .filter(([, v]) => v >= 0.5)
          .map(([k, v]) => `${k} ${Math.round(v)}%`)
          .join(' · ')}
      </p>
    </div>
  );
}

function Barras({ itens }) {
  return (
    <div className="space-y-1.5">
      {itens.map(([rotulo, v]) => (
        <div key={rotulo} className="grid grid-cols-[120px_minmax(0,1fr)_48px] items-center gap-2 text-xs text-gray-700">
          <span>{rotulo}</span>
          <span className="h-2.5 overflow-hidden rounded-sm bg-gray-100">
            <span className="block h-full rounded-sm bg-primary-500" style={{ width: `${Math.min(100, v)}%` }} />
          </span>
          <span className="text-right font-mono text-[11px] text-gray-500">{pct(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Lista({ itens }) {
  return (
    <div className="divide-y divide-dashed divide-gray-200 text-xs">
      {itens.map(([titulo, sub, valor]) => (
        <div key={titulo + sub} className="flex justify-between gap-3 py-1.5">
          <span className="min-w-0">
            <span className="block text-gray-800">{titulo}</span>
            <span className="block text-[11px] text-gray-400">{sub}</span>
          </span>
          <span className="shrink-0 font-mono text-[11px] text-gray-500">{valor}</span>
        </div>
      ))}
    </div>
  );
}

const Titulo = ({ children }) => <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{children}</h4>;

// Aba Plano Contas, ícone da calculadora numa natureza "SIENGE - EMPRESARIAL DESEMBOLSO": a ficha de
// desembolso dela (a mesma "Ficha de cada natureza" do relatório Prazos de Desembolso), guardada no
// banco (backend dfc-desembolso). "Recalcular" refaz com os títulos dos últimos 12 meses. A curva
// é o cronograma que espalha o Orçamento Empresarial do Sienge no Orçamento do DFC (dfc-empresarial).
// `conta`: { sienge_id, codigo, name }. `onRecalculada(ficha)`: atualiza o Prazo Desembolso na grade.
export default function FichaDesembolsoModal({ open, onClose, empresaId, conta, onRecalculada }) {
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState('');
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    if (!open || !conta) return;
    setFicha(null);
    setErro('');
    getFichaDesembolsoDfc(empresaId, conta.sienge_id)
      .then(setFicha)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar a ficha.'));
  }, [open, conta, empresaId]);

  async function recalcular() {
    setRecalculando(true);
    setErro('');
    try {
      const nova = await recalcularFichaDesembolsoDfc(empresaId, conta.sienge_id);
      setFicha(nova);
      onRecalculada?.(nova);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível recalcular.');
    } finally {
      setRecalculando(false);
    }
  }

  if (!conta) return null;
  const chip = ficha && !ficha.sem_historico ? CHIPS[ficha.amostra_pequena ? 'pouca' : ficha.confianca] : null;

  return (
    <Modal open={open} onClose={onClose} title="Ficha de desembolso" maxWidthClass="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Calculator size={18} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-xs text-gray-400">{conta.codigo}</p>
              <p className="text-sm font-semibold text-gray-900">{conta.name}</p>
            </div>
          </div>
          {chip && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip[1]}`}>{chip[0]}</span>}
        </div>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <TriangleAlert size={15} className="shrink-0" />
            {erro}
          </div>
        )}

        {!ficha && !erro ? (
          <p className="py-10 text-center text-sm text-gray-400">Calculando a ficha...</p>
        ) : ficha?.sem_historico ? (
          <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700">
            Nenhum título desta natureza emitido de {data(ficha.periodo_de)} a {data(ficha.periodo_ate)} no contas a pagar
            — sem base pra definir a forma de desembolso. Use a regra de uma natureza parecida.
          </p>
        ) : ficha ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [ficha.titulos.toLocaleString('pt-BR'), 'títulos'],
                [brl(ficha.valor), 'valor no período'],
                [`${ficha.prazo_mediano} d`, 'prazo mediano'],
                [`${Math.round(ficha.prazo_medio)} d`, 'prazo médio (Prazo Desembolso)'],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="font-mono text-base font-medium text-gray-900">{v}</p>
                  <p className="text-[11px] text-gray-500">{l}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 rounded-r-lg border-l-[3px] border-primary-600 bg-gray-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">
                Cronograma de desembolso · usado no Orçamento Empresarial
              </p>
              <p className="text-sm font-semibold text-gray-900">{ficha.sugestao}</p>
              <Curva curva={ficha.curva} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Titulo>Parcelas por título (% do valor)</Titulo>
                <Barras
                  itens={ficha.parcelas_por_titulo.map((x) => [
                    `${x.n === '6+' ? '6 ou mais' : x.n} parcela${x.n === '1' ? '' : 's'}`,
                    x.pct_valor,
                  ])}
                />
              </div>
              <div>
                <Titulo>Prazo da parcela (% do valor)</Titulo>
                <Barras itens={ficha.faixas_prazo.filter((f) => f.pct_valor > 0).map((f) => [f.faixa, f.pct_valor])} />
              </div>
              <div>
                <Titulo>Padrões mais comuns</Titulo>
                <Lista itens={ficha.padroes.slice(0, 5).map((p) => [p.padrao, `${p.titulos.toLocaleString('pt-BR')} título(s)`, pct(p.pct_valor)])} />
              </div>
              <div>
                <Titulo>Maiores credores</Titulo>
                <Lista itens={ficha.credores.map((c) => [c.nome, c.padrao, pct(c.pct_valor)])} />
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <p className="text-[11px] text-gray-400">
            {ficha
              ? `Títulos emitidos de ${data(ficha.periodo_de)} a ${data(ficha.periodo_ate)}, sem previsões e sem parcelas canceladas ou substituídas · calculada em ${dataHora(ficha.calculado_em)}${ficha.calculado_por ? ` por ${ficha.calculado_por}` : ''}`
              : ''}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={recalcular} loading={recalculando} disabled={!ficha || recalculando}>
              {!recalculando && <RefreshCw size={15} />}
              Recalcular
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
