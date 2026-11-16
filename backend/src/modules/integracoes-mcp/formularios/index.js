const { ferramenta } = require('../dfc/tools/comum');
const {
  z,
  falha,
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
} = require('./base');

// Ferramentas do módulo FORMULÁRIOS do conector Horizon (só leitura), fechadas sobre a empresa do
// conector: os formulários de pesquisa de Cadastros › Formulários e TODAS as respostas recebidas, com
// as mesmas regras da tela (anonimato, público-alvo, resumo da aba Respostas).

const periodo = (f) => (f.inicio_em || f.fim_em ? `${f.inicio_em ? br(f.inicio_em) : '…'} a ${f.fim_em ? br(f.fim_em) : '…'}` : 'sem prazo');

function linhaLista(f) {
  const privado = f.modalidade !== 'PUBLICO';
  return {
    id: f.id,
    titulo: f.titulo,
    modalidade: MODALIDADE[f.modalidade],
    situacao: STATUS[f.status],
    perguntas: f.qtd_perguntas,
    respostas: f.qtd_respostas,
    ...(privado ? { publico_alvo: f.qtd_destinatarios ?? 0, adesao_percentual: pct(f.qtd_respostas, f.qtd_destinatarios || 0) } : {}),
    periodo_de_respostas: periodo(f),
    ultima_resposta: quando(f.ultima_resposta),
    ...(f.modalidade === 'PUBLICO' ? { link_publico: linkPublico(f.token_publico) } : {}),
  };
}

const guia = {
  name: 'formularios_guia',
  description:
    'Comece por aqui. Explica os formulários de pesquisa do Horizon (Cadastros › Formulários) e lista os desta empresa ao vivo: as três modalidades (Pública por link, ' +
    'Privada com janela ao entrar no sistema, Privada obrigatória), as situações (Rascunho, Publicado, Encerrado), o público-alvo e a adesão, o anonimato, o período de ' +
    'respostas, os tipos de pergunta e como cada resposta é registrada, e qual ferramenta usar para cada pergunta.',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const lista = await listar(empresaId);
    const total = lista.reduce((s, f) => s + f.qtd_respostas, 0);
    return [
      '# Formulários de pesquisa (Cadastros › Formulários)',
      '',
      `Esta empresa tem ${lista.length} formulário(s) e ${total} resposta(s) recebidas no total.`,
      '',
      '## Regras',
      '- Cada formulário é de UMA empresa (a do conector). Só leitura por aqui: criar, editar e publicar é na tela.',
      '- **Modalidades:** Pública = qualquer pessoa com o link responde, sem login (pode limitar a uma resposta por navegador). Privada = abre numa janela quando o usuário ' +
        'entra no sistema; ele pode fechar ("Responder depois") e a janela volta a cada entrada até responder. Privada obrigatória = a janela não fecha: o usuário só navega depois de responder.',
      '- **Situação:** Rascunho (ninguém vê), Publicado (aceita respostas dentro do período, se houver), Encerrado (não aceita mais; o link avisa que fechou).',
      '- **Público-alvo (privadas):** "Todos os usuários da empresa" = usuários ativos vinculados à empresa (Master sem vínculo fica de fora) ou "Usuários escolhidos". ' +
        'Cada usuário responde uma vez. Adesão = quem respondeu ÷ público-alvo.',
      '- **Anonimato (privadas):** com "Anônima", as respostas não trazem nome nem horário (só o dia) — e por aqui também não. A lista de quem já respondeu continua visível.',
      '- **Respostas públicas** não têm identificação de quem respondeu (a não ser que o próprio formulário pergunte nome/e-mail).',
      '- **Tipos de pergunta e o registro:** resposta curta/parágrafo (texto), E-mail (validado, minúsculo), Telefone com DDD ((11) 98765-4321), múltipla escolha e lista (uma opção ou "Outro: texto"), ' +
        'caixas de seleção (várias opções + "Outro"), escala linear (número na faixa; 0 a 10 vira NPS), avaliação em estrelas, data, número. "Título e descrição" é só uma seção (sem resposta).',
      '',
      '## Qual ferramenta usar',
      '- Lista dos formulários com respostas, adesão e link: **formularios_lista**.',
      '- As perguntas e a configuração de um formulário: **formularios_formulario**.',
      '- TODAS as respostas (de um formulário ou de todos), legíveis, com filtros de período e texto: **formularios_respostas**.',
      '- Estatística por pergunta (contagem por opção, %, média, NPS, textos): **formularios_resumo**.',
      '- Quem do público-alvo já respondeu e quem falta (privadas): **formularios_publico_alvo**.',
      '',
      '## Formulários desta empresa',
      ...(lista.length
        ? lista.map((f) => `- [${f.id}] **${f.titulo}** — ${MODALIDADE[f.modalidade].split(' (')[0]}, ${STATUS[f.status]}, ${f.qtd_respostas} resposta(s)` +
            (f.modalidade !== 'PUBLICO' ? `, público-alvo ${f.qtd_destinatarios ?? 0}` : ''))
        : ['- Nenhum formulário cadastrado.']),
      '',
      'Datas DD/MM/AAAA (horário de Brasília). Responda citando o formulário e o número de respostas em que a conclusão se baseia.',
    ].join('\n');
  }),
};

