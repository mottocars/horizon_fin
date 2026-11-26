// Modelo da Gestão Matricial (dashboard Econômico Financeiro): monta a matriz Pacote × Pilar a partir dos valores
// por centro × natureza da rota /dashboards/economico-financeiro/gestao-matricial (backend
// dashboards/gestaoMatricial.service.js).
// - Coluna = Pilar (do cadastro do CENTRO de custo); linha = Pacote (do cadastro da NATUREZA). O responsável de cada
//   um é o do próprio pilar / pacote, escolhido em Cadastros › Máscaras (pedido do usuário, 26/11/2026).
// - Desvio = Realizado − Projetado, com o sinal do caixa (como o Desvio % da aba DFC): positivo = melhor que o
//   previsto (entrou mais / saiu menos), negativo = pior. Desvio % = desvio ÷ |Projetado| (sem projetado: null).

export const SEM = 0; // pilar / pacote / responsável não cadastrado
const SEM_ORDEM = 1e9;

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const desvio = (x) => (x ? x.r - x.p : 0);
export const desvioPct = (x) => (x && Math.abs(x.p) >= 0.005 ? ((x.r - x.p) / Math.abs(x.p)) * 100 : null);
export const temValor = (x) => Boolean(x) && (Math.abs(x.r) >= 0.005 || Math.abs(x.p) >= 0.005);

