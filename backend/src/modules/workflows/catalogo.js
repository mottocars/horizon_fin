// Operações > Workflows: o que existe para montar uma automação. Gatilho novo = acrescentar aqui e chamar
// `workflows.service.disparar(empresaId, GATILHO, contexto)` de onde o evento acontece.

const VARIAVEIS_DRE = [
  { chave: 'empresa', rotulo: 'Empresa', exemplo: 'TOSTE E DINIZ' },
  { chave: 'versao', rotulo: 'Número da versão', exemplo: '5' },
  { chave: 'realizado_ate', rotulo: 'Realizado até', exemplo: 'out/2026' },
  { chave: 'responsavel', rotulo: 'Quem salvou a versão', exemplo: 'Bruno Motta' },
  { chave: 'aprovador', rotulo: 'Aprovador (Matriz de Alçadas)', exemplo: 'Gizele Dias' },
  { chave: 'data', rotulo: 'Data e hora do evento', exemplo: '19/11/2026 10:48' },
  { chave: 'destinatario', rotulo: 'Primeiro nome de quem recebe', exemplo: 'Gizele' },
  { chave: 'link', rotulo: 'Link para abrir no Horizon', exemplo: 'https://app.horizonhub.com.br/…' },
];

const GATILHOS = {
  DRE_VERSAO_SALVA: {
    rotulo: 'DRE: versão salva',
    descricao: 'Quando alguém salva uma versão da DRE (Operações › DRE Construtoras › Versões).',
    variaveis: VARIAVEIS_DRE,
    // O {link} leva para onde a pessoa age (a aba Versões, pra aprovar).
    link: (front, empresaId) => `${front}/operacoes/dre-gerencial?empresa_id=${empresaId}&aba=versoes`,
  },
  DRE_VERSAO_APROVADA: {
    rotulo: 'DRE: versão aprovada',
    descricao: 'Quando o Aprovador aprova a versão da DRE e ela passa a ser a publicada (ou, sem Aprovador na Matriz de Alçadas, ao salvar).',
    variaveis: VARIAVEIS_DRE,
    link: (front, empresaId) => `${front}/dashboards/economico-financeiro?tela=dre&empresa_id=${empresaId}`,
  },
};

// Quem recebe: o Aprovador da DRE (Cadastros › Matriz de Alçadas) ou os usuários escolhidos.
const DESTINATARIOS = {
  APROVADOR: { rotulo: 'Aprovador da DRE (Matriz de Alçadas)' },
  USUARIOS: { rotulo: 'Usuários escolhidos' },
};

// Os modelos que a tela oferece ao criar (pedido do usuário).
const MODELOS = [
  {
    id: 'aprovar-versao-dre',
    nome: 'Pedir aprovação da versão da DRE',
    descricao: 'Quando uma versão da DRE é salva, avisa o Aprovador da Matriz de Alçadas pelo WhatsApp.',
    gatilho: 'DRE_VERSAO_SALVA',
    acao: {
      tipo: 'WHATSAPP',
      conexao_id: null,
      destinatarios: { modo: 'APROVADOR', usuarios: [] },
      anexar_excel_dre: false,
      mensagem:
        'Olá, {destinatario}! A versão {versao} da DRE da {empresa} foi salva por {responsavel} (realizado até {realizado_ate}) e está aguardando a sua aprovação.\n\nAprove em: {link}',
    },
  },
  {
    id: 'nova-versao-dre',
    nome: 'Avisar nova versão da DRE',
    descricao: 'Quando a versão da DRE é aprovada, avisa os usuários escolhidos pelo WhatsApp — com o Excel de auditoria da DRE anexo, se quiser.',
    gatilho: 'DRE_VERSAO_APROVADA',
    acao: {
      tipo: 'WHATSAPP',
      conexao_id: null,
      destinatarios: { modo: 'USUARIOS', usuarios: [] },
      anexar_excel_dre: true,
      mensagem:
        'Olá, {destinatario}! Está disponível a versão {versao} da DRE da {empresa}, aprovada por {aprovador} (realizado até {realizado_ate}).\n\nVeja no dashboard: {link}',
    },
  },
];

module.exports = { GATILHOS, DESTINATARIOS, MODELOS };