const listaTool = {
  name: 'formularios_lista',
  description:
    'Os formulários da empresa (como a lista de Cadastros › Formulários): id, título, modalidade, situação, nº de perguntas e de respostas, público-alvo e adesão (privadas), período, ' +
    'última resposta e link público. Filtros: situação, modalidade e busca no título/descrição.',
  inputSchema: {
    situacao: z.enum(['RASCUNHO', 'PUBLICADO', 'ENCERRADO']).optional().describe('Só formulários nesta situação.'),
    modalidade: z.enum(['PUBLICO', 'PRIVADO', 'PRIVADO_OBRIGATORIO']).optional(),
    busca: z.string().max(200).optional().describe('Texto no título ou na descrição.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const lista = await listar(empresaId, { status: args.situacao, modalidade: args.modalidade, busca: args.busca });
    return { formularios: lista.map(linhaLista), total: lista.length };
  }),
};

const formularioTool = {
  name: 'formularios_formulario',
  description:
    'Um formulário completo: título, descrição, modalidade, situação, público-alvo, anonimato, período, link público, mensagem de confirmação e TODAS as perguntas na ordem ' +
    '(seção, tipo, obrigatória, opções, escala), com o nº de respostas. Use antes de interpretar as respostas.',
  inputSchema: { formulario: z.union([z.string(), z.number()]).describe('Id ou título (ou parte) do formulário.') },
  handler: ferramenta(async (empresaId, args) => {
    const item = await resolverFormulario(empresaId, args.formulario);
    const { formulario: f, destinatarios } = await resultados(empresaId, item.id);
    const secao = secoes(f);
    let n = 0;
    return {
      ...linhaLista(item),
      descricao: f.descricao || null,
      identificacao: f.modalidade === 'PUBLICO' ? 'Sem identificação (link público)' : f.anonimo ? 'Anônima (sem nome nem horário)' : 'Identificada',
      ...(f.modalidade !== 'PUBLICO'
        ? { publico_alvo_regra: f.publico_alvo === 'TODOS' ? 'Todos os usuários ativos da empresa' : 'Usuários escolhidos', publico_alvo: destinatarios?.length ?? 0 }
        : { uma_resposta_por_pessoa: f.uma_resposta_por_pessoa }),
      mensagem_de_confirmacao: f.mensagem_final || 'Sua resposta foi registrada. Obrigado por participar! (padrão)',
      publicado_em: quando(f.publicado_em),
      perguntas: (f.perguntas || []).map((p) => {
        if (p.tipo === 'SECAO') return { secao: p.titulo || 'Seção sem título', descricao: p.descricao || undefined };
        n += 1;
        return {
          numero: n,
          id: p.id,
          secao: secao.get(p.id) || undefined,
          pergunta: p.titulo || 'Pergunta sem título',
          descricao: p.descricao || undefined,
          tipo: TIPO[p.tipo] || p.tipo,
          obrigatoria: !!p.obrigatoria,
          opcoes: p.opcoes ? [...p.opcoes.map((o) => o.texto), ...(p.outro ? ['Outro (texto livre)'] : [])] : undefined,
          escala: p.escala ? `${p.escala.min} a ${p.escala.max}${p.escala.rotulo_min ? ` (${p.escala.min} = ${p.escala.rotulo_min}` : ''}${p.escala.rotulo_max ? `; ${p.escala.max} = ${p.escala.rotulo_max})` : p.escala.rotulo_min ? ')' : ''}` : undefined,
        };
      }),
    };
  }),
};