const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
// R$ compacto da célula: +1,2 mi / −350 mil / +820.
export function compacto(v) {
  const a = Math.abs(v);
  if (a < 0.5) return '0';
  const s = a >= 1e6 ? `${nf1.format(a / 1e6)} mi` : a >= 1e3 ? `${nf0.format(a / 1e3)} mil` : nf0.format(a);
  return sinal(v) + s;
}
// R$ inteiro (dica e detalhamento).
export function reais(v, comSinal = false) {
  if (v === null || v === undefined) return '–';
  return `${v < 0 ? '−' : comSinal && v > 0 ? '+' : ''}R$ ${nf2.format(Math.abs(v))}`;
}
// R$ curto dos indicadores: R$ 1,23 mi / R$ 350 mil.
export function reaisCurto(v, comSinal = false) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `R$ ${nf2.format(a / 1e6)} mi` : a >= 1e3 ? `R$ ${nf0.format(a / 1e3)} mil` : `R$ ${nf0.format(a)}`;
  return (v < 0 ? '−' : comSinal && v > 0 ? '+' : '') + s;
}
export function percentual(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  if (Math.abs(v) >= 999.5) return `${v > 0 ? '>+' : '<−'}999%`;
  return `${sinal(Math.round(v * 10) / 10)}${nf1.format(Math.abs(v))}%`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (m) => (m ? `${MESES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}` : '–');

// ─── Mapa de calor ───────────────────────────────────────────────────────────────────────────────
// Verde = melhor que o previsto, vermelho = pior. Intensidade: no modo %, |desvio %| até 100% (sem projetado =
// intensidade cheia); no modo R$, |desvio| sobre o maior |desvio| das células da matriz. Raiz quadrada para os
// desvios pequenos não sumirem no branco.
const BASE = [250, 251, 251];
const BOM = [17, 128, 74];
const RUIM = [200, 46, 46];
export function intensidade(x, modo, maiorAbs) {
  const d = desvio(x);
  if (Math.abs(d) < 0.5) return 0;
  if (modo === 'pct') {
    const v = desvioPct(x);
    return Math.sqrt(v === null ? 1 : Math.min(Math.abs(v) / 100, 1));
  }
  return maiorAbs ? Math.sqrt(Math.min(Math.abs(d) / maiorAbs, 1)) : 0;
}
export function corCalor(x, modo, maiorAbs) {
  const t = intensidade(x, modo, maiorAbs);
  if (!t) return null;
  const alvo = desvio(x) > 0 ? BOM : RUIM;
  const k = 0.1 + 0.9 * t;
  const [r, g, b] = BASE.map((c, i) => Math.round(c + (alvo[i] - c) * k));
  return { fundo: `rgb(${r}, ${g}, ${b})`, texto: k > 0.55 ? '#ffffff' : '#13202a', forte: k > 0.55 };
}

// ─── Matriz ──────────────────────────────────────────────────────────────────────────────────────
const novo = () => ({ r: 0, p: 0, itens: [] });
function somar(alvo, item) {
  alvo.r += item[2];
  alvo.p += item[3];
  alvo.itens.push(item);
}
const porOrdem = (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR');

export function montarMatriz(d) {
  if (!d) return null;
  const usuarios = new Map((d.usuarios || []).map((u) => [u.id, u]));
  const pilares = new Map((d.pilares || []).map((p) => [p.id, p]));
  const pacotes = new Map((d.pacotes || []).map((p) => [p.id, p]));
  const centros = new Map((d.centros || []).map((c) => [c.id, c]));
  const naturezas = new Map((d.naturezas || []).map((n) => [n.id, n]));

  // Coluna / linha da máscara (ou "Sem pilar" / "Sem pacote"), com o responsável dela.
  const eixo = (mapa, id, semNome) => {
    const m = mapa.get(id);
    return { key: m ? m.id : SEM, nome: m ? m.descricao : semNome, ordem: m ? m.sequencia : SEM_ORDEM, resp: (m && usuarios.get(m.responsavel_id)) || null, total: novo() };
  };
  const colunas = new Map();
  const linhas = new Map();
  const celulas = new Map(); // 'linha|coluna'
  const total = novo();

  (d.valores || []).forEach((item) => {
    const [centroId, naturezaId] = item;
    const pilarId = pilares.has(centros.get(centroId)?.pilar_id) ? centros.get(centroId).pilar_id : SEM;
    const pacoteId = pacotes.has(naturezas.get(naturezaId)?.pacote_id) ? naturezas.get(naturezaId).pacote_id : SEM;
    if (!colunas.has(pilarId)) colunas.set(pilarId, eixo(pilares, pilarId, 'Sem pilar'));
    if (!linhas.has(pacoteId)) linhas.set(pacoteId, eixo(pacotes, pacoteId, 'Sem pacote'));
    const k = `${pacoteId}|${pilarId}`;
    if (!celulas.has(k)) celulas.set(k, novo());
    somar(celulas.get(k), item);
    somar(colunas.get(pilarId).total, item);
    somar(linhas.get(pacoteId).total, item);
    somar(total, item);
  });

  const listaColunas = [...colunas.values()].sort(porOrdem);
  const listaLinhas = [...linhas.values()].sort(porOrdem);

  // Maior |desvio| entre as células (escala do modo R$; os totais não entram para não apagar o resto) e a pior
  // combinação Pacote × Pilar (indicador do topo).
  let maiorAbs = 0;
  let pior = null;
  celulas.forEach((x, k) => {
    const d0 = desvio(x);
    maiorAbs = Math.max(maiorAbs, Math.abs(d0));
    if (d0 < -0.5 && (!pior || d0 < desvio(pior.x))) {
      const [kl, kc] = k.split('|').map(Number);
      pior = { x, linha: linhas.get(kl), coluna: colunas.get(kc) };
    }
  });

  return {
    colunas: listaColunas,
    linhas: listaLinhas,
    celula: (kl, kc) => celulas.get(`${kl}|${kc}`) || null,
    total,
    maiorAbs,
    pior,
    centros,
    naturezas,
    semCadastro: {
      pilar: colunas.has(SEM),
      pacote: linhas.has(SEM),
      responsavel: [...listaColunas, ...listaLinhas].some((x) => x.key !== SEM && !x.resp),
    },
  };
}

// Detalhamento (clique numa célula, linha, coluna ou total): os pares centro × natureza que compõem o valor,
// do pior desvio para o melhor.
export function detalhar(M, itens) {
  return itens
    .map(([c, n, r, p]) => {
      const centro = M.centros.get(c) || {};
      const natureza = M.naturezas.get(n) || {};
      return {
        chave: `${c}|${n}`,
        centro: centro.apelido || centro.nome || `Centro ${c}`,
        centroId: c,
        natureza: natureza.nome || `Natureza ${n}`,
        codigo: natureza.codigo || String(n),
        r,
        p,
      };
    })
    .sort((a, b) => a.r - a.p - (b.r - b.p));
}
