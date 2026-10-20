import { plural } from './cronogramaObras';
import { moeda } from './formatos';
import '../../Dashboards/EconomicoFinanceiro/fluxo/painel.css';
import '../../Dashboards/CronogramasObras/cronogramas.css';

// Cards da carteira de obras no estilo dos cards do painel do CFO (.tile de painel.css): VGV e
// unidades (com alerta das obras sem o dado) e, por etapa, as obras que estão nela hoje, o VGV e as
// unidades delas e a fatia da carteira. Clicar num card de etapa destaca essas obras no Gantt.
// Usado no dashboard Cronogramas de Obras e na aba Cronogramas de Operações > Cronogramas Obras
// (pedido do usuário: os mesmos cards) — precisa estar dentro de um .painel-cfo.
// - `resumo`: resumoCarteira (cronogramaObras.js); `destaque` / `onDestaque(id | null)`.
export default function CardsCarteira({ resumo: r, destaque, onDestaque }) {
  const semVgv = r.totalObras - r.comVgv;
  const semUnidades = r.totalObras - r.comUnidades;
  return (
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
            onClick={() => onDestaque(ativo ? null : e.etapa.id)}
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
  );
}
