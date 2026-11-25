import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { formatarData, formatarDataHora, formatarMoeda } from './ClustersCobranca/constantes';

// Valor das colunas da Rotina e da Gestão das Parcelas com a conta por trás (pedido de 25/11/2026): clicar
// no valor abre uma janela com
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
    <div className="text-sm">
      <Linha rotulo="Valor Original" valor={c.original} />
      <div className="my-2 border-t border-gray-200" />
      <Linha rotulo="Valor Corrigido" valor={c.corrigido} />
      <Linha sinal="+" rotulo="Acréscimos" valor={c.acrescimos} fraco={!c.acrescimos} />
      {comMultaJuros && <Linha sinal="+" rotulo="Multa" valor={c.multa} fraco={!c.multa} />}
      {comMultaJuros && <Linha sinal="+" rotulo="Juros" valor={c.juros} fraco={!c.juros} />}
      <Linha sinal="−" rotulo="Desconto" valor={c.desconto} fraco={!c.desconto} />
      {/* Só quando existem (poucas baixas): sem elas o Total não bateria com o líquido recebido. */}
      {Boolean(c.impostos) && <Linha sinal="−" rotulo="Impostos retidos" valor={c.impostos} />}
      {Boolean(c.seguro_taxa) && <Linha sinal="+" rotulo="Seguro / taxa adm." valor={c.seguro_taxa} />}
      <div className="my-2 border-t border-gray-300" />
      <Linha sinal="=" rotulo="Total" valor={c.total} forte />
      {notas.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs leading-snug text-gray-500">
          {notas.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// O valor (sem centavos, como nas tabelas) clicável: abre a composição numa janela no centro da tela, que
// fecha ao clicar fora (no fundo escurecido), no X ou com Esc. Sem composição, mostra só o texto.
// Os cliques não chegam à linha da tabela (que abre/fecha ao ser clicada): o portal do React repassa os
// eventos aos componentes de cima, então o botão e a janela param a propagação.
export default function ComposicaoValor({ valor, composicao, className = '' }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [aberto]);

  if (!composicao) return <span className={className}>{valorSemCentavos(valor)}</span>;

  const parar = (e) => e.stopPropagation();
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        onMouseDown={parar}
        title="Ver a composição do valor"
        className={`cursor-pointer tabular-nums underline decoration-dotted decoration-gray-300 underline-offset-4 hover:text-primary-700 hover:decoration-primary-500 ${className}`}
      >
        {valorSemCentavos(valor)}
      </button>
      {aberto &&
        createPortal(
          <div
            role="presentation"
            onMouseDown={parar}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) setAberto(false);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 text-left font-normal"
          >
            <div role="dialog" aria-modal="true" aria-label="Composição do valor" className="w-full max-w-sm rounded-card bg-white shadow-card">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">Composição do valor</h2>
                <button type="button" onClick={() => setAberto(false)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                  <X size={20} />
                </button>
              </div>
              <div className="p-5">
                <Quadro composicao={composicao} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
