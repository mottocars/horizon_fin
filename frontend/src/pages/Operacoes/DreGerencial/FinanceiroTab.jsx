import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarDays, Lock, PencilLine, TriangleAlert, Wallet } from 'lucide-react';
import { listarExerciciosDre } from '../../../api/dreFinanceiro.api';
import LancamentosExercicio from './LancamentosExercicio';

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function plural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// Mesmo card dos planos da aba Plano Contas (PlanosContasLista.jsx): ícone, título e rodapé. Exercício
// travado (o do ano atual): em amarelo sutil, com cadeado e "Somente visualização" — nada nele pode ser
// alterado. Quantidades: títulos distintos a receber e a pagar emitidos no ano (um título tem várias
// parcelas), movimentações do extrato sem título e quantos lançamentos (títulos e movimentos) têm
// ajuste (lancamentos_ajustes).
// Clicar abre os lançamentos do exercício.
function CardExercicio({ exercicio, atual, onAbrir }) {
  const travado = exercicio.travado;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex flex-col rounded-xl border p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-100 ${
        travado
          ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
          : `${atual ? 'border-primary-100' : 'border-gray-200/80'} bg-white hover:border-primary-500`
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            travado ? 'bg-amber-100 text-amber-600' : 'bg-primary-50 text-primary-600'
          }`}
        >
          <CalendarDays size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-gray-400">{atual ? 'Exercício atual' : 'Exercício'}</p>
          <p className="text-lg font-semibold leading-snug tabular-nums text-gray-900">{exercicio.ano}</p>
        </div>
        {travado && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
            title="Exercício em andamento: só pode ser visualizado, não pode ser alterado"
          >
            <Lock size={11} /> Somente visualização
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5 text-[11px] text-gray-500">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <ArrowDownLeft size={12} className="text-emerald-500" /> Contas a receber
          </span>
          <span className="tabular-nums">{plural(exercicio.receber, 'título', 'títulos')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <ArrowUpRight size={12} className="text-red-400" /> Contas a pagar
          </span>
          <span className="tabular-nums">{plural(exercicio.pagar, 'título', 'títulos')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <ArrowLeftRight size={12} className="text-gray-400" /> Movimentações
          </span>
          <span className="tabular-nums">{plural(exercicio.movimentos || 0, 'lançamento', 'lançamentos')}</span>
        </div>
        <div className={`flex items-center justify-between ${exercicio.ajustados ? 'font-medium text-violet-700' : ''}`}>
          <span className="flex items-center gap-1">
            <PencilLine size={12} className={exercicio.ajustados ? 'text-violet-500' : 'text-gray-400'} /> Lançamentos ajustados
          </span>
          <span className="tabular-nums">{plural(exercicio.ajustados || 0, 'lançamento', 'lançamentos')}</span>
        </div>
      </div>

      <div className={`mt-4 border-t pt-3 text-[11px] text-gray-500 ${travado ? 'border-amber-100' : 'border-gray-100'}`}>
        Títulos emitidos e movimentos de 01/01 a 31/12/{exercicio.ano}
      </div>
    </button>
  );
}

// Operações > DRE Gerencial > Financeiro: um card por exercício (ano), do atual até o ano do primeiro
// lançamento financeiro da empresa — o menor vencimento do contas a pagar e a receber (regra em
// dre-financeiro/financeiro.service.js) —, do mais novo pro mais antigo. Clicar num card abre os
// lançamentos dele (LancamentosExercicio); o exercício aberto vem da URL (DreGerencialPage.jsx).
export default function FinanceiroTab({ empresaId, exercicio = null, onAbrir, search = '' }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setErro('');
    listarExerciciosDre(empresaId)
      .then(setDados)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar os exercícios.'));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    carregar();
  }, [carregar]);

  // Voltando de um exercício, recarrega os cards (um ajuste feito lá muda os "Títulos ajustados").
  const exercicioAnterior = useRef(exercicio);
  useEffect(() => {
    if (exercicioAnterior.current && !exercicio) carregar();
    exercicioAnterior.current = exercicio;
  }, [exercicio, carregar]);

  if (empresaId && exercicio) {
    return <LancamentosExercicio empresaId={empresaId} ano={exercicio} search={search} onVoltar={() => onAbrir(null)} />;
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Wallet size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver os exercícios.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : dados.exercicios.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-12 text-center">
          <Wallet size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhum lançamento no contas a pagar nem no contas a receber desta empresa.</p>
        </div>
      ) : (
        <>
          <div className="-mt-1 mb-3 flex justify-end text-xs text-gray-400">
            Primeiro lançamento financeiro: vencimento em {dataBr(dados.primeiro_vencimento)}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {dados.exercicios.map((e) => (
              <CardExercicio key={e.ano} exercicio={e} atual={e.ano === dados.ano_atual} onAbrir={() => onAbrir(e.ano)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
