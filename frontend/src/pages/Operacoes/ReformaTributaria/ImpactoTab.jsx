import { useEffect, useState } from 'react';
import { Info, Scale, Settings2, TriangleAlert } from 'lucide-react';
import { getImpactoReforma } from '../../../api/reformaTributaria.api';
import { mesAno } from '../CronogramasObras/formatos';
import { moeda, pct, REGIMES, valor } from './formatos';
import '../../Dashboards/EconomicoFinanceiro/fluxo/painel.css';
import '../../Dashboards/CronogramasObras/cronogramas.css';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs font-medium uppercase tracking-wide text-blue-700';
const corDiferenca = (d) => (Math.abs(d) < 0.5 ? 'text-gray-400' : d > 0 ? 'text-emerald-600' : 'text-red-600');
const comSinal = (d) => (Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : '−'}${moeda(Math.abs(d))}`);
const margem = (lucro, rl) => (rl ? lucro / rl : null);

function Bloco({ titulo, subtitulo, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Regime({ centro }) {
  if (centro.natureza !== 'OBRA') return <span className="text-xs text-gray-400">Administrativo</span>;
  const r = REGIMES[centro.regime];
  if (!r) return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Não configurado</span>;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.classe}`}>{r.curto}</span>;
}

// Aba Impacto: a DRE projetada (rascunho do centro ou a última versão salva da Projeção da DRE) com a
// reforma aplicada de 2027 em diante, pelo regime de cada obra (aba Centros de Custos) e pelas alíquotas
// da empresa (aba Alíquotas). Obra não configurada fica como está.
export default function ImpactoTab({ empresaId, centros, ano, recarregar, onOpcoes, onCarregando, onFiltrarCentro, onIrPara }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const chaveCentros = centros.join(',');

  useEffect(() => {
    if (!empresaId) {
      setDados(null);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    onCarregando?.(true);
    setErro('');
    getImpactoReforma(empresaId, { centros: chaveCentros ? chaveCentros.split(',') : [], ano })
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        onOpcoes?.({ centros: d.centros_opcoes || [], anos: d.anos || [] });
      })
      .catch((e) => vivo && setErro(e.response?.data?.message || 'Não foi possível calcular o impacto.'))
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        onCarregando?.(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, chaveCentros, ano, recarregar]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Scale size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o impacto da reforma tributária na DRE.</p>
      </div>
    );
  }

  if (erro || dados?.erro) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center gap-2 rounded-card rounded-tl-none bg-white px-6 text-center shadow-card">
        <TriangleAlert size={26} className="text-red-400" />
        <p className="max-w-lg text-sm text-gray-600">{erro || dados.erro}</p>
      </div>
    );
  }

  if (!dados) {
    return <div className="rounded-card rounded-tl-none bg-white py-16 text-center text-sm text-gray-400 shadow-card">Calculando o impacto...</div>;
  }

  const r = dados.resumo;
  const semProjecaoNenhuma = !dados.por_centro.length;
  const diferenca = r.lucro_reforma - r.lucro_hoje;
  const periodo = dados.periodo?.ate ? `De ${mesAno(`${dados.periodo.de}-01`)} a ${mesAno(`${dados.periodo.ate}-01`)}` : 'Sem meses projetados a partir de 2027';

  return (
    <div className={`space-y-5 rounded-card rounded-tl-none bg-white p-5 shadow-card ${carregando ? 'opacity-60' : ''}`}>
      {r.configurados === 0 && !semProjecaoNenhuma && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Settings2 size={14} className="shrink-0" />
          Nenhuma obra configurada ainda: a DRE abaixo é a projeção de hoje. Escolha o regime de cada obra em
          <button type="button" onClick={() => onIrPara('centros-custos')} className="font-semibold underline underline-offset-2 hover:text-amber-800">
            Centros de Custos
          </button>
        </div>
      )}

      {semProjecaoNenhuma ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Info size={26} className="text-gray-300" />
          <p className="max-w-md text-sm text-gray-600">
            Nenhum centro de custo tem Projeção da DRE. O impacto é calculado em cima dela: monte os orçamentos em Operações › DRE
            Construtoras › Projeções.
          </p>
        </div>
      ) : (
        <>
          <div className="painel-cfo embutido">
            <section className="tiles cronograma" style={{ '--colunas': 4 }} aria-label="Indicadores do impacto">
              <div className="tile">
                <span className="k">Imposto sobre a receita hoje</span>
                <span className="v" title={moeda(Math.abs(r.imposto_hoje), { centavos: true })}>
                  {moeda(Math.abs(r.imposto_hoje), { compacta: true })}
                </span>
                <span className="d">
                  {pct(r.receita ? Math.abs(r.imposto_hoje) / r.receita : null)} da receita de <b>{moeda(r.receita, { compacta: true })}</b>
                </span>
              </div>
              <div className="tile">
                <span className="k">Imposto com a reforma</span>
                <span className="v" title={moeda(Math.abs(r.imposto_reforma), { centavos: true })}>
                  {moeda(Math.abs(r.imposto_reforma), { compacta: true })}
                </span>
                <span className="d">
                  {pct(r.receita ? Math.abs(r.imposto_reforma) / r.receita : null)} da receita · IBS/CBS <b>{moeda(Math.abs(r.ibs_cbs), { compacta: true })}</b>
                </span>
              </div>
              <div className="tile">
                <span className="k">Crédito sobre o custo</span>
                <span className="v" title={moeda(r.credito, { centavos: true })}>
                  {moeda(r.credito, { compacta: true })}
                </span>
                <span className="d">Abate o custo das obras do regime regular</span>
              </div>
              <div className="tile">
                <span className="k">Efeito no lucro líquido</span>
                <span className={`v ${corDiferenca(diferenca)}`} title={comSinal(diferenca)}>
                  {Math.abs(diferenca) < 0.5 ? 'R$ 0' : `${diferenca > 0 ? '+' : '−'}${moeda(Math.abs(diferenca), { compacta: true })}`}
                </span>
                <span className="d">
                  Margem líquida <b>{pct(margem(r.lucro_hoje, r.rl_hoje))}</b> → <b>{pct(margem(r.lucro_reforma, r.rl_reforma))}</b>
                </span>
              </div>
            </section>
          </div>

          <Bloco
            titulo="Demonstração do resultado"
            subtitulo={`${periodo} · projeção da DRE de hoje × com a reforma · ${r.configurados} de ${r.obras} ${r.obras === 1 ? 'obra configurada' : 'obras configuradas'}`}
          >
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className="py-2.5 pl-4 pr-3 text-left">Linha</th>
                  <th className="px-3 py-2.5 text-right">Projeção hoje</th>
                  <th className="px-3 py-2.5 text-right">Com a reforma</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {dados.dre.map((l) => {
                  const d = l.reforma - l.hoje;
                  const total = l.tipo === 'total';
                  const linha = l.tipo === 'linha';
                  return (
                    <tr key={`${l.tipo}-${l.id}`} className={`border-b border-gray-100 ${total ? 'bg-gray-50 font-semibold text-gray-900' : linha ? 'text-gray-600' : 'font-medium text-gray-800'}`}>
                      <td className={`py-2.5 pr-3 ${linha ? 'pl-9 text-xs' : 'pl-4'}`}>
                        {l.descricao}
                        {l.nova && <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">reforma</span>}
                      </td>
                      <td className={`px-3 py-2.5 whitespace-nowrap text-right tabular-nums ${linha ? 'text-xs' : ''}`}>{valor(l.hoje)}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap text-right tabular-nums ${linha ? 'text-xs' : ''}`}>{valor(l.reforma)}</td>
                      <td className={`py-2.5 pl-3 pr-4 whitespace-nowrap text-right tabular-nums ${linha ? 'text-xs' : ''} ${corDiferenca(d)}`}>{comSinal(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Bloco>

          <Bloco titulo="Por centro de custo" subtitulo="Clique num centro para ver só ele. Diferença = lucro com a reforma − lucro da projeção de hoje.">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className="py-2.5 pl-4 pr-3 text-left">Centro de custo</th>
                  <th className="px-3 py-2.5 text-left">Regime</th>
                  <th className="px-3 py-2.5 text-right">Receita</th>
                  <th className="px-3 py-2.5 text-right">Imposto hoje</th>
                  <th className="px-3 py-2.5 text-right">Imposto com a reforma</th>
                  <th className="px-3 py-2.5 text-right">Crédito</th>
                  <th className="px-3 py-2.5 text-right">Lucro hoje</th>
                  <th className="px-3 py-2.5 text-right">Lucro com a reforma</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {dados.por_centro.map((c) => {
                  const d = c.lucro_reforma - c.lucro_hoje;
                  const so = centros.length === 1 && centros[0] === String(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => onFiltrarCentro(so ? null : c.id)}
                      title={so ? 'Voltar para todos os centros' : 'Ver só este centro'}
                      className="cursor-pointer border-b border-gray-100 text-gray-700 hover:bg-gray-50"
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <span className="mr-2 tabular-nums text-gray-400">{c.id}</span>
                        <span className="font-medium text-gray-800">{c.nome}</span>
                        {c.regime === 'REGULAR' && c.rho > 0 && (
                          <span className="ml-2 text-[11px] text-gray-400" title="Redutores (terreno + redutor social) ÷ receita da obra na projeção">
                            redutores {pct(c.rho)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Regime centro={c} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.receita)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.imposto_hoje)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.imposto_reforma)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.credito)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.lucro_hoje)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(c.lucro_reforma)}</td>
                      <td className={`py-2.5 pl-3 pr-4 whitespace-nowrap text-right font-medium tabular-nums ${corDiferenca(d)}`}>{comSinal(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {dados.sem_projecao.length > 0 && (
              <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
                Sem Projeção da DRE (ficam fora do impacto): {dados.sem_projecao.map((c) => c.nome).join(', ')}. Monte o orçamento delas em
                DRE Construtoras › Projeções.
              </p>
            )}
          </Bloco>

          {dados.por_ano.length > 0 && (
            <Bloco titulo="Ano a ano" subtitulo="A transição: a CBS entra cheia em 2027 e o IBS sobe de 2029 a 2033. Sempre toda a projeção, nos centros do filtro.">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className={CABECALHO}>
                    <th className="py-2.5 pl-4 pr-3 text-left">Ano</th>
                    <th className="px-3 py-2.5 text-right">Receita</th>
                    <th className="px-3 py-2.5 text-right">Imposto hoje</th>
                    <th className="px-3 py-2.5 text-right">Imposto com a reforma</th>
                    <th className="px-3 py-2.5 text-right">Crédito</th>
                    <th className="py-2.5 pl-3 pr-4 text-right">Diferença no lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_ano.map((a) => {
                    const d = a.lucro_reforma - a.lucro_hoje;
                    return (
                      <tr key={a.ano} className={`border-b border-gray-100 text-gray-700 ${String(a.ano) === String(ano) ? 'bg-primary-50/50' : ''}`}>
                        <td className="py-2.5 pl-4 pr-3 font-medium text-gray-800">{a.ano}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(a.receita)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(a.imposto_hoje)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(a.imposto_reforma)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums">{valor(a.credito)}</td>
                        <td className={`py-2.5 pl-3 pr-4 whitespace-nowrap text-right font-medium tabular-nums ${corDiferenca(d)}`}>{comSinal(d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Bloco>
          )}
        </>
      )}
    </div>
  );
}
