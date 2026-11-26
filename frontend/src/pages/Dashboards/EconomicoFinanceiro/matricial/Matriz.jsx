import { useState } from 'react';
import { useDica } from '../fluxo/ganchos';
import { compacto, corCalor, desvio, desvioPct, percentual, reais } from './modelo';

// A matriz da Gestão Matricial: linhas = Pacote + responsável (foto à frente do nome), colunas = Pilar + responsável
// (foto acima do nome; no modo "por pilar", as fotos dos responsáveis do pilar empilhadas). Célula = desvio da DFC
// (Realizado − Projetado) com o mapa de calor; passar o mouse mostra a conta, clicar abre o detalhamento (centro ×
// natureza). Cabeçalho, coluna dos pacotes, Total e linha de totais ficam presos ao rolar.

const CORES_INICIAIS = ['#1d5c8a', '#0f7a5c', '#8a5a00', '#6b3fa0', '#b42d2d', '#2a6f97'];
const iniciais = (nome = '') =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export function Foto({ usuario, tamanho = 36 }) {
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) };
  if (!usuario) {
    return (
      <span className="mx-foto vazia" style={estilo} title="Sem responsável cadastrado">
        ?
      </span>
    );
  }
  if (usuario.avatar_url) return <img className="mx-foto" style={estilo} src={usuario.avatar_url} alt="" title={usuario.nome} />;
  return (
    <span className="mx-foto" style={{ ...estilo, background: CORES_INICIAIS[usuario.id % CORES_INICIAIS.length] }} title={usuario.nome}>
      {iniciais(usuario.nome)}
    </span>
  );
}

// Fotos empilhadas (pilar recolhido): até 3 e o "+n".
function Fotos({ usuarios, tamanho = 34 }) {
  const mostrar = usuarios.slice(0, 3);
  const resto = usuarios.length - mostrar.length;
  return (
    <span className="mx-fotos">
      {mostrar.map((u, i) => (
        <Foto key={u ? u.id : `sem-${i}`} usuario={u} tamanho={tamanho} />
      ))}
      {resto > 0 && (
        <span className="mx-foto mais" style={{ width: tamanho, height: tamanho }}>
          +{resto}
        </span>
      )}
    </span>
  );
}

const nomeResp = (u) => (u ? u.nome : 'Sem responsável');

function Valor({ x, modo }) {
  const d = desvio(x);
  const p = desvioPct(x);
  if (Math.abs(d) < 0.5) return <span className="mx-v">0</span>;
  const principal = modo === 'pct' ? (p === null ? 's/ previsto' : percentual(p)) : compacto(d);
  const secundario = modo === 'pct' ? compacto(d) : p === null ? 's/ previsto' : percentual(p);
  return (
    <>
      <span className="mx-v">{principal}</span>
      <span className="mx-v2">{secundario}</span>
    </>
  );
}

