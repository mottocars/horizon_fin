import { useState } from 'react';
import { useDica } from '../fluxo/ganchos';
import { compacto, corCalor, desvio, desvioPct, percentual, reais } from './modelo';

// A matriz da Gestão Matricial: linhas = Pacotes (foto do responsável à frente do nome), colunas = Pilares (foto do
// responsável acima do nome) — o responsável é o da própria máscara (Cadastros › Máscaras). Célula = desvio da DFC
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
      <span className="mx-foto vazia" style={estilo} title="Sem responsável — escolha em Cadastros › Máscaras">
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

const classeTotal = (x) => (desvio(x) > 0.5 ? 'bom' : desvio(x) < -0.5 ? 'ruim' : '');

export default function Matriz({ M, modo, onDetalhar }) {
  const { mostrar, esconder } = useDica();
  const [foco, setFoco] = useState({ l: null, c: null });

  const linhasDica = (x) => [
    ['Projetado', reais(x.p)],
    ['Realizado', reais(x.r)],
    ['Desvio', reais(desvio(x), true)],
    ['Desvio %', desvioPct(x) === null ? 'sem previsto' : percentual(desvioPct(x))],
  ];
  const titulo = (e) => `${e.nome} · ${nomeResp(e.resp)}`;

  return (
    <div className="mx-scroll" onMouseLeave={() => setFoco({ l: null, c: null })}>
      <table className="mx">
        <thead>
          <tr>
            <th className="mx-canto" scope="col">
              <span className="mx-canto-c">Pilares →</span>
              <span className="mx-canto-l">↓ Pacotes</span>
            </th>
            {M.colunas.map((c) => (
              <th key={c.key} scope="col" className={`mx-col${foco.c === c.key ? ' on' : ''}`}>
                <button
                  type="button"
                  className="mx-col-btn"
                  onClick={() => onDetalhar({ titulo: c.nome, subtitulo: nomeResp(c.resp), x: c.total })}
                  onMouseMove={(ev) => mostrar(ev, titulo(c), [...linhasDica(c.total), ['', 'Clique para detalhar']])}
                  onMouseLeave={esconder}
                >
                  <Foto usuario={c.resp} tamanho={40} />
                  <span className="mx-pilar">{c.nome}</span>
                  <span className="mx-resp">{nomeResp(c.resp)}</span>
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
                  onClick={() => onDetalhar({ titulo: l.nome, subtitulo: nomeResp(l.resp), x: l.total })}
                  onMouseMove={(ev) => mostrar(ev, titulo(l), [...linhasDica(l.total), ['', 'Clique para detalhar']])}
                  onMouseLeave={esconder}
                >
                  <Foto usuario={l.resp} tamanho={34} />
                  <span className="mx-lin-txt">
                    <span className="mx-pacote">{l.nome}</span>
                    <span className="mx-resp">{nomeResp(l.resp)}</span>
                  </span>
                </button>
              </th>
              {M.colunas.map((c) => {
                const x = M.celula(l.key, c.key);
                const cor = x ? corCalor(x, modo, M.maiorAbs) : null;
                return (
                  <td
                    key={c.key}
                    className={`mx-cel${foco.c === c.key ? ' on' : ''}${cor?.forte ? ' forte' : ''}`}
                    style={cor ? { background: cor.fundo, color: cor.texto } : undefined}
                    onMouseEnter={() => setFoco({ l: l.key, c: c.key })}
                  >
                    {x ? (
                      <button
                        type="button"
                        onClick={() => onDetalhar({ titulo: `${l.nome} × ${c.nome}`, subtitulo: `${nomeResp(l.resp)} · ${nomeResp(c.resp)}`, x })}
                        onMouseMove={(ev) =>
                          mostrar(ev, `${l.nome} × ${c.nome}`, [
                            ['Pacote', nomeResp(l.resp)],
                            ['Pilar', nomeResp(c.resp)],
                            ...linhasDica(x),
                            ['', 'Clique para detalhar'],
                          ])
                        }
                        onMouseLeave={esconder}
                        aria-label={`${l.nome} × ${c.nome}: desvio ${reais(desvio(x), true)}`}
                      >
                        <Valor x={x} modo={modo} />
                      </button>
                    ) : (
                      <span className="mx-nada" aria-hidden="true" />
                    )}
                  </td>
                );
              })}
              <td className={`mx-tot ${classeTotal(l.total)}`}>
                <button
                  type="button"
                  onClick={() => onDetalhar({ titulo: l.nome, subtitulo: nomeResp(l.resp), x: l.total })}
                  onMouseMove={(ev) => mostrar(ev, `Total · ${titulo(l)}`, linhasDica(l.total))}
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
            {M.colunas.map((c) => (
              <td key={c.key} className={`mx-tot ${classeTotal(c.total)}`}>
                <button
                  type="button"
                  onClick={() => onDetalhar({ titulo: c.nome, subtitulo: nomeResp(c.resp), x: c.total })}
                  onMouseMove={(ev) => mostrar(ev, `Total · ${titulo(c)}`, linhasDica(c.total))}
                  onMouseLeave={esconder}
                >
                  <Valor x={c.total} modo={modo} />
                </button>
              </td>
            ))}
            <td className={`mx-tot mx-geral ${classeTotal(M.total)}`}>
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
