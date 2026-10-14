import { useCallback, useEffect, useState } from 'react';
import { Building2, CalendarClock, Globe2, ListTree, Plus, Tags, TriangleAlert, Waypoints } from 'lucide-react';
import { resumoPlanosDfc } from '../../../api/dfcPlanoContas.api';

function dataHora(v) {
  return v ? new Date(v).toLocaleDateString('pt-BR') : null;
}

// Barra fina "x de y" (mesmo estilo da barra de progresso dos cards do Plano de Voo).
function Barra({ valor, total, cor }) {
  const pct = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <span className={`block h-full ${cor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CardPlano({ icone: Icone, titulo, subtitulo, destaque = false, comMascara, comOrigem, analiticas, rodape, onAbrir }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`group flex flex-col rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-primary-200 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-100 ${
        destaque ? 'border-primary-100' : 'border-gray-200/80'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 transition group-hover:bg-primary-600 group-hover:text-white">
          <Icone size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-gray-400">{subtitulo}</p>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{titulo}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Tags size={12} className="text-gray-400" /> Máscara DFC
            </span>
            <span className="tabular-nums">
              {comMascara} de {analiticas}
            </span>
          </div>
          <Barra valor={comMascara} total={analiticas} cor="bg-primary-500" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <Waypoints size={12} className="text-gray-400" /> Origem Projeção
            </span>
            <span className="tabular-nums">
              {comOrigem} de {analiticas}
            </span>
          </div>
          <Barra valor={comOrigem} total={analiticas} cor="bg-emerald-500" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-3 text-[11px] text-gray-500">{rodape}</div>
    </button>
  );
}

// Aba Plano Contas, tela inicial: um card por plano de contas — o Global primeiro (vale pra todos os
// centros sem plano próprio), depois um por centro de custo com versão própria (tem prioridade no
// Orçamento e na Projeção CEF dele) e, no fim, o card de criar. Clicar abre o plano pra edição
// (mesmo esquema da aba Plano de voo da Home — PlanosLista.jsx).
export default function PlanosContasLista({ empresaId, onAbrir, onNovo, refreshToken = 0 }) {
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setErro('');
    resumoPlanosDfc(empresaId)
      .then(setResumo)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar os planos de contas.'));
  }, [empresaId]);

  useEffect(() => {
    setResumo(null);
    carregar();
  }, [carregar, refreshToken]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <ListTree size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver os planos de contas.</p>
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
      ) : !resumo ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <CardPlano
            icone={Globe2}
            titulo="Global"
            subtitulo="Plano de contas de todos os centros"
            destaque
            comMascara={resumo.global.com_mascara}
            comOrigem={resumo.global.com_origem}
            analiticas={resumo.analiticas}
            rodape={
              <>
                <Building2 size={12} className="text-gray-400" />
                {resumo.global.centros_seguindo} centro(s) com Projeta DFC seguem este plano
              </>
            }
            onAbrir={() => onAbrir('global')}
          />
          {resumo.versoes.map((v) => (
            <CardPlano
              key={v.centro_id}
              icone={Building2}
              titulo={v.name}
              subtitulo={`Plano próprio${v.natureza === 'ADMINISTRATIVO' ? ' · Administrativo' : v.natureza === 'OBRA' ? ' · Obra' : ''}`}
              comMascara={v.com_mascara}
              comOrigem={v.com_origem}
              analiticas={resumo.analiticas}
              rodape={
                <>
                  <CalendarClock size={12} className="text-gray-400" />
                  Criado em {dataHora(v.criado_em)}
                  {v.criado_por ? ` por ${v.criado_por}` : ''}
                </>
              }
              onAbrir={() => onAbrir(String(v.centro_id))}
            />
          ))}
          <button
            type="button"
            onClick={onNovo}
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 text-sm font-medium text-gray-500 transition hover:border-primary-500 hover:bg-white hover:text-primary-600"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
              <Plus size={18} />
            </span>
            Novo plano por centro de custo
            <span className="max-w-[16rem] text-center text-[11px] font-normal text-gray-400">
              Começa como cópia do Global e passa a valer só para o centro escolhido.
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