const respostasTool = {
  name: 'formularios_respostas',
  description:
    'TODAS as respostas recebidas, legíveis (pergunta → resposta em texto), com quem respondeu e quando (exceto pesquisas anônimas: sem nome e só o dia). Com formulario: as ' +
    'respostas dele (com pergunta: só a resposta daquela pergunta). Sem formulario: as respostas de TODOS os formulários da empresa, cada uma com o título. Filtros: de/ate ' +
    '(dia do envio), busca (texto em qualquer resposta ou no nome). Paginado: limite (padrão 200, máx. 1000) e pagina — a resposta diz se há próxima página.',
  inputSchema: {
    formulario: z.union([z.string(), z.number()]).optional().describe('Id ou título do formulário. Vazio = todos os formulários.'),
    pergunta: z.union([z.string(), z.number()]).optional().describe('Só esta pergunta (número na ordem, id ou parte do enunciado). Exige formulario.'),
    de: dataSchema.optional().describe('Enviadas a partir deste dia (AAAA-MM-DD).'),
    ate: dataSchema.optional().describe('Enviadas até este dia (AAAA-MM-DD).'),
    busca: z.string().max(200).optional().describe('Texto em qualquer resposta ou no nome de quem respondeu.'),
    limite: z.number().int().positive().max(1000).optional(),
    pagina: z.number().int().positive().optional(),
  },
  handler: ferramenta(async (empresaId, args) => {
    if (args.pergunta && !args.formulario) throw falha('Para filtrar por pergunta, informe também o formulário.');
    const alvos = args.formulario ? [await resolverFormulario(empresaId, args.formulario)] : (await listar(empresaId)).filter((f) => f.qtd_respostas > 0);
    const limite = args.limite || 200;
    const pagina = args.pagina || 1;
    const busca = String(args.busca || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const todas = [];
    for (const item of alvos) {
      const { formulario: f, respostas } = await resultados(empresaId, item.id);
      let soPergunta = null;
      if (args.pergunta) {
        const ps = perguntasRespondiveis(f);
        const t = String(args.pergunta).trim();
        soPergunta = /^\d+$/.test(t) && Number(t) <= ps.length ? ps[Number(t) - 1] : ps.find((p) => p.id === t) || ps.find((p) => (p.titulo || '').toLowerCase().includes(t.toLowerCase()));
        if (!soPergunta) throw falha(`Pergunta "${t}" não encontrada. Use formularios_formulario para ver as perguntas.`);
      }
      for (const r of respostas) {
        const dia = anonimoDe(f) ? String(r.enviado_dia).slice(0, 10) : diaDe(r.enviado_em);
        if (args.de && dia < args.de) continue;
        if (args.ate && dia > args.ate) continue;
        const legivel = respostaLegivel(f, r, { soPergunta });
        if (busca) {
          const texto = [legivel.respondente, ...legivel.respostas.map((x) => x.resposta)].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          if (!texto.includes(busca)) continue;
        }
        todas.push(alvos.length > 1 || !args.formulario ? { formulario: f.titulo, formulario_id: f.id, ...legivel } : legivel);
      }
    }
    const inicio = (pagina - 1) * limite;
    const pag = todas.slice(inicio, inicio + limite);
    return {
      ...(args.formulario ? { formulario: alvos[0].titulo, formulario_id: alvos[0].id } : { formularios_com_respostas: alvos.length }),
      total_de_respostas: todas.length,
      pagina,
      mostrando: pag.length,
      ...(inicio + limite < todas.length ? { proxima_pagina: pagina + 1 } : {}),
      respostas: pag,
    };
  }),
};

const resumoTool = {
  name: 'formularios_resumo',
  description:
    'Estatística de um formulário pergunta a pergunta (a aba Respostas › Resumo da tela): quantos responderam cada pergunta; nas de escolha, contagem e % por opção e os textos de ' +
    '"Outro"; nas escalas e estrelas, média e distribuição (escala de 0 a 10 também calcula o NPS); em número, média/mínimo/máximo/soma; em data, contagem por dia; nas de texto, ' +
    'todas as respostas escritas. Filtros de/ate (dia do envio).',
  inputSchema: {
    formulario: z.union([z.string(), z.number()]).describe('Id ou título do formulário.'),
    de: dataSchema.optional(),
    ate: dataSchema.optional(),
  },
  handler: ferramenta(async (empresaId, args) => {
    const item = await resolverFormulario(empresaId, args.formulario);
    const { formulario: f, respostas: todas } = await resultados(empresaId, item.id);
    const respostas = todas.filter((r) => {
      const dia = anonimoDe(f) ? String(r.enviado_dia).slice(0, 10) : diaDe(r.enviado_em);
      return (!args.de || dia >= args.de) && (!args.ate || dia <= args.ate);
    });
    const secao = secoes(f);
    let n = 0;
    return {
      formulario: f.titulo,
      formulario_id: f.id,
      respostas_consideradas: respostas.length,
      ...(args.de || args.ate ? { periodo: `${args.de ? br(args.de) : '…'} a ${args.ate ? br(args.ate) : '…'}` } : {}),
      perguntas: perguntasRespondiveis(f).map((p) => {
        n += 1;
        return { numero: n, secao: secao.get(p.id) || undefined, ...resumoPergunta(p, respostas) };
      }),
    };
  }),
};

const publicoTool = {
  name: 'formularios_publico_alvo',
  description:
    'Formulários privados: quem do público-alvo já respondeu e quem ainda falta (nome, empresas, quando respondeu — sem horário se a pesquisa for anônima), com a adesão. ' +
    'Use para "quem não respondeu a pesquisa X", "qual a adesão".',
  inputSchema: {
    formulario: z.union([z.string(), z.number()]).describe('Id ou título do formulário privado.'),
    situacao: z.enum(['todos', 'responderam', 'pendentes']).optional().describe('Padrão: todos.'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const item = await resolverFormulario(empresaId, args.formulario);
    if (item.modalidade === 'PUBLICO') throw falha(`"${item.titulo}" é público (link): não tem público-alvo; quem responde não é identificado. Use formularios_respostas.`);
    const { formulario: f, destinatarios } = await resultados(empresaId, item.id);
    const lista = destinatarios || [];
    const ok = lista.filter((d) => d.respondeu);
    const filtro = args.situacao || 'todos';
    const mostrar = filtro === 'responderam' ? ok : filtro === 'pendentes' ? lista.filter((d) => !d.respondeu) : lista;
    return {
      formulario: f.titulo,
      situacao_do_formulario: STATUS[f.status],
      obrigatorio: f.modalidade === 'PRIVADO_OBRIGATORIO',
      publico_alvo: lista.length,
      responderam: ok.length,
      pendentes: lista.length - ok.length,
      adesao_percentual: pct(ok.length, lista.length),
      pessoas: mostrar.map((d) => ({
        nome: d.nome,
        empresas: d.empresas || undefined,
        situacao: d.respondeu ? 'Respondeu' : f.modalidade === 'PRIVADO_OBRIGATORIO' ? 'Pendente (bloqueado ao entrar até responder)' : 'Pendente',
        respondido_em: d.respondido_em ? quando(d.respondido_em) : undefined,
      })),
    };
  }),
};

const TOOLS_FORMULARIOS = [guia, listaTool, formularioTool, respostasTool, resumoTool, publicoTool];

module.exports = { TOOLS_FORMULARIOS, textoResposta };
