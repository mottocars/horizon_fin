import { plural } from './cronogramaObras';
import { moeda } from './formatos';
import '../../Dashboards/EconomicoFinanceiro/fluxo/painel.css';
import '../../Dashboards/CronogramasObras/cronogramas.css';

// Cards da carteira de obras no estilo dos cards do painel do CFO (.tile de painel.css): o VGV com as
// unidades logo abaixo (pedido do usuário: um card só) e, por etapa, as obras que estão nela hoje, o VGV e as
// unidades delas e a fatia da carteira — no da construção, também as obras em atraso e o VGV delas;
// na etapa por onde começam as obras a iniciar (o Lançamento), essas obras com o VGV e as unidades
// (pedidos do usuário). Clicar num card de etapa filtra o Gantt: ficam as obras que estiveram nela em
// algum momento do período De/Até (cronogramaObras.js::naRecorte) — o número do card é o de hoje.
// Usado no dashboard Cronogramas de Obras e na aba Cronogramas de Operações > Cronogramas Obras
// (pedido do usuário: os mesmos cards) — precisa estar dentro de um .painel-cfo.
// - `resumo`: resumoCarteira (cronogramaObras.js) das obras que os cards de etapa mostram.
// - `topo`: numerosTopo — VGV e unidades do primeiro card e o recorte deles no rótulo
//   (a carteira, as obras da etapa do filtro ou a obra selecionada: os cards são dinâmicos).
// - `destaque` / `onDestaque(id | null)`: a etapa do filtro.
export default function CardsCarteira({ resumo: r, topo, destaque, onDestaque }) {
  return (
    <section
      className={`tiles cronograma${destaque ? ' destacando' : ''}`}
      style={{ '--colunas': 1 + r.porEtapa.length }}
      aria-label="Indicadores da carteira"
    >
      <div className="tile">
        <span className="k">{topo.recorte ? `VGV ${topo.recorte}` : 'VGV total'}</span>
        <span className="v" title={moeda(topo.vgv, { centavos: true })}>
          {moeda(topo.vgv, { compacta: true })}
        </span>
        <span className="d">
          <b>{topo.unidades.toLocaleString('pt-BR')}</b> {topo.unidades === 1 ? 'unidade' : 'unidades'}
        </span>
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
            onClick={() => onDestaque(ativo ? null : e.etapa.id)}
            title={ativo ? 'Mostrar todas as obras' : `Mostrar no gráfico as obras que estiveram em ${e.etapa.descricao} no período`}
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
            {e.aIniciar && (
              <span className="d iniciar">
                <i className="marca" style={{ borderColor: e.cor }} />
                <b>{plural(e.aIniciar.obras.length, 'a iniciar', 'a iniciar')}</b> · {moeda(e.aIniciar.vgv, { compacta: true })} ·{' '}
                {plural(e.aIniciar.unidades, 'unidade', 'unidades')}
              </span>
            )}
            {e.atraso && e.obras.length > 0 && (
              <span className="d atraso">
                <i className="marca" style={{ backgroundColor: e.atraso.cor }} />
                {e.atraso.obras.length ? (
                  <>
                    <b>{plural(e.atraso.obras.length, 'em atraso', 'em atraso')}</b> · {moeda(e.atraso.vgv, { compacta: true })}
                  </>
                ) : (
                  'Nenhuma em atraso'
                )}
              </span>
            )}
            <span className="medidor" style={{ backgroundColor: `${e.cor}26` }}>
              <i style={{ width: `${fatia * 100}%`, backgroundColor: e.cor }} />
            </span>
          </button>
        );
      })}
    </section>
  );
}

