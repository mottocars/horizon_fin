const env = require('../../../config/env');
const service = require('../../formularios/formularios.service');
const { z, falha, r2 } = require('../dfc/tools/comum');

// Base do módulo FORMULÁRIOS do conector Horizon (Cadastros › Formulários): carrega os formulários da
// empresa do conector e as respostas pelos MESMOS serviços da tela (formularios.service.js — inclusive o
// anonimato: pesquisa privada anônima não devolve nome nem horário, só o dia) e traduz cada resposta para
// texto (o "textoResposta" e o resumo da aba Respostas: frontend/src/pages/Formularios/tipos.js e
// RespostasFormulario.jsx — se a regra mudar lá, mude aqui também).

const MODALIDADE = {
  PUBLICO: 'Pública (link, sem login)',
  PRIVADO: 'Privada (janela ao entrar no sistema; dá para responder depois)',
  PRIVADO_OBRIGATORIO: 'Privada obrigatória (janela ao entrar; só navega depois de responder)',
};
const STATUS = { RASCUNHO: 'Rascunho', PUBLICADO: 'Publicado', ENCERRADO: 'Encerrado' };
const TIPO = {
  TEXTO_CURTO: 'Resposta curta',
  TEXTO_LONGO: 'Parágrafo',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone (com DDD)',
  MULTIPLA_ESCOLHA: 'Múltipla escolha',
  CAIXAS_SELECAO: 'Caixas de seleção',
  LISTA: 'Lista suspensa',
  ESCALA_LINEAR: 'Escala linear',
  AVALIACAO: 'Avaliação (estrelas)',
  DATA: 'Data',
  NUMERO: 'Número',
  SECAO: 'Título e descrição (seção, sem resposta)',
};

const br = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);
const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null);
const diaDe = (v) => (v ? new Date(v).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : null);
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pct = (n, total) => (total ? r2((n / total) * 100) : 0);
const linkPublico = (token) => `${String(env.frontendUrl).replace(/\/$/, '')}/f/${token}`;
const anonimoDe = (f) => f.anonimo && f.modalidade !== 'PUBLICO';
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

const listar = (empresaId, filtros = {}) => service.listar(empresaId, filtros);

// Formulário por id ou título (exato ou parte, sem acento).
async function resolverFormulario(empresaId, termo) {
  const t = String(termo ?? '').trim();
  if (!t) throw falha('Informe o formulário (id ou título). Use formularios_lista para ver os da empresa.');
  const lista = await listar(empresaId);
  if (/^\d+$/.test(t)) {
    const f = lista.find((x) => x.id === Number(t));
    if (!f) throw falha(`Formulário ${t} não encontrado nesta empresa. Use formularios_lista.`);
    return f;
  }
  const alvo = semAcento(t);
  const exatos = lista.filter((f) => semAcento(f.titulo) === alvo);
  if (exatos.length === 1) return exatos[0];
  const achados = lista.filter((f) => semAcento(f.titulo).includes(alvo));
  if (!achados.length) throw falha(`Nenhum formulário com "${t}" no título. Use formularios_lista.`);
  if (achados.length > 1) throw falha(`"${t}" corresponde a vários formulários: ${achados.map((f) => `${f.id} ${f.titulo}`).join('; ')}. Use o id.`);
  return achados[0];
}

// Formulário completo + respostas + público-alvo (privados), pelo serviço da tela.
const resultados = (empresaId, id) => service.resultados(empresaId, id);

// Texto de uma resposta (igual à tela e ao Excel).
function textoResposta(p, v) {
  if (v === null || v === undefined || v === '') return null;
  const opcao = (id) => (p.opcoes || []).find((o) => o.id === id)?.texto ?? '(opção removida)';
  switch (p.tipo) {
    case 'MULTIPLA_ESCOLHA':
    case 'LISTA':
      return v.outro ? `Outro: ${v.outro}` : opcao(v.opcao);
    case 'CAIXAS_SELECAO':
      return [...(v.opcoes || []).map(opcao), ...(v.outro ? [`Outro: ${v.outro}`] : [])].join('; ');
    case 'DATA':
      return br(v);
    case 'ESCALA_LINEAR':
      return `${v} (de ${p.escala?.min ?? 1} a ${p.escala?.max ?? 5})`;
    case 'AVALIACAO':
      return `${v} de ${p.escala?.max ?? 5} estrelas`;
    default:
      return String(v);
  }
}

const perguntasRespondiveis = (f) => (f.perguntas || []).filter((p) => p.tipo !== 'SECAO');

// Seções em que cada pergunta está (o título da última SECAO antes dela).
function secoes(f) {
  const mapa = new Map();
  let atual = null;
  for (const p of f.perguntas || []) {
    if (p.tipo === 'SECAO') atual = p.titulo || 'Seção sem título';
    else mapa.set(p.id, atual);
  }
  return mapa;
}

