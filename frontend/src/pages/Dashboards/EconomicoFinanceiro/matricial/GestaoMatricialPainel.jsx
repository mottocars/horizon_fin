import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCentrosGestaoMatricial, getGestaoMatricialPainel } from '../../../../api/dashboards.api';
import { versaoPublicadaDfc } from '../../../../api/dfcVersoes.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import VersaoPublicada from '../dre/VersaoPublicada';
import CampoPeriodo from '../fluxo/CampoPeriodo';
import { FiltroCentros, centrosDoFiltro } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { addM, titulo } from '../fluxo/modelo';
import Matriz from './Matriz';
import DetalheCelula from './DetalheCelula';
import { desvio, desvioPct, montarMatriz, percentual, reaisCurto, rotuloMes } from './modelo';
import '../fluxo/painel.css';
import './matricial.css';

// Dashboard Econômico Financeiro › Gestão Matricial (pedido do usuário, 26/11/2026): o desvio da DFC (Realizado ×
// Projetado, versão publicada) numa matriz Pacote (linhas, cadastro da conta do plano financeiro) × Pilar (colunas,
// cadastro do centro de custo), cada um com o responsável da máscara (Cadastros › Máscaras) e a foto, e o mapa de
// calor (verde = melhor que o
// previsto, vermelho = pior — pelo sinal do caixa, como o Desvio % da aba DFC).
// Barra igual à do Fluxo de Caixa (Empresa, Início, Fim, Centro de custo). Período padrão: janeiro até o mês
// anterior ao atual — o realizado da versão publicada vai até ele, então o realizado e o projetado se encontram
// em meses fechados; dá para mudar, mas só os meses com realizado entram na comparação.
// Dados de /dashboards/economico-financeiro/gestao-matricial (gestaoMatricial.service.js), montados em
// matricial/modelo.js; recarrega sozinho a cada 30 minutos com a aba visível.

const MIN_RECARGA = 30;

function mesHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Janeiro do ano do mês anterior (em janeiro, o ano passado inteiro) até o mês anterior ao atual.
function periodoPadrao() {
  const fim = addM(mesHoje(), -1);
  return { inicio: `${fim.slice(0, 4)}-01`, fim };
}

const classeDesvio = (v) => (v > 0.5 ? 'bom' : v < -0.5 ? 'ruim' : '');

function Indicadores({ M }) {
  const d = desvio(M.total);
  const p = desvioPct(M.total);
  const pior = M.pior;
  return (
    <section className="tiles" aria-label="Indicadores do período">
      <div className="tile">
        <span className="k">Projetado</span>
        <span className="v">{reaisCurto(M.total.p)}</span>
        <span className="d">Orçamento da versão publicada da DFC</span>
      </div>
      <div className="tile">
        <span className="k">Realizado</span>
        <span className="v">{reaisCurto(M.total.r)}</span>
        <span className="d">Extrato das contas com Projeta DFC</span>
      </div>
      <div className="tile">
        <span className="k">Desvio</span>
        <span className={`v mx-tile-${classeDesvio(d)}`}>{reaisCurto(d, true)}</span>
        <span className="d">
          <b>{p === null ? 'sem previsto' : percentual(p)}</b> {d > 0.5 ? 'melhor que o previsto' : d < -0.5 ? 'pior que o previsto' : 'em linha com o previsto'}
        </span>
      </div>
      <div className="tile">
        <span className="k">Maior desvio negativo</span>
        {pior ? (
          <>
            <span className="v mx-tile-ruim">{reaisCurto(desvio(pior.x), true)}</span>
            <span className="d">
              <b>{pior.linha.nome}</b> × <b>{pior.coluna.nome}</b>
            </span>
          </>
        ) : (
          <>
            <span className="v">–</span>
            <span className="d">Nenhuma combinação pior que o previsto</span>
          </>
        )}
      </div>
    </section>
  );
}

function Legenda({ modo }) {
  return (
    <div className="mx-legenda" aria-label="Legenda do mapa de calor">
      <span>Pior que o previsto</span>
      <span className="mx-barra" aria-hidden="true" />
      <span>Melhor que o previsto</span>
      <span className="mx-legenda-nota">{modo === 'pct' ? 'cor cheia a partir de ±100%' : 'cor cheia = maior desvio da matriz'}</span>
    </div>
  );
}

