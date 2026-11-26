// Modelo da Gestão Matricial (dashboard Econômico Financeiro): monta a matriz Pacote × Pilar a partir dos valores
// por centro × natureza da rota /dashboards/economico-financeiro/gestao-matricial (backend
// dashboards/gestaoMatricial.service.js).
// - Coluna = Pilar + responsável do CENTRO de custo (um pilar com vários responsáveis vira várias colunas, lado a
//   lado; o pilar pode ser recolhido numa coluna só). Linha = Pacote + responsável da NATUREZA.
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
const porNome = (a, b) => (a.resp ? a.resp.nome : '￿').localeCompare(b.resp ? b.resp.nome : '￿', 'pt-BR');

export function montarMatriz(d) {
  if (!d) return null;
  const usuarios = new Map((d.usuarios || []).map((u) => [u.id, u]));
  const pilares = new Map((d.pilares || []).map((p) => [p.id, p]));
  const pacotes = new Map((d.pacotes || []).map((p) => [p.id, p]));
  const centros = new Map((d.centros || []).map((c) => [c.id, c]));
  const naturezas = new Map((d.naturezas || []).map((n) => [n.id, n]));

  const colunas = new Map();
  const linhas = new Map();
  const celulas = new Map(); // 'linha|coluna' e 'linha|g:pilar' (pilar recolhido)
  const grupos = new Map(); // pilar -> { id, descricao, ordem, colunas, total }
  const total = novo();

  (d.valores || []).forEach((item) => {
    const [centroId, naturezaId] = item;
    const c = centros.get(centroId) || {};
    const n = naturezas.get(naturezaId) || {};
    const pilarId = pilares.has(c.pilar_id) ? c.pilar_id : SEM;
    const pacoteId = pacotes.has(n.pacote_id) ? n.pacote_id : SEM;
    const respC = usuarios.get(c.responsavel_id) || null;
    const respN = usuarios.get(n.responsavel_id) || null;
    const kc = `${pilarId}:${respC ? respC.id : SEM}`;
    const kl = `${pacoteId}:${respN ? respN.id : SEM}`;

    if (!grupos.has(pilarId)) {
      const p = pilares.get(pilarId);
      grupos.set(pilarId, { id: pilarId, descricao: p ? p.descricao : 'Sem pilar', ordem: p ? p.sequencia : SEM_ORDEM, colunas: [], total: novo() });
    }
    const grupo = grupos.get(pilarId);
    if (!colunas.has(kc)) {
      const col = { key: kc, pilarId, pilar: grupo.descricao, resp: respC, total: novo() };
      colunas.set(kc, col);
      grupo.colunas.push(col);
    }
    if (!linhas.has(kl)) {
      const p = pacotes.get(pacoteId);
      linhas.set(kl, { key: kl, pacoteId, pacote: p ? p.descricao : 'Sem pacote', ordem: p ? p.sequencia : SEM_ORDEM, resp: respN, total: novo() });
    }
    const linha = linhas.get(kl);
    [`${kl}|${kc}`, `${kl}|g:${pilarId}`].forEach((k) => {
      if (!celulas.has(k)) celulas.set(k, novo());
      somar(celulas.get(k), item);
    });
    somar(colunas.get(kc).total, item);
    somar(grupo.total, item);
    somar(linha.total, item);
    somar(total, item);
  });

  const listaGrupos = [...grupos.values()].sort((a, b) => a.ordem - b.ordem || a.descricao.localeCompare(b.descricao, 'pt-BR'));
  listaGrupos.forEach((g) => g.colunas.sort(porNome));
  const listaLinhas = [...linhas.values()].sort((a, b) => a.ordem - b.ordem || a.pacote.localeCompare(b.pacote, 'pt-BR') || porNome(a, b));

  // Maior |desvio| entre as células (escala do modo R$; os totais não entram para não apagar o resto).
  let maiorAbs = 0;
  let maiorAbsGrupo = 0;
  celulas.forEach((x, k) => {
    const a = Math.abs(desvio(x));
    if (k.includes('|g:')) maiorAbsGrupo = Math.max(maiorAbsGrupo, a);
    else maiorAbs = Math.max(maiorAbs, a);
  });

  // Pior e melhor combinação Pacote × Pilar (colunas abertas).
  let pior = null;
  let melhor = null;
  celulas.forEach((x, k) => {
    if (k.includes('|g:')) return;
    const [kl, kc] = k.split('|');
    const d0 = desvio(x);
    if (d0 < -0.5 && (!pior || d0 < desvio(pior.x))) pior = { x, linha: linhas.get(kl), coluna: colunas.get(kc) };
    if (d0 > 0.5 && (!melhor || d0 > desvio(melhor.x))) melhor = { x, linha: linhas.get(kl), coluna: colunas.get(kc) };
  });

  return {
    grupos: listaGrupos,
    linhas: listaLinhas,
    celula: (kl, kc) => celulas.get(`${kl}|${kc}`) || null,
    celulaGrupo: (kl, pilarId) => celulas.get(`${kl}|g:${pilarId}`) || null,
    total,
    maiorAbs,
    maiorAbsGrupo,
    pior,
    melhor,
    centros,
    naturezas,
    semCadastro: {
      pilar: listaGrupos.some((g) => g.id === SEM),
      pacote: listaLinhas.some((l) => l.pacoteId === SEM),
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
