const exportacao = require('../../../dfc-exportacao/exportacao.service');
const { z, mesSchema, falha, r2, ferramenta, resolverCentros, resolverNatureza } = require('./comum');

// As bases do Realizado e do Projetado (as mesmas abas do Excel da aba DFC): filtrar, buscar e
// agrupar lançamentos/itens — rankings de fornecedores, por centro, por natureza, por fonte etc.

const AGRUPAMENTOS = ['mes', 'centro', 'mascara_1', 'mascara_2', 'natureza', 'favorecido', 'fonte', 'origem', 'entrada_saida'];
const campoGrupo = (base, g) =>
  ({
    mes: (l) => l.mes,
    centro: (l) => l.centro,
    mascara_1: (l) => l.mascara_n1,
    mascara_2: (l) => l.mascara_n2,
    natureza: (l) => `${l.natureza_codigo} ${l.natureza}`,
    favorecido: (l) => (base === 'realizado' ? l.favorecido : l.descricao) || '(sem nome)',
    fonte: (l) => (base === 'realizado' ? l.origem : l.fonte),
    origem: (l) => l.origem,
    entrada_saida: (l) => l.lado,
  })[g];

module.exports = {
  name: 'dfc_lancamentos',
  description:
    'Base empilhada do DFC (uma linha por lançamento do extrato no realizado, ou por item que compõe o projetado: parcela do ' +
    'Aging, linha do Orçamento Empresarial, valor informado, Projeção CEF), já classificada por centro, máscaras, entrada/saída e ' +
    'natureza — só o que entra no fluxo. Filtre por período, centros, natureza e texto (favorecido, documento, título); agrupe ' +
    'para rankings e totais (ex.: maiores fornecedores do mês, saídas por centro, projetado por fonte).',
  inputSchema: {
    base: z.enum(['realizado', 'projetado']),
    inicio: mesSchema.describe('Mês inicial (AAAA-MM).'),
    fim: mesSchema.describe('Mês final (AAAA-MM).'),
    centros: z.array(z.union([z.string(), z.number()])).optional().describe('Centros de custo (ids ou nomes). Vazio = todos.'),
    natureza: z.union([z.string(), z.number()]).optional().describe('Natureza (id, código ou nome).'),
    texto: z.string().optional().describe('Busca em favorecido/credor/cliente, documento, título, fonte e centro.'),
    entrada_saida: z.enum(['entradas', 'saidas', 'ambos']).default('ambos'),
    agrupar_por: z.enum(AGRUPAMENTOS).optional().describe('Agrupa e soma (ranking pelo valor absoluto).'),
    limite: z.number().int().min(1).max(500).default(100).describe('Máximo de linhas/grupos devolvidos.'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const { base, inicio, fim, centros, natureza, texto, entrada_saida: es = 'ambos', agrupar_por: grupo, limite = 100 } = a;
    if (fim < inicio) throw falha('O mês final precisa ser igual ou depois do inicial.');
    const ids = await resolverCentros(empresaId, centros);
    const nat = natureza !== undefined && natureza !== '' ? await resolverNatureza(empresaId, natureza) : null;
    const dados = await exportacao.bases(empresaId, { inicio, fim, centros: ids });
    let linhas = base === 'realizado' ? dados.realizado : dados.projetado;
    if (nat) linhas = linhas.filter((l) => l.natureza_id === nat.sienge_id);
    if (es !== 'ambos') linhas = linhas.filter((l) => l.lado === (es === 'entradas' ? 'Entrada' : 'Saída'));
    if (texto) {
      const t = texto.toLowerCase();
      const campos = ['favorecido', 'descricao', 'documento', 'titulo', 'referencia', 'fonte', 'centro', 'conta_bancaria', 'empresa'];
      linhas = linhas.filter((l) => campos.some((c) => String(l[c] || '').toLowerCase().includes(t)));
    }
    const total = r2(linhas.reduce((s, l) => s + l.valor, 0));
    const cabecalho = { base, periodo: { inicio, fim }, linhas_encontradas: linhas.length, total };
    if (grupo) {
      const f = campoGrupo(base, grupo);
      const mapa = new Map();
      linhas.forEach((l) => {
        const k = f(l) ?? '(vazio)';
        const g = mapa.get(k) || { grupo: k, valor: 0, linhas: 0 };
        g.valor += l.valor;
        g.linhas += 1;
        mapa.set(k, g);
      });
      const grupos = [...mapa.values()]
        .map((g) => ({ ...g, valor: r2(g.valor) }))
        .sort((x, y) => (grupo === 'mes' ? x.grupo.localeCompare(y.grupo) : Math.abs(y.valor) - Math.abs(x.valor)));
      return { ...cabecalho, agrupado_por: grupo, grupos: grupos.slice(0, limite), ...(grupos.length > limite ? { grupos_omitidos: grupos.length - limite } : {}) };
    }
    const ordenadas = [...linhas].sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor)).slice(0, limite);
    const limpa = (l) =>
      Object.fromEntries(
        Object.entries(l)
          .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !['n1', 'n2', 'origem_id', 'dossie', 'ajuste'].includes(k))
          .map(([k, v]) => [k, typeof v === 'number' && k !== 'natureza_id' && k !== 'id_sienge' ? r2(v) : v])
      );
    return { ...cabecalho, ordenado_por: 'maior valor absoluto', linhas: ordenadas.map(limpa), ...(linhas.length > limite ? { linhas_omitidas: linhas.length - limite } : {}) };
  }),
};
