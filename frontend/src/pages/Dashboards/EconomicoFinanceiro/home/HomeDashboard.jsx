import executivo from '../../../../assets/dashboards/executivo-financeiro.webp';
import './home.css';

// Home do dashboard Econômico Financeiro (pedido do usuário): fundo azul royal, o executivo low-poly
// no canto esquerdo e o letreiro "Dashboards / ECONÔMICO FINANCEIRO". O menu de telas abre sozinho
// nesta tela (ver EconomicoFinanceiroPage.jsx). A imagem é a gerada no ChatGPT, com o fundo recortado
// (transparente) para assentar no azul da página. Os triângulos do fundo repetem o estilo low-poly.

// Malha de triângulos do fundo: pontos numa grade com deslocamento fixo (gerador com semente), cada
// triângulo com um tom levemente mais claro ou mais escuro que o azul.
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
        tris.push({ d: `M${t.map((p) => p.map((n) => n.toFixed(1)).join(',')).join('L')}Z`, claro, op: 0.015 + rnd() * 0.05 });
      }
    }
  }
  return tris;
}
const FACETAS = gerarFacetas();

export default function HomeDashboard() {
  return (
    <div className="home-ef">
      <svg className="home-ef__facetas" viewBox="0 0 1400 900" preserveAspectRatio="none" aria-hidden="true">
        {FACETAS.map((t, i) => (
          <path key={i} d={t.d} fill={t.claro ? '#ffffff' : '#0a1f4d'} fillOpacity={t.op} />
        ))}
      </svg>

      <div className="home-ef__executivo">
        <div className="home-ef__aura" aria-hidden="true" />
        <img src={executivo} alt="" draggable="false" />
      </div>

      <div className="home-ef__titulo">
        <h1>
          <span className="home-ef__marca">Dashboards</span>
          <span className="home-ef__divisor" aria-hidden="true">
            <i />
            <b />
            <i />
          </span>
          <span className="home-ef__nome">Econômico Financeiro</span>
        </h1>
      </div>
    </div>
  );
}
