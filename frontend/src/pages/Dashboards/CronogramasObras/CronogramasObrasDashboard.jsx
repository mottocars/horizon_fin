import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import CabecalhoDashboard from '../CabecalhoDashboard';
import { listEmpresas } from '../../../api/empresas.api';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from '../../Operacoes/CronogramasObras/GanttObras';
import { isoHoje, montarObras, plural, resumoCarteira } from '../../Operacoes/CronogramasObras/cronogramaObras';
import { mesAno, moeda } from '../../Operacoes/CronogramasObras/formatos';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Cronogramas de Obras (pedido do usuário): no layout do Econômico Financeiro — tela
// inteira, cabeçalho dos dashboards, barra de controles e os cards (.tile) do painel do CFO
// (painel.css) — com os mesmos números da aba Cronogramas de Operações > Cronogramas Obras (VGV,
// unidades e quantas obras estão em cada etapa hoje) e, embaixo, o mesmo Gantt (GanttObras), aqui
// só leitura: quem vê o dashboard pode não ter acesso ao cadastro dos centros de custo. Clicar num
// card de etapa destaca no Gantt as obras que estão nela hoje. A empresa fica na URL (?empresa_id=).

export default function CronogramasObrasDashboard() {
  const [params, setParams] = useSearchParams();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  function atualizarParams(patch) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined || v === '' ? novo.delete(k) : novo.set(k, String(v))));
        return novo;
      },
      { replace: true }
    );
  }

  // ─── Empresa (mesmo esquema do Econômico Financeiro) ──────────────────────────────────────────
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas, empresaId]);

  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  // ─── Cronograma ───────────────────────────────────────────────────────────────────────────────
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
  const [erro, setErro] = useState('');
  const [zoom, setZoom] = useState('geral');
  const [destaque, setDestaque] = useState(null);

  const carregar = useCallback(() => {
    setEtapas([]);
    setCentros([]);
    setDestaque(null);
    if (!empresaId) return;
    setEstado('carregando');
    listCronogramaCentros(empresaId)
      .then((r) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
        setEstado('ok');
      })
      .catch((err) => {
        setErro(err.response?.data?.message || 'Não foi possível carregar o cronograma.');
        setEstado('erro');
      });
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const hoje = isoHoje();
  const obras = useMemo(() => montarObras(centros, etapas, hoje), [centros, etapas, hoje]);
  const r = useMemo(() => resumoCarteira(obras, etapas), [obras, etapas]);
  const etapaDestacada = etapas.find((e) => e.id === destaque);
  const semVgv = r.totalObras - r.comVgv;
  const semUnidades = r.totalObras - r.comUnidades;

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      <div className="painel-cfo">
        <CabecalhoDashboard
          dashboard="Cronogramas de Obras"
          titulo="Carteira de obras"
          etiquetas={empresaId && estado === 'ok' ? [{ rotulo: 'Obras', valor: r.totalObras }, { rotulo: 'Referência', valor: mesAno(hoje) }] : []}
          marca={marcaEmpresa}
        />

        <section className="controls" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select
              id="f-empresa"
              value={empresaId}
              onChange={(e) => atualizarParams({ empresa_id: e.target.value })}
              disabled={carregandoEmpresas || empresaTravada}
            >
              {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {nomeExibicaoEmpresa(e)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {!empresaId ? (
          <div className="panel">
            <div className="empty">Escolha a empresa na barra acima para montar o painel.</div>
          </div>
        ) : estado === 'erro' ? (
          <div className="sec-err">
            <b>Não foi possível montar o painel</b>
            {erro}
          </div>
        ) : estado === 'carregando' ? (
          <section className="tiles cronograma" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="tile">
                <div className="sk" style={{ height: 14, width: '60%' }} />
                <div className="sk" style={{ height: 28, width: '70%', marginTop: 6 }} />
                <div className="sk" style={{ height: 12, width: '80%', marginTop: 6 }} />
              </div>
            ))}
          </section>
        ) : (
          <>
            {/* Os números da carteira */}
            <section
              className={`tiles cronograma${destaque ? ' destacando' : ''}`}
              style={{ '--colunas': 2 + r.porEtapa.length }}
              aria-label="Indicadores da carteira"
            >
              <div className="tile">
                <span className="k">VGV total</span>
                <span className="v" title={moeda(r.vgv, { centavos: true })}>
                  {moeda(r.vgv, { compacta: true })}
                </span>
                <span className="d">
                  <b>{r.comVgv}</b> de {plural(r.totalObras, 'obra', 'obras')} com VGV
                </span>
                {semVgv > 0 ? (
                  <span className="st warn">{plural(semVgv, 'obra sem VGV', 'obras sem VGV')}</span>
                ) : (
                  <span className="st good">Todas as obras com VGV</span>
                )}
              </div>
              <div className="tile">
                <span className="k">Unidades</span>
                <span className="v">{r.unidades.toLocaleString('pt-BR')}</span>
                <span className="d">
                  {r.comUnidades ? (
                    <>
                      média de <b>{Math.round(r.unidades / r.comUnidades)}</b> por obra
                    </>
                  ) : (
                    'nenhuma obra com unidades'
                  )}
                </span>
                {semUnidades > 0 ? (
                  <span className="st warn">{plural(semUnidades, 'obra sem unidades', 'obras sem unidades')}</span>
                ) : (
                  <span className="st good">Todas as obras com unidades</span>
                )}
              </div>
              {r.porEtapa.map((e) => {
                const ativo = destaque === e.etapa.id;
                const fatia = r.totalObras ? e.obras.length / r.totalObras : 0;
                return (
                  <button
                    key={e.etapa.id}
                    type="button"
                    className="tile"
                    aria-pressed={ativo}
                    onClick={() => setDestaque(ativo ? null : e.etapa.id)}
                    title={ativo ? 'Mostrar todas as obras' : `Destacar no gráfico as obras em ${e.etapa.descricao} hoje`}
                  >
                    <span className="k">
                      <i className="marca" style={{ backgroundColor: e.cor }} />
                      {e.etapa.descricao || 'Sem nome'}
                    </span>
                    <span className="v">
                      {e.obras.length}
                      <small>{e.obras.length === 1 ? 'obra hoje' : 'obras hoje'}</small>
                    </span>
                    <span className="d">
                      {e.obras.length ? (
                        <>
                          <b>{moeda(e.vgv, { compacta: true })}</b> · {plural(e.unidades, 'unidade', 'unidades')}
                        </>
                      ) : (
                        'Nenhuma obra nesta etapa'
                      )}
                    </span>
                    <span className="medidor" style={{ backgroundColor: `${e.cor}26` }}>
                      <i style={{ width: `${fatia * 100}%`, backgroundColor: e.cor }} />
                    </span>
                  </button>
                );
              })}
            </section>

            {/* O Gantt */}
            <section className="panel" aria-labelledby="h-gantt">
              <div className="ph">
                <h2 id="h-gantt">Linha do tempo das obras</h2>
                <p>
                  {plural(r.comCronograma, 'obra no cronograma', 'obras no cronograma')}
                  {r.aIniciar > 0 && ` · ${plural(r.aIniciar, 'a iniciar', 'a iniciar')}`}
                  {r.concluidas > 0 && ` · ${plural(r.concluidas, 'concluída', 'concluídas')}`}
                  {r.semCronograma > 0 && ` · ${plural(r.semCronograma, 'sem datas', 'sem datas')}`}
                  {etapaDestacada && (
                    <button type="button" className="destaque-chip" onClick={() => setDestaque(null)}>
                      Destacando {etapaDestacada.descricao} <X size={11} />
                    </button>
                  )}
                </p>
              </div>
              <div className="gantt-barra">
                <LegendaGantt etapas={etapas} />
                <div className="seg" role="group" aria-label="Zoom do gráfico">
                  {ZOOMS_GANTT.map((z) => (
                    <button key={z.id} type="button" aria-pressed={zoom === z.id} onClick={() => setZoom(z.id)}>
                      {z.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="gantt-moldura">
                <GanttObras etapas={etapas} obras={obras} zoom={zoom} destaque={destaque} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
