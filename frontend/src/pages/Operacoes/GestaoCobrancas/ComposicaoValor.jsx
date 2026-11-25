import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatarData, formatarDataHora, formatarMoeda } from './ClustersCobranca/constantes';

// Valor das colunas da Rotina e da Gestão das Parcelas com a conta por trás (pedido de 25/11/2026): clicar
// no valor abre um quadro com
//   Valor Original | Valor Corrigido + Acréscimos (+ Multa + Juros) − Desconto = Total
// `composicao` vem do backend (cobranca-acrescimos/composicao.js): 'aberta' (acréscimo do Sienge, sem
// separar multa e juros), 'paga' (somas dos recebimentos) ou 'soma' (linhas de agrupamento).

const CAMPOS = ['original', 'corrigido', 'acrescimos', 'multa', 'juros', 'desconto', 'impostos', 'seguro_taxa', 'total'];

function valorSemCentavos(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// Soma no navegador (totais da Rotina, montados aqui a partir dos itens).
export function somarComposicoes(lista) {
  const validas = lista.filter(Boolean);
  if (!validas.length) return null;
  const soma = { tipo: 'soma', parcelas: 0, calculado_em: null, sem_calculo: 0 };
  CAMPOS.forEach((k) => {
    soma[k] = 0;
  });
  const tipos = new Set();
  for (const c of validas) {
    tipos.add(c.tipo === 'soma' ? c.tipo_base : c.tipo);
    soma.parcelas += c.parcelas || 1;
    CAMPOS.forEach((k) => {
      soma[k] += Number(c[k]) || 0;
    });
    if (c.calculado_em && (!soma.calculado_em || new Date(c.calculado_em) > new Date(soma.calculado_em))) soma.calculado_em = c.calculado_em;
    soma.sem_calculo += c.tipo === 'soma' ? c.sem_calculo || 0 : c.sem_calculo ? 1 : 0;
  }
  soma.tipo_base = tipos.size === 1 ? [...tipos][0] : 'misto';
  return soma;
}

function Linha({ sinal, rotulo, valor, forte, fraco }) {
  return (
    <div className={`flex items-baseline justify-between gap-6 py-0.5 ${forte ? 'font-semibold text-gray-900' : fraco ? 'text-gray-400' : 'text-gray-700'}`}>
      <span>
        <span className="inline-block w-3 text-gray-400">{sinal}</span>
        {rotulo}
      </span>
      <span className="tabular-nums">{formatarMoeda(valor)}</span>
    </div>
  );
}

function Quadro({ composicao: c }) {
  const base = c.tipo === 'soma' ? c.tipo_base : c.tipo;
  // Em aberto o Sienge não separa multa e juros (só o acréscimo) — as linhas só aparecem onde existem.
  const comMultaJuros = base !== 'aberta';
  const notas = [];
  if (c.tipo === 'soma') notas.push(`Soma de ${c.parcelas} ${c.parcelas === 1 ? 'parcela' : 'parcelas'}.`);
  if (base === 'paga' || base === 'misto') {
    notas.push('Pagas: valores dos recebimentos no Sienge. "Acréscimos" é o que o Sienge cobrou além da multa e dos juros.');
    if (c.tipo === 'paga' && c.pago_em) notas.push(`Último recebimento em ${formatarData(c.pago_em)}.`);
  }
  if (base === 'aberta' || base === 'misto') {
    if (c.calculado_em) notas.push(`Acréscimo calculado pelo Sienge em ${formatarDataHora(c.calculado_em)} (cresce a cada dia de atraso).`);
    if (c.sem_calculo) {
      notas.push(
        c.tipo === 'soma'
          ? `${c.sem_calculo} parcela(s) vencida(s) ainda sem acréscimo consultado no Sienge.`
          : 'Acréscimo ainda não consultado no Sienge (rotina "Acréscimos das parcelas vencidas" do Monitor de Integrações).'
      );
    }
  }
  return (
    <div className="w-72 text-xs">
      <p className="mb-2 font-semibold text-gray-900">Composição do valor</p>
      <Linha rotulo="Valor Original" valor={c.original} />
      <div className="my-1.5 border-t border-gray-200" />
      <Linha rotulo="Valor Corrigido" valor={c.corrigido} />
      <Linha sinal="+" rotulo="Acréscimos" valor={c.acrescimos} fraco={!c.acrescimos} />
      {comMultaJuros && <Linha sinal="+" rotulo="Multa" valor={c.multa} fraco={!c.multa} />}
      {comMultaJuros && <Linha sinal="+" rotulo="Juros" valor={c.juros} fraco={!c.juros} />}
      <Linha sinal="−" rotulo="Desconto" valor={c.desconto} fraco={!c.desconto} />
      {/* Só quando existem (poucas baixas): sem elas o Total não bateria com o líquido recebido. */}
      {Boolean(c.impostos) && <Linha sinal="−" rotulo="Impostos retidos" valor={c.impostos} />}
      {Boolean(c.seguro_taxa) && <Linha sinal="+" rotulo="Seguro / taxa adm." valor={c.seguro_taxa} />}
      <div className="my-1.5 border-t border-gray-300" />
      <Linha sinal="=" rotulo="Total" valor={c.total} forte />
      {notas.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-500">
          {notas.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// O valor (sem centavos, como nas tabelas) clicável. Sem composição (ou valor zerado sem nada por trás),
// mostra só o texto. O clique não abre/fecha a linha da tabela (stopPropagation).
export default function ComposicaoValor({ valor, composicao, className = '' }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const botaoRef = useRef(null);
  const quadroRef = useRef(null);

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return;
    const b = botaoRef.current.getBoundingClientRect();
    const largura = 304; // w-72 + padding
    const altura = quadroRef.current?.offsetHeight || 240;
    const left = Math.max(8, Math.min(b.left + b.width / 2 - largura / 2, window.innerWidth - largura - 8));
    const cabeAbaixo = b.bottom + 6 + altura <= window.innerHeight - 8;
    setPos({ left, top: cabeAbaixo ? b.bottom + 6 : Math.max(8, b.top - 6 - altura) });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (e) => {
      if (quadroRef.current?.contains(e.target) || botaoRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const tecla = (e) => e.key === 'Escape' && setAberto(false);
    const rolou = (e) => {
      if (!quadroRef.current?.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', rolou);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', rolou);
    };
  }, [aberto]);

  if (!composicao) return <span className={className}>{valorSemCentavos(valor)}</span>;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="Ver a composição do valor"
        className={`cursor-pointer tabular-nums underline decoration-dotted decoration-gray-300 underline-offset-4 hover:text-primary-700 hover:decoration-primary-500 ${className}`}
      >
        {valorSemCentavos(valor)}
      </button>
      {aberto &&
        createPortal(
          <div
            ref={quadroRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="z-[100] rounded-lg border border-gray-200 bg-white p-3 text-left font-normal shadow-lg"
          >
            <Quadro composicao={composicao} />
          </div>,
          document.body
        )}
    </>
  );
}
