import {
  AlignLeft,
  CalendarDays,
  CircleDot,
  Hash,
  Heading,
  Mail,
  Phone,
  ListChecks,
  Minus,
  SlidersHorizontal,
  SquareChevronDown,
  Star,
  Globe,
  Lock,
  ShieldAlert,
} from 'lucide-react';

// Tipos de pergunta do construtor (os mesmos de backend/src/modules/formularios/formularios.service.js).
export const TIPOS_PERGUNTA = [
  { id: 'TEXTO_CURTO', rotulo: 'Resposta curta', icone: Minus, grupo: 'Texto' },
  { id: 'TEXTO_LONGO', rotulo: 'Parágrafo', icone: AlignLeft, grupo: 'Texto' },
  { id: 'EMAIL', rotulo: 'E-mail', icone: Mail, grupo: 'Contato' },
  { id: 'TELEFONE', rotulo: 'Telefone (com DDD)', icone: Phone, grupo: 'Contato' },
  { id: 'MULTIPLA_ESCOLHA', rotulo: 'Múltipla escolha', icone: CircleDot, grupo: 'Escolha' },
  { id: 'CAIXAS_SELECAO', rotulo: 'Caixas de seleção', icone: ListChecks, grupo: 'Escolha' },
  { id: 'LISTA', rotulo: 'Lista suspensa', icone: SquareChevronDown, grupo: 'Escolha' },
  { id: 'ESCALA_LINEAR', rotulo: 'Escala linear', icone: SlidersHorizontal, grupo: 'Avaliação' },
  { id: 'AVALIACAO', rotulo: 'Avaliação (estrelas)', icone: Star, grupo: 'Avaliação' },
  { id: 'DATA', rotulo: 'Data', icone: CalendarDays, grupo: 'Outros' },
  { id: 'NUMERO', rotulo: 'Número', icone: Hash, grupo: 'Outros' },
  { id: 'SECAO', rotulo: 'Título e descrição', icone: Heading, grupo: 'Outros' },
];
export const TIPO = Object.fromEntries(TIPOS_PERGUNTA.map((t) => [t.id, t]));
export const TIPOS_COM_OPCOES = ['MULTIPLA_ESCOLHA', 'CAIXAS_SELECAO', 'LISTA'];

export const MODALIDADES = {
  PUBLICO: {
    rotulo: 'Pública',
    icone: Globe,
    cor: 'bg-sky-50 text-sky-700',
    texto: 'Qualquer pessoa com o link responde, sem entrar no sistema.',
  },
  PRIVADO: {
    rotulo: 'Privada',
    icone: Lock,
    cor: 'bg-violet-50 text-violet-700',
    texto: 'Abre numa janela quando o usuário entra no sistema. Ele pode fechar, e a janela volta a cada entrada até ele responder.',
  },
  PRIVADO_OBRIGATORIO: {
    rotulo: 'Privada obrigatória',
    icone: ShieldAlert,
    cor: 'bg-rose-50 text-rose-700',
    texto: 'Abre numa janela quando o usuário entra no sistema e não fecha: ele só continua navegando depois de responder.',
  },
};

export const STATUS = {
  RASCUNHO: { rotulo: 'Rascunho', cor: 'bg-gray-100 text-gray-600', ponto: 'bg-gray-400' },
  PUBLICADO: { rotulo: 'Publicado', cor: 'bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  ENCERRADO: { rotulo: 'Encerrado', cor: 'bg-amber-50 text-amber-700', ponto: 'bg-amber-500' },
};

export const CORES_TEMA = ['#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569', '#0f172a'];

export function novoId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

// Pergunta nova de um tipo (o "+" do construtor).
export function novaPergunta(tipo = 'MULTIPLA_ESCOLHA') {
  const p = { id: novoId(), tipo, titulo: '', descricao: '', obrigatoria: false };
  if (TIPOS_COM_OPCOES.includes(tipo)) {
    p.opcoes = [{ id: novoId(), texto: 'Opção 1' }];
    p.outro = false;
  }
  if (tipo === 'ESCALA_LINEAR') p.escala = { min: 1, max: 5, rotulo_min: '', rotulo_max: '' };
  if (tipo === 'AVALIACAO') p.escala = { min: 1, max: 5, rotulo_min: '', rotulo_max: '' };
  return p;
}

// Troca o tipo aproveitando o que dá (enunciado, opções entre tipos de escolha).
export function trocarTipo(p, tipo) {
  const base = novaPergunta(tipo);
  const proxima = { ...base, id: p.id, titulo: p.titulo, descricao: p.descricao, obrigatoria: tipo === 'SECAO' ? false : p.obrigatoria };
  if (TIPOS_COM_OPCOES.includes(tipo) && TIPOS_COM_OPCOES.includes(p.tipo)) {
    proxima.opcoes = p.opcoes;
    proxima.outro = tipo !== 'LISTA' && p.outro;
  }
  if ((tipo === 'ESCALA_LINEAR' || tipo === 'AVALIACAO') && p.escala && p.tipo === tipo) proxima.escala = p.escala;
  return proxima;
}

// ---- E-mail e telefone (mesmas regras do backend, formularios.service.js) ----
const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const emailValido = (v) => {
  const e = String(v || '').trim();
  return e.length <= 254 && RE_EMAIL.test(e) && !e.includes('..');
};

// Máscara enquanto digita: (11) 9876-5432 → ao chegar no 11º dígito vira (11) 98765-4321.
export function mascaraTelefone(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// DDD válido (11–99) + 8 dígitos (fixo) ou 9 dígitos começando com 9 (celular).
export function telefoneValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!/^[1-9][1-9]/.test(d)) return false;
  return d.length === 10 || (d.length === 11 && d[2] === '9');
}

// Mensagem de formato inválido de uma resposta preenchida (null = ok ou vazia).
export function erroFormato(p, v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (p.tipo === 'EMAIL' && !emailValido(v)) return 'Informe um e-mail válido (ex.: nome@empresa.com.br).';
  if (p.tipo === 'TELEFONE' && !telefoneValido(v)) {
    const d = String(v).replace(/\D/g, '');
    if (d.length < 10) return 'Informe o telefone completo, com DDD (ex.: (11) 98765-4321).';
    if (d.length === 11 && d[2] !== '9') return 'Celular com 9 dígitos começa com 9 (ex.: (11) 98765-4321).';
    return 'DDD inválido.';
  }
  return null;
}

export function mensagemErro(e, padrao) {
  return e?.response?.data?.message || padrao;
}

export const dataBr = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function dataHoraBr(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Cor do tema com transparência (fundo do construtor / da página de resposta).
export function corAlpha(hex, alpha) {
  const h = (hex || '#2563eb').replace('#', '');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Texto da resposta de uma pergunta (resultados, Excel).
export function textoResposta(p, v) {
  if (v === null || v === undefined || v === '') return '';
  const opcao = (id) => (p.opcoes || []).find((o) => o.id === id)?.texto ?? '(opção removida)';
  switch (p.tipo) {
    case 'MULTIPLA_ESCOLHA':
    case 'LISTA':
      return v.outro ? `Outro: ${v.outro}` : opcao(v.opcao);
    case 'CAIXAS_SELECAO':
      return [...(v.opcoes || []).map(opcao), ...(v.outro ? [`Outro: ${v.outro}`] : [])].join('; ');
    case 'DATA':
      return dataBr(v);
    case 'NUMERO':
      return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
    default:
      return String(v);
  }
}