export default function GestaoMatricialPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const [inicioMes, setInicioMes] = useState(() => periodoPadrao().inicio);
  const [fimMes, setFimMes] = useState(() => periodoPadrao().fim);
  const [marcados, setMarcados] = useState([]); // centros marcados no filtro
  const [listaCentros, setListaCentros] = useState(null); // null = carregando
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState('pct'); // pct | valor
  const [detalhe, setDetalhe] = useState(null);
  const pedido = useRef(0);

  // Trocar de empresa limpa os centros e os dados e recarrega a lista de centros.
  useEffect(() => {
    setMarcados((c) => (c.length ? [] : c));
    setListaCentros(null);
    setDados(null);
    if (!empresaId) return undefined;
    let vivo = true;
    getCentrosGestaoMatricial(empresaId)
      .then((r) => vivo && setListaCentros(r))
      .catch(() => vivo && setListaCentros([]));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const opcoesCentros = useMemo(
    () => (listaCentros || []).map((c) => ({ value: c.id, label: titulo(c.nome) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [listaCentros]
  );
  // O filtro que vale (todos marcados = nenhum), como no Fluxo de Caixa.
  const centros = useMemo(() => centrosDoFiltro(marcados, opcoesCentros), [marcados, opcoesCentros]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    const meu = ++pedido.current;
    setEstado('carregando');
    getGestaoMatricialPainel({ empresa_id: empresaId, de: inicioMes, ate: fimMes, centros: centros.join(',') || undefined })
      .then((d) => {
        if (meu !== pedido.current) return;
        setDados(d);
        setEstado('ocioso');
        setErro('');
      })
      .catch((e) => {
        if (meu !== pedido.current) return;
        setEstado('erro');
        setErro(e?.response?.data?.message || e?.response?.data?.error || 'Não foi possível montar a matriz.');
      });
  }, [empresaId, inicioMes, fimMes, centros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), MIN_RECARGA * 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const M = useMemo(() => montarMatriz(dados), [dados]);
  const periodo = dados?.periodo;
  const vazia = M && !M.linhas.length;
  const foraDaComparacao = periodo && periodo.ate > periodo.realizado_ate;

  return (
    <DicaProvider>
      <div className="painel-cfo painel-matricial">
        <CabecalhoDashboard
          dashboard={dashboard}
          titulo={tituloTela}
          marca={marcaEmpresa}
          extra={<VersaoPublicada empresaId={empresaId} buscar={versaoPublicadaDfc} />}
        />

        <section className="controls" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select id="f-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
              {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
              {opcoesEmpresas.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <CampoPeriodo id="f-inicio" rotulo="Início" valor={inicioMes} max={fimMes} onChange={setInicioMes} dica="Primeiro mês do período" />
          <CampoPeriodo
            id="f-fim"
            rotulo="Fim"
            valor={fimMes}
            min={inicioMes}
            onChange={setFimMes}
            dica="Último mês do período — padrão: o mês anterior ao atual (o último com realizado)"
          />
          <FiltroCentros opcoes={opcoesCentros} valor={marcados} onChange={setMarcados} disabled={!empresaId || !listaCentros} selecionarTodos />
        </section>

        {!empresaId ? (
          <div className="panel">
            <div className="empty">Escolha a empresa na barra acima para montar a matriz.</div>
          </div>
        ) : !M ? (
          estado === 'erro' ? (
            <div className="sec-err">
              <b>Não foi possível montar a matriz</b>
              {erro}
            </div>
          ) : (
            <>
              <section className="tiles" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="tile">
                    <div className="sk" style={{ height: 14, width: '60%' }} />
                    <div className="sk" style={{ height: 28, width: '80%', marginTop: 6 }} />
                    <div className="sk" style={{ height: 12, width: '70%', marginTop: 6 }} />
                  </div>
                ))}
              </section>
              <div className="panel">
                <div className="sk" style={{ height: 320 }} />
              </div>
            </>
          )
        ) : (
          <>
            <Indicadores M={M} />

            <section className={`panel mx-painel${estado === 'carregando' ? ' carregando' : ''}`} aria-labelledby="h-matriz">
              <div className="mx-topo">
                <div className="mx-titulo">
                  <h2 id="h-matriz">Desvio Realizado × Projetado · Pacote × Pilar</h2>
                  <p className="mx-sub">
                    {periodo.ate_comparado ? (
                      <>
                        Comparado de <b>{rotuloMes(periodo.de)}</b> a <b>{rotuloMes(periodo.ate_comparado)}</b>
                        {foraDaComparacao && <> (depois de {rotuloMes(periodo.realizado_ate)} ainda não há realizado)</>}
                      </>
                    ) : (
                      <>Sem realizado no período — o realizado da versão publicada vai até {rotuloMes(periodo.realizado_ate)}</>
                    )}
                    {' · '}clique numa célula para ver os centros e as contas
                  </p>
                </div>
                <div className="mx-opcoes">
                  <div className="seg" role="group" aria-label="Valor das células">
                    <button type="button" aria-pressed={modo === 'pct'} onClick={() => setModo('pct')}>
                      Desvio %
                    </button>
                    <button type="button" aria-pressed={modo === 'valor'} onClick={() => setModo('valor')}>
                      Desvio R$
                    </button>
                  </div>
                </div>
              </div>

              {vazia ? (
                <div className="empty">
                  Nenhum valor realizado ou projetado da DFC no período{centros.length ? ' para os centros escolhidos' : ''}.
                  {!dados.versao && ' A versão publicada da DFC desta empresa ainda não tem Orçamento (o projetado).'}
                </div>
              ) : (
                <>
                  <Legenda modo={modo} />
                  <Matriz M={M} modo={modo} onDetalhar={setDetalhe} />
                  {(M.semCadastro.pilar || M.semCadastro.pacote || M.semCadastro.responsavel) && (
                    <p className="mx-aviso">
                      {M.semCadastro.pilar && <>“Sem pilar”: centros de custo sem Pilar no cadastro (Cadastros › Centros de Custos). </>}
                      {M.semCadastro.pacote && <>“Sem pacote”: contas sem Pacote no cadastro (Cadastros › Planos Financeiros). </>}
                      {M.semCadastro.responsavel && <>“Sem responsável”: escolha o responsável do pilar ou do pacote em Cadastros › Máscaras.</>}
                    </p>
                  )}
                </>
              )}
            </section>
          </>
        )}

        <DetalheCelula detalhe={detalhe} M={M} onFechar={() => setDetalhe(null)} />
      </div>
    </DicaProvider>
  );
}
