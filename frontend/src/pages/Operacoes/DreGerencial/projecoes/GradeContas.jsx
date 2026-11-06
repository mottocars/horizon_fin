import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CopyCheck, Eraser, SplitSquareHorizontal, TriangleAlert } from 'lucide-react';
import CelulaValor from './CelulaValor';
import { ORIGEM, ROTULO_ORIGEM, corValor, interpretarValor, moeda, pct, rotuloMes } from './util';

const COR_ORIGEM = {
  [ORIGEM.INFORMADO]: 'bg-primary-50 text-primary-700',
  [ORIGEM.EMPRESARIAL]: 'bg-gray-100 text-gray-600',
  [ORIGEM.AGING]: 'bg-gray-100 text-gray-600',
};

const COL_NOME = 'sticky left-0 w-[340px] min-w-[340px] max-w-[340px]';
const COL_MES = 'w-[116px] min-w-[116px]';
const COL_TOTAL = 'w-[132px] min-w-[132px]';

const somaLinha = (valores, meses) => meses.reduce((t, m) => t + (Number(valores?.[m]) || 0), 0);

// Menu do botão direito numa célula digitável: replicar até o fim, distribuir um total igualmente do
// mês até o fim, limpar a linha.
function MenuCelula({ menu, meses, onAplicar, onFechar }) {
  const [total, setTotal] = useState('');
  useEffect(() => {
    const fechar = () => onFechar();
    const tecla = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('mousedown', fechar);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('mousedown', fechar);
      window.removeEventListener('keydown', tecla);
    };
  }, [onFechar]);
  const restantes = meses.filter((m) => m >= menu.mes);
  const distribuir = () => {
    const v = interpretarValor(total);
    if (v === null || Number.isNaN(v) || !restantes.length) return;
    const parte = Math.trunc((v / restantes.length) * 100) / 100;
    const resto = Math.round((v - parte * restantes.length) * 100) / 100;
    onAplicar(Object.fromEntries(restantes.map((m, i) => [m, i === restantes.length - 1 ? Math.round((parte + resto) * 100) / 100 : parte])));
  };
  const item = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50';
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left: Math.min(menu.x, window.innerWidth - 260), top: Math.min(menu.y, window.innerHeight - 170) }}
      className="fixed z-[110] w-60 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
    >
      <button
        type="button"
        className={item}
        disabled={menu.valor === null}
        onClick={() => onAplicar(Object.fromEntries(restantes.map((m) => [m, menu.valor])))}
      >
        <CopyCheck size={13} className="text-primary-600" />
        Replicar {menu.valor === null ? '' : moeda(menu.valor)} até {rotuloMes(meses[meses.length - 1])}
      </button>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <SplitSquareHorizontal size={13} className="shrink-0 text-primary-600" />
        <input
          autoFocus
          value={total}
          onChange={(e) => /^[-\d.,\s]*$/.test(e.target.value) && setTotal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && distribuir()}
          placeholder={`Total em ${restantes.length} meses`}
          className="h-7 min-w-0 flex-1 rounded-md border border-gray-200 px-1.5 text-right text-xs tabular-nums outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <button type="button" onClick={distribuir} className="rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700">
          OK
        </button>
      </div>
      <button type="button" className={item} onClick={() => onAplicar(null)}>
        <Eraser size={13} className="text-gray-400" />
        Limpar a linha
      </button>
    </div>
  );
}