export default function Matriz({ M, modo, porPilar, onDetalhar }) {
  const { mostrar, esconder } = useDica();
  const [foco, setFoco] = useState({ l: null, c: null });

  // Colunas na ordem dos pilares: abertas (pilar + responsável) ou uma por pilar.
  const colunas = porPilar
    ? M.grupos.map((g, gi) => ({
        key: `g:${g.id}`,
        gi,
        inicio: true,
        pilar: g.descricao,
        resps: g.colunas.map((c) => c.resp),
        total: g.total,
        valor: (l) => M.celulaGrupo(l.key, g.id),
      }))
    : M.grupos.flatMap((g, gi) =>
        g.colunas.map((c, i) => ({
          key: c.key,
          gi,
          inicio: i === 0,
          pilar: g.descricao,
          resps: [c.resp],
          total: c.total,
          valor: (l) => M.celula(l.key, c.key),
        }))
      );
  const escala = porPilar ? M.maiorAbsGrupo : M.maiorAbs;

  const tituloColuna = (c) => `${c.pilar} · ${c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`}`;
  const tituloLinha = (l) => `${l.pacote} · ${nomeResp(l.resp)}`;

  const linhasDica = (x) => [
    ['Projetado', reais(x.p)],
    ['Realizado', reais(x.r)],
    ['Desvio', reais(desvio(x), true)],
    ['Desvio %', desvioPct(x) === null ? 'sem previsto' : percentual(desvioPct(x))],
  ];
  const dicaCelula = (ev, l, c, x) =>
    mostrar(ev, `${l.pacote} × ${c.pilar}`, [
      ['Pacote', nomeResp(l.resp)],
      ['Pilar', c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`],
      ...linhasDica(x),
      ['', 'Clique para detalhar'],
    ]);

  const celula = (x, props = {}) => {
    const cor = x ? corCalor(x, modo, escala) : null;
    return { cor, estilo: cor ? { background: cor.fundo, color: cor.texto } : undefined, ...props };
  };

  return (
    <div className="mx-scroll" onMouseLeave={() => setFoco({ l: null, c: null })}>
      <table className="mx">
        <thead>
          <tr>
            <th className="mx-canto" scope="col">
              <span className="mx-canto-c">Pilares →</span>
              <span className="mx-canto-l">↓ Pacotes</span>
            </th>
            {colunas.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`mx-col g${c.gi % 2}${c.inicio ? ' ini' : ''}${foco.c === c.key ? ' on' : ''}`}
              >
                <button
                  type="button"
                  className="mx-col-btn"
                  onClick={() => onDetalhar({ titulo: c.pilar, subtitulo: c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`, x: c.total })}
                  onMouseMove={(ev) => mostrar(ev, tituloColuna(c), [...linhasDica(c.total), ['', 'Clique para detalhar']])}
                  onMouseLeave={esconder}
                >
                  {c.resps.length === 1 ? <Foto usuario={c.resps[0]} tamanho={40} /> : <Fotos usuarios={c.resps} />}
                  <span className="mx-pilar">{c.pilar}</span>
                  <span className="mx-resp">{c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`}</span>
                </button>
              </th>
            ))}
            <th className="mx-tcol" scope="col">
              <span className="mx-pilar">Total</span>
              <span className="mx-resp">por pacote</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {M.linhas.map((l) => (
            <tr key={l.key} className={foco.l === l.key ? 'on' : ''}>
              <th scope="row" className={`mx-lin${foco.l === l.key ? ' on' : ''}`}>
                <button
                  type="button"
                  className="mx-lin-btn"
                  onClick={() => onDetalhar({ titulo: l.pacote, subtitulo: nomeResp(l.resp), x: l.total })}
                  onMouseMove={(ev) => mostrar(ev, tituloLinha(l), [...linhasDica(l.total), ['', 'Clique para detalhar']])}
                  onMouseLeave={esconder}
                >
                  <Foto usuario={l.resp} tamanho={34} />
                  <span className="mx-lin-txt">
                    <span className="mx-pacote">{l.pacote}</span>
                    <span className="mx-resp">{nomeResp(l.resp)}</span>
                  </span>
                </button>
              </th>
              {colunas.map((c) => {
                const x = c.valor(l);
                const { estilo, cor } = celula(x);
                return (
                  <td
                    key={c.key}
                    className={`mx-cel g${c.gi % 2}${c.inicio ? ' ini' : ''}${foco.c === c.key ? ' on' : ''}${cor?.forte ? ' forte' : ''}`}
                    style={estilo}
                    onMouseEnter={() => setFoco({ l: l.key, c: c.key })}
                  >
                    {x ? (
                      <button
                        type="button"
                        onClick={() => onDetalhar({ titulo: `${l.pacote} × ${c.pilar}`, subtitulo: `${nomeResp(l.resp)} · ${c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`}`, x })}
                        onMouseMove={(ev) => dicaCelula(ev, l, c, x)}
                        onMouseLeave={esconder}
                        aria-label={`${l.pacote} × ${c.pilar}: desvio ${reais(desvio(x), true)}`}
                      >
                        <Valor x={x} modo={modo} />
                      </button>
                    ) : (
                      <span className="mx-nada" aria-hidden="true" />
                    )}
                  </td>
                );
              })}
              <td className={`mx-tot ${desvio(l.total) > 0.5 ? 'bom' : desvio(l.total) < -0.5 ? 'ruim' : ''}`}>
                <button
                  type="button"
                  onClick={() => onDetalhar({ titulo: l.pacote, subtitulo: nomeResp(l.resp), x: l.total })}
                  onMouseMove={(ev) => mostrar(ev, `Total · ${tituloLinha(l)}`, linhasDica(l.total))}
                  onMouseLeave={esconder}
                >
                  <Valor x={l.total} modo={modo} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="mx-lin mx-tlin">
              <span className="mx-pacote">Total</span>
              <span className="mx-resp">por pilar</span>
            </th>
            {colunas.map((c) => (
              <td
                key={c.key}
                className={`mx-tot${c.inicio ? ' ini' : ''} ${desvio(c.total) > 0.5 ? 'bom' : desvio(c.total) < -0.5 ? 'ruim' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onDetalhar({ titulo: c.pilar, subtitulo: c.resps.length === 1 ? nomeResp(c.resps[0]) : `${c.resps.length} responsáveis`, x: c.total })}
                  onMouseMove={(ev) => mostrar(ev, `Total · ${tituloColuna(c)}`, linhasDica(c.total))}
                  onMouseLeave={esconder}
                >
                  <Valor x={c.total} modo={modo} />
                </button>
              </td>
            ))}
            <td className={`mx-tot mx-geral ${desvio(M.total) > 0.5 ? 'bom' : desvio(M.total) < -0.5 ? 'ruim' : ''}`}>
              <button
                type="button"
                onClick={() => onDetalhar({ titulo: 'Total geral', subtitulo: 'Todos os pacotes e pilares', x: M.total })}
                onMouseMove={(ev) => mostrar(ev, 'Total geral', linhasDica(M.total))}
                onMouseLeave={esconder}
              >
                <Valor x={M.total} modo={modo} />
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