// Uma resposta enviada em formato legível.
function respostaLegivel(f, r, { soPergunta } = {}) {
  const anonimo = anonimoDe(f);
  const perguntas = perguntasRespondiveis(f).filter((p) => !soPergunta || p.id === soPergunta.id);
  return {
    resposta_id: r.id,
    // Anônimo: o serviço já manda só o dia (AAAA-MM-DD, no horário de Brasília).
    enviado: anonimo ? br(String(r.enviado_dia).slice(0, 10)) : quando(r.enviado_em),
    respondente: anonimo ? 'Anônimo' : r.usuario_nome || (r.origem === 'PUBLICO' ? 'Link público (sem identificação)' : 'Usuário removido'),
    origem: r.origem === 'PUBLICO' ? 'Link público' : 'Dentro do sistema',
    respostas: perguntas.map((p) => ({ pergunta: p.titulo || 'Pergunta sem título', resposta: textoResposta(p, r.respostas?.[p.id]) ?? '(sem resposta)' })),
  };
}

// Resumo de uma pergunta (a aba Respostas › Resumo): contagem por opção com %, média, NPS, número etc.
function resumoPergunta(p, respostas) {
  const valores = respostas.map((r) => r.respostas?.[p.id]).filter((v) => v !== undefined && v !== null && v !== '');
  const total = valores.length;
  const base = { pergunta: p.titulo || 'Pergunta sem título', tipo: TIPO[p.tipo] || p.tipo, obrigatoria: !!p.obrigatoria, responderam: total, de: respostas.length };
  if (!total) return { ...base, observacao: 'Ninguém respondeu esta pergunta.' };
  if (['MULTIPLA_ESCOLHA', 'LISTA', 'CAIXAS_SELECAO'].includes(p.tipo)) {
    const contagem = new Map((p.opcoes || []).map((o) => [o.id, 0]));
    const outros = [];
    valores.forEach((v) => {
      const ids = p.tipo === 'CAIXAS_SELECAO' ? v.opcoes || [] : v.opcao ? [v.opcao] : [];
      ids.forEach((id) => contagem.set(id, (contagem.get(id) || 0) + 1));
      if (v.outro) outros.push(v.outro);
    });
    const opcoes = [...contagem.entries()].map(([id, n]) => ({
      opcao: (p.opcoes || []).find((o) => o.id === id)?.texto || '(opção removida)',
      respostas: n,
      percentual: pct(n, total),
    }));
    if (outros.length || p.outro) opcoes.push({ opcao: 'Outro', respostas: outros.length, percentual: pct(outros.length, total) });
    return {
      ...base,
      ...(p.tipo === 'CAIXAS_SELECAO' ? { observacao: 'Cada pessoa pode marcar mais de uma opção — o % é sobre quem respondeu.' } : {}),
      opcoes,
      ...(outros.length ? { textos_em_outro: outros } : {}),
    };
  }
  if (p.tipo === 'ESCALA_LINEAR' || p.tipo === 'AVALIACAO') {
    const { min = 1, max = 5, rotulo_min: a, rotulo_max: b } = p.escala || {};
    const media = valores.reduce((s, v) => s + Number(v), 0) / total;
    const distribuicao = [];
    for (let n = min; n <= max; n += 1) {
      const qtd = valores.filter((v) => Number(v) === n).length;
      distribuicao.push({ valor: n, rotulo: n === min ? a || undefined : n === max ? b || undefined : undefined, respostas: qtd, percentual: pct(qtd, total) });
    }
    const out = { ...base, escala: `${min} a ${max}${p.tipo === 'AVALIACAO' ? ' estrelas' : ''}`, media: r2(media), distribuicao };
    if (p.tipo === 'ESCALA_LINEAR' && min === 0 && max === 10) {
      const prom = valores.filter((v) => v >= 9).length;
      const detr = valores.filter((v) => v <= 6).length;
      out.nps = {
        nps: Math.round(((prom - detr) / total) * 100),
        promotores_9_10: { respostas: prom, percentual: pct(prom, total) },
        neutros_7_8: { respostas: total - prom - detr, percentual: pct(total - prom - detr, total) },
        detratores_0_6: { respostas: detr, percentual: pct(detr, total) },
        regra: 'NPS = % de promotores (9–10) − % de detratores (0–6).',
      };
    }
    return out;
  }
  if (p.tipo === 'NUMERO') {
    const ns = valores.map(Number);
    const soma = ns.reduce((s, n) => s + n, 0);
    return { ...base, media: r2(soma / ns.length), minimo: Math.min(...ns), maximo: Math.max(...ns), soma: r2(soma) };
  }
  if (p.tipo === 'DATA') {
    const cont = new Map();
    valores.forEach((v) => cont.set(v, (cont.get(v) || 0) + 1));
    return { ...base, datas: [...cont.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([d, n]) => ({ data: br(d), respostas: n })) };
  }
  return { ...base, respostas_em_texto: valores.map(String) };
}

module.exports = {
  z,
  falha,
  r2,
  MODALIDADE,
  STATUS,
  TIPO,
  br,
  quando,
  diaDe,
  pct,
  dataSchema,
  linkPublico,
  anonimoDe,
  listar,
  resolverFormulario,
  resultados,
  textoResposta,
  perguntasRespondiveis,
  secoes,
  respostaLegivel,
  resumoPergunta,
};