// Resumo da obra na etapa de custos: orçamento vigente, custo realizado até a trava, projetado e final.
function ResumoCusto({ resumo, custoProjetado }) {
  const orcamento = resumo.orcamento || 0;
  const realizado = resumo.custo_realizado || 0;
  const final = realizado + Math.abs(custoProjetado);
  const fracao = orcamento > 0 ? final / orcamento : null;
  const caixa = (rotulo, valor, destaque) => (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className={`text-base font-semibold tabular-nums ${destaque || 'text-gray-900'}`}>{valor}</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap gap-4">
        {caixa('Orçamento vigente da obra', orcamento > 0 ? `R$ ${moeda(orcamento)}` : 'Sem orçamento', orcamento > 0 ? null : 'text-amber-600')}
        {caixa('Custo realizado até a trava', `R$ ${moeda(realizado)}`)}
        {caixa('Custo projetado', `R$ ${moeda(Math.abs(custoProjetado))}`)}
        {caixa('Custo final', `R$ ${moeda(final)}`)}
        {caixa('POC de Receita no fim', fracao === null ? '—' : pct(Math.min(fracao, 1)), fracao > 1 ? 'text-amber-600' : 'text-primary-700')}
      </div>
      {fracao === null && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
          <TriangleAlert size={12} /> Obra sem orçamento na aba Orçamento: a POC de Receita fica em 0% e a receita não é reconhecida.
        </p>
      )}
      {fracao !== null && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <span
              className={`block h-full transition-[width] duration-500 ${fracao > 1 ? 'bg-amber-500' : 'bg-primary-500'}`}
              style={{ width: `${Math.min(100, fracao * 100)}%` }}
            />
          </div>
          {fracao > 1.00005 && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
              <TriangleAlert size={12} /> Custo final {pct(fracao - 1)} acima do orçamento: a POC de Receita trava em 100%.
            </p>
          )}
          {fracao < 0.99995 && (
            <p className="mt-1.5 text-[11px] text-gray-500">
              Faltam R$ {moeda(orcamento - final)} de custo para a obra chegar a 100% no fim do ciclo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Etapas de digitação (custos com POC e demais contas): uma linha por máscara de nível 2 (abre e
// fecha), com as naturezas dela embaixo — HORIZON - INFORMADO digitável, SIENGE - EMPRESARIAL e
// SIENGE - AGING vindos do Sienge (só leitura). A Correção Monetária é uma linha só, digitada.
// A planilha da etapa (baixar / importar) fica no rodapé do assistente (AssistenteOrcamento.jsx), sempre
// à vista mesmo rolando a grade.
export default function GradeContas({ conteudo, dados, onDados }) {
  const { meses, grupos, sem_origem: semOrigem, resumo } = conteudo;
  // Todas as máscaras começam fechadas (regra única); o cabeçalho abre / fecha todas.
  const [abertos, setAbertos] = useState(() => new Set());
  const abriveis = grupos.filter((g) => g.correcao || g.naturezas.length).map((g) => g.mascara_id);
  const todasAbertas = abriveis.length > 0 && abriveis.every((id) => abertos.has(id));
  const [menu, setMenu] = useState(null);

  const valoresDe = (n) => (n.editavel ? dados.valores?.[n.natureza_id] || {} : n.valores);
  const valoresGrupo = (g) => {
    if (g.correcao) return dados.correcao || {};
    const out = {};
    g.naturezas.forEach((n) => {
      const v = valoresDe(n);
      meses.forEach((m) => {
        if (v[m]) out[m] = (out[m] || 0) + Number(v[m]);
      });
    });
    return out;
  };
  const custoProjetado = useMemo(() => {
    const g = grupos.find((x) => x.custo_obra);
    return g ? somaLinha(valoresGrupo(g), meses) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, dados, meses]);

  // Grava valores de uma linha digitável: `novos` = { mes: valor } (mescla) ou null (limpa a linha).
  function gravarLinha(alvo, novos) {
    const atual = alvo.correcao ? dados.correcao || {} : dados.valores?.[alvo.natureza_id] || {};
    const linha = novos === null ? {} : { ...atual, ...novos };
    Object.keys(linha).forEach((m) => (linha[m] === null || linha[m] === 0) && delete linha[m]);
    if (alvo.correcao) onDados({ ...dados, correcao: linha });
    else onDados({ ...dados, valores: { ...(dados.valores || {}), [alvo.natureza_id]: linha } });
  }

  const alternar = (id) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const celulas = (alvo, valores, editavel) =>
    meses.map((m) => (
      <td key={m} className={`${COL_MES} border-b border-gray-100 px-1 py-1`}>
        {editavel ? (
          <CelulaValor
            valor={valores[m] ?? null}
            onCommit={(v) => gravarLinha(alvo, { [m]: v })}
            onMenu={(e, valor) => setMenu({ x: e.clientX, y: e.clientY, alvo, mes: m, valor })}
            title="Botão direito: replicar / distribuir / limpar"
          />
        ) : (
          <span className={`block px-1.5 text-right text-xs tabular-nums ${valores[m] ? corValor(valores[m]) : 'text-gray-300'}`}>
            {valores[m] ? moeda(valores[m]) : '—'}
          </span>
        )}
      </td>
    ));

  return (
    <div className="space-y-4 p-6">
      {resumo && <ResumoCusto resumo={resumo} custoProjetado={custoProjetado} />}
      {semOrigem > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <TriangleAlert size={13} /> {semOrigem} natureza(s) sem Origem Projeção no plano de contas do centro não são projetadas.
        </p>
      )}
      <div className="inline-block min-w-full rounded-lg border border-gray-200 align-top">
        <table className="border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-blue-700">
              <th className={`${COL_NOME} top-0 z-30 rounded-tl-lg border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium`}>
                <span className="flex items-center justify-between gap-2">
                  Máscara DRE / natureza
                  {abriveis.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAbertos(todasAbertas ? new Set() : new Set(abriveis))}
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-primary-700 hover:bg-blue-100"
                    >
                      {todasAbertas ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      {todasAbertas ? 'Fechar todas' : 'Abrir todas'}
                    </button>
                  )}
                </span>
              </th>
              {meses.map((m) => (
                <th key={m} className={`${COL_MES} sticky top-0 z-10 border-b-2 border-blue-500 bg-blue-50 px-2 py-2.5 text-right font-medium tabular-nums`}>
                  {rotuloMes(m)}
                </th>
              ))}
              <th className={`${COL_TOTAL} sticky top-0 z-10 rounded-tr-lg border-b-2 border-blue-500 bg-blue-100 px-3 py-2.5 text-right font-semibold`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const aberto = abertos.has(g.mascara_id);
              const vg = valoresGrupo(g);
              const total = somaLinha(vg, meses);
              const vazio = !g.correcao && !g.naturezas.length;
              return (
                <Fragment key={g.mascara_id}>
                  <tr
                    onClick={() => !vazio && alternar(g.mascara_id)}
                    className={`bg-gray-50 ${vazio ? '' : 'cursor-pointer hover:bg-gray-100'}`}
                  >
                    <td className={`${COL_NOME} z-[1] border-b border-gray-200 bg-inherit px-3 py-2`}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {vazio ? (
                          <span className="w-3.5" />
                        ) : aberto ? (
                          <ChevronDown size={14} className="shrink-0 text-primary-600" />
                        ) : (
                          <ChevronRight size={14} className="shrink-0 text-gray-400" />
                        )}
                        <span className="truncate font-semibold text-gray-900" title={g.grupo ? `${g.grupo} › ${g.descricao}` : g.descricao}>
                          {g.descricao}
                        </span>
                        {g.poc && (
                          <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-primary-700 ring-1 ring-primary-100">
                            POC {g.poc === 'RECEITA' ? 'Receita' : 'Despesa'}
                          </span>
                        )}
                        {!g.correcao && g.naturezas.length > 0 && (
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                            {g.naturezas.length}
                          </span>
                        )}
                        {vazio && <span className="shrink-0 text-[11px] font-normal text-gray-400">sem natureza projetada</span>}
                      </span>
                    </td>
                    {meses.map((m) => (
                      <td key={m} className={`${COL_MES} border-b border-gray-200 px-2 py-2 text-right font-semibold tabular-nums ${vg[m] ? corValor(vg[m]) : 'text-gray-300'}`}>
                        {vg[m] ? moeda(vg[m]) : '—'}
                      </td>
                    ))}
                    <td className={`${COL_TOTAL} border-b border-gray-200 bg-blue-50/50 px-3 py-2 text-right font-semibold tabular-nums ${corValor(total)}`}>
                      {moeda(total)}
                    </td>
                  </tr>
                  {aberto && g.correcao && (
                    <tr className="bg-white">
                      <td className={`${COL_NOME} z-[1] border-b border-gray-100 bg-white py-1 pl-9 pr-3 text-gray-700`}>
                        <span className="flex items-center gap-1.5">
                          Correção a realizar no mês
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${COR_ORIGEM[ORIGEM.INFORMADO]}`}>INFORMADO</span>
                        </span>
                      </td>
                      {celulas({ correcao: true }, dados.correcao || {}, true)}
                      <td className={`${COL_TOTAL} border-b border-gray-100 bg-blue-50/30 px-3 py-1 text-right tabular-nums ${corValor(total)}`}>
                        {moeda(total)}
                      </td>
                    </tr>
                  )}
                  {aberto &&
                    g.naturezas.map((n) => {
                      const v = valoresDe(n);
                      const tl = somaLinha(v, meses);
                      return (
                        <tr key={n.natureza_id} className="bg-white hover:bg-gray-50/60">
                          <td className={`${COL_NOME} z-[1] border-b border-gray-100 bg-white py-1 pl-9 pr-3`}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="shrink-0 tabular-nums text-gray-400">{n.natureza_id}</span>
                              <span className="truncate text-gray-700" title={n.nome}>
                                {n.nome}
                              </span>
                              <span className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${COR_ORIGEM[n.origem]}`}>
                                {ROTULO_ORIGEM[n.origem]}
                              </span>
                            </span>
                          </td>
                          {celulas(n, v, n.editavel)}
                          <td className={`${COL_TOTAL} border-b border-gray-100 bg-blue-50/30 px-3 py-1 text-right tabular-nums ${corValor(tl)}`}>
                            {moeda(tl)}
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {menu && (
        <MenuCelula
          menu={menu}
          meses={meses}
          onFechar={() => setMenu(null)}
          onAplicar={(novos) => {
            gravarLinha(menu.alvo, novos);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
