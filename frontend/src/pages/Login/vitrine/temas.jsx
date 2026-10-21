// Temas da vitrine do login: os títulos do site público (site/) com uma mini tela animada do sistema cada um.
// Números da empresa fictícia do site (Grupo Aurora) — ilustrativos. As animações são CSS (vitrine.css): o estado
// final é o estilo normal e a animação só parte dele; com movimento reduzido nada anima e a tela aparece pronta.
// Cada tema é montado de novo quando entra, então as animações recomeçam.
import { useEffect, useState } from 'react';
import {
  Cable,
  ChartColumn,
  ClipboardList,
  Lock,
  MoonStar,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import logoSienge from '../../../assets/integracoes/sienge.svg';
import logoItau from '../../../assets/integracoes/itau.svg';
import logoCaixa from '../../../assets/integracoes/portal-construtoras.svg';
import logoPrevision from '../../../assets/integracoes/prevision.svg';
import logoCrm from '../../../assets/integracoes/construtor-vendas.svg';
import logoWhats from '../../../assets/integracoes/zapi.svg';
import logoMcp from '../../../assets/integracoes/mcp.svg';
import logoSefaz from '../../../assets/integracoes/certificados-digitais.svg';
import logoEmail from '../../../assets/integracoes/email.svg';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Mês daqui a k meses: rótulo "mar/27", nome "março" e número "03".
const mes = (k) => {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
  return {
    curto: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
    longo: MESES_LONGOS[d.getMonth()],
    num: String(d.getMonth() + 1).padStart(2, '0'),
  };
};
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mi = (v) => `R$ ${nf2.format(v)} mi`;
const reais = (v) => `R$ ${nf2.format(v)}`;

export const movimentoReduzido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Conta de `de` até o alvo, começando depois de `atraso` ms; antes disso devolve null (quem usa mostra o que
// quiser). Com movimento reduzido já nasce no alvo.
function useContagem(alvo, { duracao = 1300, atraso = 0, de = 0 } = {}) {
  const [reduzido] = useState(movimentoReduzido);
  const [v, setV] = useState(reduzido ? alvo : null);
  useEffect(() => {
    if (reduzido) return undefined;
    let raf = 0;
    let inicio = 0;
    const t = setTimeout(() => {
      const passo = (agora) => {
        if (!inicio) inicio = agora;
        const p = Math.min(1, (agora - inicio) / duracao);
        setV(de + (alvo - de) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(passo);
      };
      raf = requestAnimationFrame(passo);
    }, atraso);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [alvo, duracao, atraso, de, reduzido]);
  return v;
}

// Moldura de tela do Horizon (símbolo + caminho do menu), como as telas do site.
function Janela({ caminho, children, className = '' }) {
  return (
    <div className={`vt-janela ${className}`}>
      <div className="vt-janela__barra">
        <img src="/favicon.svg" alt="" width="13" height="16" />
        <span>{caminho}</span>
      </div>
      <div className="vt-janela__corpo">{children}</div>
    </div>
  );
}

// ─── 1. Caixa ─────────────────────────────────────────────────────────────────────────────────────
// REAL termina hoje; PROJ[k] é o mês k+1. O mínimo (36,5) cai no mês 5, como no site.
const REAL = [44.1, 42.0, 43.3, 41.8, 40.9, 40.85];
const PROJ = [41.8, 43.0, 43.6, 38.8, 36.5, 36.9, 37.0, 36.9, 39.5];
const COLCHAO = 25.4;
const W = 520;
const H = 190;
const x = (i, n) => 30 + ((W - 46) * i) / (n - 1);
const y = (v, min = 20, max = 48) => 12 + (H - 34) * (1 - (v - min) / (max - min));
const linha = (vals, i0, n, esc = y) => vals.map((v, k) => `${k ? 'L' : 'M'}${x(i0 + k, n).toFixed(1)},${esc(v).toFixed(1)}`).join('');

function VisualCaixa() {
  const n = REAL.length + PROJ.length;
  const caixa = useContagem(40.85, { atraso: 450 });
  // O mínimo aparece com a projeção: desce do caixa de hoje até o ponto mais baixo.
  const minimo = useContagem(36.53, { atraso: 2300, de: 40.85 });
  const kMin = PROJ.indexOf(Math.min(...PROJ));
  const xMin = x(REAL.length + kMin, n);
  const yMin = y(PROJ[kMin]);
  return (
    <Janela caminho="Dashboards › Econômico Financeiro › Fluxo de Caixa">
      <div className="vt-kpis">
        <div className="vt-kpi" style={{ '--i': 0 }}>
          <span>Caixa hoje</span>
          <b>{mi(caixa ?? 0)}</b>
          <i className="vt-tag ok">acima do colchão</i>
        </div>
        <div className="vt-kpi" style={{ '--i': 1 }}>
          <span>Mínimo projetado</span>
          <b>{minimo == null ? '—' : mi(minimo)}</b>
          <i className="vt-tag aviso">em {mes(kMin + 1).curto}</i>
        </div>
      </div>
      <svg className="vt-grafico" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="vt-area-real" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#004894" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#004894" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 30, 35, 40, 45].map((v) => (
          <line key={v} x1="30" x2={W - 16} y1={y(v)} y2={y(v)} className="vt-grade" />
        ))}
        <rect x={x(REAL.length - 1, n)} y="8" width={x(n - 1, n) - x(REAL.length - 1, n)} height={H - 30} className="vt-projetado" />
        <line x1="30" x2={W - 16} y1={y(COLCHAO)} y2={y(COLCHAO)} className="vt-colchao" />
        <text x="34" y={y(COLCHAO) - 6} className="vt-rotulo-colchao">colchão R$ 25,4 mi</text>
        <path d={`${linha(REAL, 0, n)}L${x(REAL.length - 1, n)},${H - 22}L30,${H - 22}Z`} className="vt-area" />
        <path d={linha(REAL, 0, n)} pathLength="1" className="vt-real vt-desenha" />
        <g className="vt-revela">
          <path d={linha([REAL.at(-1), ...PROJ], REAL.length - 1, n)} className="vt-orcado" />
          <circle cx={xMin} cy={yMin} r="5" className="vt-anel" />
          <circle cx={xMin} cy={yMin} r="5" className="vt-ponto-min" />
          <text x={xMin} y={yMin + 20} textAnchor="middle" className="vt-rotulo forte">{mes(kMin + 1).curto}</text>
        </g>
        <circle cx={x(REAL.length - 1, n)} cy={y(REAL.at(-1))} r="5" className="vt-hoje" />
        <text x={x(REAL.length - 1, n)} y={H - 6} textAnchor="middle" className="vt-rotulo forte">hoje</text>
        <text x={x(1, n)} y={H - 6} textAnchor="middle" className="vt-rotulo">realizado</text>
        <text x={x(n - 2, n)} y={H - 6} textAnchor="middle" className="vt-rotulo">projetado</text>
      </svg>
    </Janela>
  );
}

// ─── 2. DRE ───────────────────────────────────────────────────────────────────────────────────────
// Receita 29,64 → lucro bruto 9,85 → EBITDA 3,42 → lucro líquido 1,68 (os números da DRE do site).
const DRE = [
  ['Receita', 29.64, 'mais'],
  ['Impostos', -3.02, 'menos'],
  ['Custos', -16.77, 'menos'],
  ['L. bruto', null, 'sub'],
  ['Despesas', -6.43, 'menos'],
  ['EBITDA', null, 'sub'],
  ['Fin. e IR', -1.74, 'menos'],
  ['Lucro', null, 'fim'],
];
function VisualDre() {
  let acum = 0;
  const barras = DRE.map(([rot, v, tipo]) => {
    let de = 0;
    let ate;
    if (tipo === 'mais') ate = acum = v;
    else if (tipo === 'menos') {
      de = acum;
      ate = acum += v;
    } else ate = acum;
    return { rot, tipo, de, ate, valor: tipo === 'menos' ? v : ate };
  });
  const pct = (v) => `${(v / 31) * 100}%`;
  return (
    <Janela caminho="Dashboards › Econômico Financeiro › Demonstração do Resultado">
      <div className="vt-dre-cab">
        <span>
          <b>DRE · {mes(-1).curto}</b>
          <small>em R$ mi</small>
        </span>
        <i className="vt-carimbo">Fechada em 01/{mes(0).num} às 06:12</i>
      </div>
      <div className="vt-cascata">
        {barras.map((b, i) => (
          <div key={b.rot} className="vt-coluna">
            <div className="vt-coluna__trilho">
              <span
                className={`vt-barra ${b.tipo}`}
                style={{ bottom: pct(Math.min(b.de, b.ate)), height: `max(3px, ${pct(Math.abs(b.ate - b.de))})`, '--i': i }}
              >
                <em>{nf1.format(b.valor)}</em>
              </span>
            </div>
            <small>{b.rot}</small>
          </div>
        ))}
      </div>
    </Janela>
  );
}

// ─── 3. Orçamento ─────────────────────────────────────────────────────────────────────────────────
// Desvio % do realizado contra o orçado nos meses fechados; o mês corrente ainda aberto.
const ORC_LINHAS = [
  ['Receita de vendas', [-2.1, -2.9, -2.4], '29,0'],
  ['Custos diretos', [4.1, 5.2, 4.8], '15,6'],
  ['Pessoal', [-1.2, 0.8, 1.3], '4,7'],
  ['Marketing', [-6.0, -3.5, -5.2], '0,42'],
];
function VisualOrcamento() {
  return (
    <Janela caminho="Operações › Orçamento › Orçamento">
      <div className="vt-versoes">
        <span>v1 · Original</span>
        <span>v2 · Pós-dissídio</span>
        <span>v3 · 2º semestre</span>
        <i className="vt-versoes__marca" />
      </div>
      <table className="vt-orc-tab">
        <thead>
          <tr>
            <th>Desvio contra o orçado</th>
            {[-3, -2, -1].map((k) => (
              <th key={k}>
                <Lock size={9} strokeWidth={2.5} /> {mes(k).curto}
              </th>
            ))}
            <th>{mes(0).curto}</th>
          </tr>
        </thead>
        <tbody>
          {ORC_LINHAS.map(([nome, dvs, aberto], li) => (
            <tr key={nome}>
              <td>{nome}</td>
              {dvs.map((dv, ci) => {
                // Receita abaixo do orçado é ruim; despesa acima do orçado é ruim.
                const ruim = li === 0 ? dv < 0 : dv > 0;
                return (
                  <td key={ci} className={`vt-celula ${ruim ? 'ruim' : 'bom'}`} style={{ '--i': li * 3 + ci }}>
                    {dv > 0 ? '+' : ''}
                    {nf1.format(dv)}%
                  </td>
                );
              })}
              <td className="vt-celula aberta" style={{ '--i': li }}>
                {aberto} mi
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="vt-log">
        <li style={{ '--i': 0 }}>
          <i>MA</i>
          <span>
            <b>Marcos Andrade</b> alterou Marketing de {mes(1).curto}: R$ 380 mil → R$ 420 mil
          </span>
        </li>
        <li style={{ '--i': 1 }} className="ia">
          <i>
            <Sparkles size={11} />
          </i>
          <span>
            <b>Claude, a pedido de Marcos Andrade,</b> ajustou Fretes de {mes(2).curto}: R$ 1,46 mi → R$ 1,40 mi
          </span>
        </li>
      </ol>
    </Janela>
  );
}

// ─── 4. Cenários ──────────────────────────────────────────────────────────────────────────────────
const BASE = [41.8, 43.0, 43.6, 38.8, 36.5, 36.9, 37.0, 36.9, 39.5];
const CENARIO = [39.9, 38.4, 36.3, 29.0, 24.1, 20.9, 18.4, 15.6, 15.2];
function VisualCenarios() {
  const queda = useContagem(15, { duracao: 1600, atraso: 900 });
  const n = BASE.length + 1;
  const yc = (v) => y(v, 10, 48);
  const k = CENARIO.findIndex((v) => v < COLCHAO);
  const xf = x(k + 1, n);
  return (
    <Janela caminho="Dashboards › Econômico Financeiro › Simulador de cenário">
      <div className="vt-slider">
        <span>Queda na receita de vendas</span>
        <b>{Math.round(queda ?? 0)}%</b>
        <div className="vt-slider__trilho">
          <i className="vt-slider__cheio" />
          <i className="vt-slider__botao" />
        </div>
      </div>
      <svg className="vt-grafico" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {[15, 25, 35, 45].map((v) => (
          <line key={v} x1="30" x2={W - 16} y1={yc(v)} y2={yc(v)} className="vt-grade" />
        ))}
        <line x1="30" x2={W - 16} y1={yc(COLCHAO)} y2={yc(COLCHAO)} className="vt-colchao" />
        <text x="34" y={yc(COLCHAO) + 14} className="vt-rotulo-colchao">colchão</text>
        <path d={linha([40.85, ...BASE], 0, n, yc)} className="vt-orcado" />
        <text x={W - 18} y={yc(BASE.at(-1)) - 8} textAnchor="end" className="vt-rotulo">orçamento</text>
        <path d={linha([40.85, ...CENARIO], 0, n, yc)} pathLength="1" className="vt-cenario vt-desenha" />
        <g className="vt-ruptura">
          <line x1={xf} x2={xf} y1="10" y2={H - 22} />
          <circle cx={xf} cy={yc(CENARIO[k])} r="5" className="vt-anel" />
          <circle cx={xf} cy={yc(CENARIO[k])} r="5" />
          <text x={xf + 9} y="22">Ponto de ruptura: {mes(k + 1).curto}</text>
        </g>
        <text x="30" y={H - 6} className="vt-rotulo forte">hoje</text>
      </svg>
    </Janela>
  );
}

// ─── 5. Notas ─────────────────────────────────────────────────────────────────────────────────────
// As notas do Espião do site: três casam com o contas a pagar (CNPJ, data e nº), uma vai para revisão e
// uma está sem título há 34 dias — as duas últimas somam os R$ 87.420,00 que ninguém lançou.
const NOTAS = [
  ['Embalagens Minas Ltda', 'NF-e 48.211', 84300, 'ok'],
  ['Transportadora Rota 040', 'NFS-e 9.072', 31950, 'ok'],
  ['Atacado Sul Alimentos', 'NF-e 120.554', 212708.4, 'ok'],
  ['TechNuvem Serviços', 'NFS-e 3.318', 12400, 'revisar'],
  ['Distribuidora Ômega Ltda', 'NF-e 2.207', 75020, 'pendente'],
];
function VisualNotas() {
  const total = useContagem(87420, { duracao: 1100, atraso: 3500 });
  return (
    <Janela caminho="Operações › Espião NFe / NFSe" className="vt-espiao">
      <i className="vt-varredura" />
      <ol className="vt-notas">
        {NOTAS.map(([emissor, nota, valor, fim], i) => (
          <li key={nota} className={`vt-nota ${fim}`} style={{ '--i': i }}>
            <span className="vt-nota__emissor">
              <b>{emissor}</b>
              <small>{nota}</small>
            </span>
            <span className="vt-nota__valor">{reais(valor)}</span>
            <span className="vt-nota__conf">
              {fim === 'ok' && (
                <>
                  <i style={{ '--j': 0 }}>CNPJ</i>
                  <i style={{ '--j': 1 }}>Data</i>
                  <i style={{ '--j': 2 }}>Nº</i>
                </>
              )}
              {fim === 'revisar' && <i className="aviso">ambígua · revisar</i>}
              {fim === 'pendente' && <i className="critico">sem título · 34 dias</i>}
            </span>
          </li>
        ))}
      </ol>
      <div className="vt-notas__total">
        <span>Em 2 notas que ninguém lançou</span>
        <b>{reais(total ?? 0)}</b>
      </div>
    </Janela>
  );
}

// ─── 6. Enquanto você dorme ───────────────────────────────────────────────────────────────────────
const ROTINAS = [
  ['06:00', 'Extratos, títulos e notas puxados de todos os sistemas'],
  ['07:30', 'Saldo das contas no WhatsApp da diretoria'],
  ['10:30', 'Régua de cobrança enviada, com o boleto'],
  ['16:00', 'Tarefas da equipe com dono e prazo'],
];
const ESTRELAS = [
  [64, 34], [128, 70], [190, 26], [262, 52], [330, 22], [398, 64], [452, 30], [96, 110], [470, 96], [236, 96],
];
function VisualDia() {
  const [reduzido] = useState(movimentoReduzido);
  const [passo, setPasso] = useState(reduzido ? ROTINAS.length - 1 : -1);
  useEffect(() => {
    if (reduzido) return undefined;
    const ts = ROTINAS.map((_, i) => setTimeout(() => setPasso(i), 1100 + i * 1300));
    return () => ts.forEach(clearTimeout);
  }, [reduzido]);
  const arco = 'M30 150 Q260 -100 490 150';
  return (
    <div className="vt-dia">
      <svg className="vt-ceu" viewBox="0 0 520 170" aria-hidden="true">
        <defs>
          <radialGradient id="vt-sol-brilho">
            <stop offset="0%" stopColor="#ffe08a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffb21e" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vt-ceu-dia" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3f8fdc" />
            <stop offset="70%" stopColor="#8dbbe6" />
            <stop offset="100%" stopColor="#ffc98a" />
          </linearGradient>
        </defs>
        <rect width="520" height="150" fill="url(#vt-ceu-dia)" className="vt-dia-ceu" />
        {ESTRELAS.map(([ex, ey], i) => (
          <circle key={i} cx={ex} cy={ey} r={i % 3 ? 1.2 : 1.8} className="vt-estrela" style={{ '--i': i }} />
        ))}
        <path d={arco} className="vt-arco" />
        <g transform={reduzido ? 'translate(380 52)' : undefined}>
          <circle r="34" fill="url(#vt-sol-brilho)" />
          <circle r="11" className="vt-sol" />
          {!reduzido && <animateMotion dur="5.6s" begin="0.3s" fill="freeze" path={arco} keyPoints="0;0.74" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.3 1" />}
        </g>
        <rect x="0" y="150" width="520" height="20" className="vt-chao" />
        <line x1="0" x2="520" y1="150" y2="150" className="vt-horizonte" />
        <text x="260" y="138" textAnchor="middle" className="vt-relogio">
          {passo < 0 ? '05:59' : ROTINAS[passo][0]}
        </text>
      </svg>
      <ol className="vt-rotinas">
        {ROTINAS.map(([hora, txt], i) => (
          <li key={hora} className={i <= passo ? 'feita' : ''}>
            <time>{hora}</time>
            <span>{txt}</span>
            <i aria-hidden="true">{i <= passo ? '✓' : ''}</i>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── 7. IA ────────────────────────────────────────────────────────────────────────────────────────
function VisualIa() {
  const resposta = `O caixa do grupo está em **R$ 40,85 mi** e o ponto mais baixo é **R$ 36,53 mi em ${mes(5).curto}**, sempre acima do colchão de R$ 25,4 mi. Atenção para a **Aurora Varejo**: sozinha, ela zera em **${mes(6).curto}**.`;
  let w = 0;
  const partes = resposta.split(/(\*\*[^*]+\*\*)/).filter(Boolean);
  return (
    <div className="vt-chat">
      <div className="vt-chat__cab">
        <i className="vt-chat__on" />
        <b>Claude</b>
        <span>com o conector do Horizon Finanças</span>
      </div>
      <div className="vt-chat__msgs">
        <p className="vt-msg eu">Como está o caixa do grupo?</p>
        <p className="vt-msg ferramenta">
          <i />
          Consultando o Horizon: painel do fluxo de caixa
        </p>
        <p className="vt-msg ia">
          {partes.map((p, k) => {
            const forte = p.startsWith('**');
            const pedacos = (forte ? p.slice(2, -2) : p).split(/(\s+)/);
            const spans = pedacos.map((pal, j) =>
              !pal || /^\s+$/.test(pal) ? (
                pal
              ) : (
                <span key={j} className="vt-palavra" style={{ '--i': w++ }}>
                  {pal}
                </span>
              )
            );
            return forte ? <b key={k}>{spans}</b> : <span key={k}>{spans}</span>;
          })}
        </p>
      </div>
    </div>
  );
}

// ─── 8. Integrações ───────────────────────────────────────────────────────────────────────────────
// O último nó é o "Seu ERP": usa outro sistema? A gente conecta.
const LOGOS = [
  [logoSienge, 'Sienge'],
  [logoItau, 'Itaú'],
  [logoCaixa, 'Caixa'],
  [logoPrevision, 'Prevision'],
  [logoCrm, 'CV CRM'],
  [logoSefaz, 'SEFAZ'],
  [logoWhats, 'WhatsApp'],
  [logoEmail, 'E-mail'],
  [logoMcp, 'Claude'],
  [null, 'Seu ERP'],
];
function VisualIntegracoes() {
  const [reduzido] = useState(movimentoReduzido);
  const cx = 260;
  const cy = 165;
  const pos = LOGOS.map((_, i) => {
    const a = (Math.PI * 2 * i) / LOGOS.length - Math.PI / 2;
    return [cx + 205 * Math.cos(a), cy + 128 * Math.sin(a)];
  });
  return (
    <div className="vt-rede">
      <svg viewBox="0 0 520 330" aria-hidden="true">
        {pos.map(([px, py], i) => {
          const d = `M${px.toFixed(1)} ${py.toFixed(1)} L${cx} ${cy}`;
          return (
            <g key={i}>
              <path d={d} pathLength="1" className={`vt-fio ${LOGOS[i][0] ? '' : 'novo'}`} style={{ '--i': i }} />
              {!reduzido && LOGOS[i][0] && (
                <circle r="3" className="vt-pulso" visibility="hidden">
                  <set attributeName="visibility" to="visible" begin={`${1.6 + i * 0.17}s`} />
                  <animateMotion dur={`${1.8 + (i % 3) * 0.45}s`} begin={`${1.6 + i * 0.17}s`} repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="vt-rede__centro">
        <img src="/favicon.svg" alt="" />
      </div>
      {LOGOS.map(([src, nome], i) => (
        <div
          key={nome}
          className={`vt-rede__no ${src ? '' : 'novo'}`}
          style={{ left: `${(pos[i][0] / 520) * 100}%`, top: `${(pos[i][1] / 330) * 100}%`, '--i': i }}
        >
          {src ? <img src={src} alt="" /> : <i>+</i>}
          <span>{nome}</span>
        </div>
      ))}
    </div>
  );
}

// Títulos do site, com a frase de apoio, o módulo e a cor de destaque de cada tema.
export const TEMAS = [
  {
    id: 'caixa',
    modulo: 'Fluxo de caixa',
    Icone: TrendingUp,
    titulo: () => `Quanto você vai ter em caixa em ${mes(5).longo}? O Horizon responde antes do café.`,
    apoio: 'Realizado direto do extrato, projetado pelo orçamento, por empresa e no consolidado do grupo.',
    cor: '#2f86e8',
    Visual: VisualCaixa,
  },
  {
    id: 'dre',
    modulo: 'DRE',
    Icone: ChartColumn,
    titulo: () => 'A DRE fecha no dia 1º. Não no dia 20.',
    apoio: 'Da receita bruta ao lucro líquido, mês a mês e contra o orçado, sem ninguém montar planilha.',
    cor: '#189dda',
    Visual: VisualDre,
  },
  {
    id: 'orcamento',
    modulo: 'Orçamento',
    Icone: ClipboardList,
    titulo: () => 'Orçamento que vive fora da gaveta.',
    apoio: 'Versões com nome e data, meses fechados com cadeado e o histórico de quem mudou o quê.',
    cor: '#7c6cf0',
    Visual: VisualOrcamento,
  },
  {
    id: 'cenarios',
    modulo: 'Simulador de cenários',
    Icone: SlidersHorizontal,
    titulo: () => 'E se as vendas caírem 15%? Descubra hoje, não quando o banco ligar.',
    apoio: 'Mexa no cenário e veja o mês em que o caixa fura o colchão, antes de acontecer.',
    cor: '#eb6834',
    Visual: VisualCenarios,
  },
  {
    id: 'notas',
    modulo: 'Espião NF-e e NFS-e',
    Icone: ScanSearch,
    titulo: () => 'A nota que você não viu é o boleto que vai te pegar de surpresa.',
    apoio: 'O Espião busca na SEFAZ as notas emitidas contra o seu CNPJ e confere com o contas a pagar.',
    cor: '#f2a516',
    Visual: VisualNotas,
  },
  {
    id: 'dia',
    modulo: 'Rotinas automáticas',
    Icone: MoonStar,
    titulo: () => 'Enquanto você dorme, o Horizon faz o trabalho chato.',
    apoio: 'Extratos, saldos no WhatsApp, cobrança e tarefas, no horário certo e sem ninguém colar nada.',
    cor: '#ffb21e',
    Visual: VisualDia,
  },
  {
    id: 'ia',
    modulo: 'IA no financeiro',
    Icone: Sparkles,
    titulo: () => 'Pergunte ao seu financeiro. Em português.',
    apoio: 'O Claude consulta o Horizon na hora e responde com os números do painel.',
    cor: '#22b8a7',
    Visual: VisualIa,
  },
  {
    id: 'integracoes',
    modulo: 'Integrações',
    Icone: Cable,
    titulo: () => 'Conecta com o que sua empresa já usa.',
    apoio: 'ERP, bancos, SEFAZ, WhatsApp, e-mail e IA. Usa outro ERP? A gente conecta.',
    cor: '#4f8dfb',
    Visual: VisualIntegracoes,
  },
];
