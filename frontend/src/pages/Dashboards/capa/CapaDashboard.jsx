import './capa.css';

// Capa (Home) dos dashboards (pedido do usuário): fundo colorido facetado, o personagem low-poly no
// canto esquerdo e o letreiro "Dashboards / <nome>". O menu de telas abre sozinho nesta tela (ver
// EconomicoFinanceiroPage.jsx e ComercialDashboard.jsx). As imagens são as geradas no ChatGPT, com o
// fundo recortado (transparente) para assentar na cor da página. Os triângulos do fundo repetem o
// estilo low-poly; o fundo se mexe (luz passando, triângulos acendendo, aura pulsando — ver capa.css).
// - `imagem`: o personagem (quadrado, transparente, cortado embaixo).
// - `nome`: a linha de baixo do letreiro.
// - `tema`: 'azul' (Econômico/Financeiro), 'verde' (Comercial) ou 'laranja' (Obra em Foco) — as cores
//   ficam em capa.css.

// Tom escuro dos triângulos de cada tema (o claro é sempre branco).
const ESCURO = { azul: '#0a1f4d', verde: '#04301c', laranja: '#5c2306' };

// Malha de triângulos do fundo: pontos numa grade com deslocamento fixo (gerador com semente), cada
// triângulo com um tom levemente mais claro ou mais escuro que o fundo.
function gerarFacetas() {
  let s = 20261029;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const COLS = 14;
  const LINS = 9;
  const W = 1400;
  const H = 900;
  const pts = [];
  for (let j = 0; j <= LINS; j++) {
    const linha = [];
    for (let i = 0; i <= COLS; i++) {
      const borda = i === 0 || j === 0 || i === COLS || j === LINS;
      const jx = borda ? 0 : (rnd() - 0.5) * 70;
      const jy = borda ? 0 : (rnd() - 0.5) * 70;
      linha.push([(i * W) / COLS + jx, (j * H) / LINS + jy]);
    }
    pts.push(linha);
  }
  const tris = [];
  for (let j = 0; j < LINS; j++) {
    for (let i = 0; i < COLS; i++) {
      const [a, b, c, d] = [pts[j][i], pts[j][i + 1], pts[j + 1][i], pts[j + 1][i + 1]];
      const diag = rnd() > 0.5;
      for (const t of diag ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]) {
        const claro = rnd() > 0.45;
        // Parte dos claros "acende" devagar, cada um no seu tempo (home.css, .capa__faceta-viva).
        const viva = claro && rnd() < 0.6 ? { atraso: -rnd() * 10, duracao: 4 + rnd() * 5 } : null;
        tris.push({ d: `M${t.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}Z`, claro, op: 0.015 + rnd() * 0.05, viva });
      }
    }
  }
  return tris;
}
const FACETAS = gerarFacetas();

export default function CapaDashboard({ imagem, nome, tema = 'azul' }) {
  return (
    <div className={`capa capa--${tema}`}>
      <svg className="capa__facetas" viewBox="0 0 1400 900" preserveAspectRatio="none" aria-hidden="true">
        {FACETAS.map((t, i) => (
          <path
            key={i}
            d={t.d}
            fill={t.claro ? '#ffffff' : ESCURO[tema]}
            fillOpacity={t.op}
            className={t.viva ? 'capa__faceta-viva' : undefined}
            style={t.viva ? { '--op': t.op, animationDelay: `${t.viva.atraso.toFixed(2)}s`, animationDuration: `${t.viva.duracao.toFixed(2)}s` } : undefined}
          />
        ))}
      </svg>
      <div className="capa__luz" aria-hidden="true" />
      <div className="capa__luz capa__luz--2" aria-hidden="true" />

      <div className="capa__personagem">
        <div className="capa__aura" aria-hidden="true" />
        <img src={imagem} alt="" draggable="false" />
      </div>

      <div className="capa__titulo">
        <h1>
          <span className="capa__marca">Dashboards</span>
          <span className="capa__divisor" aria-hidden="true">
            <i />
            <b />
            <i />
          </span>
          <span className="capa__nome">{nome}</span>
        </h1>
      </div>
    </div>
  );
}
