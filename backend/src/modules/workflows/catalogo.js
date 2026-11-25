// Operações > Workflows: o que existe para montar uma automação. Um workflow tem TÓPICOS (passos): cada um com o
// seu gatilho e a sua ação. Gatilho novo = acrescentar aqui e chamar `workflows.service.disparar(empresaId,
// GATILHO, contexto)` de onde o evento acontece.

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

const linkVersoes = (front, empresaId) => `${front}/operacoes/dre-gerencial?empresa_id=${empresaId}&aba=versoes`;

// Versões da DFC (Operações › DFC Construtoras › Versões — 25/11/2026): as mesmas variáveis da DRE.
const VARIAVEIS_DFC = VARIAVEIS_DRE;
const linkVersoesDfc = (front, empresaId) => `${front}/operacoes/dfc-construtoras?empresa_id=${empresaId}&aba=versoes`;
// O anexo que cada sistema oferece (o Excel da versão, jan a dez do ano do realizado).
const ANEXO_DRE = { rotulo: 'Excel de auditoria da DRE', arquivo: 'DRE - auditoria.xlsx' };
const ANEXO_DFC = { rotulo: 'Excel do DFC (fluxo de caixa)', arquivo: 'DFC.xlsx' };

const GATILHOS = {
  DRE_VERSAO_SALVA: {
    sistema: 'DRE',
    anexo: ANEXO_DRE,
    rotulo: 'DRE: versão salva',
    descricao: 'Quando alguém salva uma versão da DRE (Operações › DRE Construtoras › Versões).',
    variaveis: VARIAVEIS_DRE,
    // O {link} leva para onde a pessoa age (a aba Versões, pra aprovar ou reprovar).
    link: linkVersoes,
  },
  DRE_VERSAO_APROVADA: {
    sistema: 'DRE',
    anexo: ANEXO_DRE,
    rotulo: 'DRE: versão aprovada',
    descricao: 'Quando o Aprovador aprova a versão da DRE e ela passa a ser a publicada (ou, sem Aprovador na Matriz de Alçadas, ao salvar).',
    variaveis: VARIAVEIS_DRE,
    link: (front, empresaId) => `${front}/dashboards/economico-financeiro?tela=dre&empresa_id=${empresaId}`,
  },
  DRE_VERSAO_REPROVADA: {
    sistema: 'DRE',
    anexo: ANEXO_DRE,
    rotulo: 'DRE: versão reprovada',
    descricao: 'Quando o Aprovador reprova a versão da DRE (com o motivo). Ela não é publicada; para corrigir, edita-se a última versão.',
    variaveis: [
      ...VARIAVEIS_DRE,
      { chave: 'motivo', rotulo: 'Motivo da reprovação', exemplo: 'O orçamento da obra 5 está desatualizado.' },
      { chave: 'reprovador', rotulo: 'Quem reprovou', exemplo: 'Gizele Dias' },
    ],
    link: linkVersoes,
  },
  DFC_VERSAO_SALVA: {
    sistema: 'DFC',
    anexo: ANEXO_DFC,
    rotulo: 'DFC: versão salva',
    descricao: 'Quando alguém salva uma versão da DFC (Operações › DFC Construtoras › Versões).',
    variaveis: VARIAVEIS_DFC,
    link: linkVersoesDfc,
  },
  DFC_VERSAO_APROVADA: {
    sistema: 'DFC',
    anexo: ANEXO_DFC,
    rotulo: 'DFC: versão aprovada',
    descricao: 'Quando o Aprovador aprova a versão da DFC e ela passa a ser a publicada no dashboard Fluxo de Caixa (ou, sem Aprovador na Matriz de Alçadas, ao salvar).',
    variaveis: VARIAVEIS_DFC,
    link: (front, empresaId) => `${front}/dashboards/economico-financeiro?tela=fluxo-caixa&empresa_id=${empresaId}`,
  },
  DFC_VERSAO_REPROVADA: {
    sistema: 'DFC',
    anexo: ANEXO_DFC,
    rotulo: 'DFC: versão reprovada',
    descricao: 'Quando o Aprovador reprova a versão da DFC (com o motivo). Ela não é publicada; para corrigir, edita-se a última versão.',
    variaveis: [
      ...VARIAVEIS_DFC,
      { chave: 'motivo', rotulo: 'Motivo da reprovação', exemplo: 'A projeção CEF da obra 5 está desatualizada.' },
      { chave: 'reprovador', rotulo: 'Quem reprovou', exemplo: 'Gizele Dias' },
    ],
    link: linkVersoesDfc,
  },
};

// Quem recebe: o Aprovador (Cadastros › Matriz de Alçadas — o da DRE ou o da DFC, conforme o gatilho), o
// Responsável (quem salvou a versão) ou os usuários escolhidos.
const DESTINATARIOS = {
  APROVADOR: { rotulo: 'Aprovador (Matriz de Alçadas)' },
  RESPONSAVEL: { rotulo: 'Responsável (quem salvou a versão)' },
  USUARIOS: { rotulo: 'Usuários escolhidos' },
};

const whatsapp = (modo, mensagem, anexar = false) => ({
  tipo: 'WHATSAPP',
  conexao_id: null,
  destinatarios: { modo, usuarios: [] },
  anexar_excel_dre: anexar,
  mensagem,
});

// Os modelos que a tela oferece ao criar (pedido do usuário): um por gatilho, cada um com um tópico só (mais
// tópicos, se quiser, pelo "Adicionar tópico" do editor).
const MODELOS = [
  {
    id: 'aprovar-versao-dre',
    nome: 'Pedir aprovação da versão da DRE',
    descricao: 'Quando uma versão da DRE é salva, avisa o Aprovador da Matriz de Alçadas pelo WhatsApp.',
    passos: [
      {
        gatilho: 'DRE_VERSAO_SALVA',
        acao: whatsapp(
          'APROVADOR',
          'Olá, {destinatario}! A versão {versao} da DRE da {empresa} foi salva por {responsavel} (realizado até {realizado_ate}) e está aguardando a sua aprovação.\n\nAprove ou reprove em: {link}'
        ),
      },
    ],
  },
  {
    id: 'nova-versao-dre',
    nome: 'Avisar nova versão da DRE',
    descricao: 'Quando a versão da DRE é aprovada, avisa os usuários escolhidos pelo WhatsApp — com o Excel de auditoria da DRE anexo, se quiser.',
    passos: [
      {
        gatilho: 'DRE_VERSAO_APROVADA',
        acao: whatsapp(
          'USUARIOS',
          'Olá, {destinatario}! Está disponível a versão {versao} da DRE da {empresa}, aprovada por {aprovador} (realizado até {realizado_ate}).\n\nVeja no dashboard: {link}',
          true
        ),
      },
    ],
  },
  {
    id: 'reprovacao-versao-dre',
    nome: 'Avisar reprovação da versão da DRE',
    descricao: 'Quando o Aprovador reprova a versão da DRE, devolve ao responsável (quem salvou) pelo WhatsApp, com o motivo.',
    passos: [
      {
        gatilho: 'DRE_VERSAO_REPROVADA',
        acao: whatsapp(
          'RESPONSAVEL',
          'Olá, {destinatario}. A versão {versao} da DRE da {empresa} foi reprovada por {reprovador}.\n\nMotivo: {motivo}\n\nPara corrigir, edite a última versão e salve de novo: {link}'
        ),
      },
    ],
  },
  {
    id: 'aprovar-versao-dfc',
    nome: 'Pedir aprovação da versão da DFC',
    descricao: 'Quando uma versão da DFC é salva, avisa o Aprovador da Matriz de Alçadas pelo WhatsApp.',
    passos: [
      {
        gatilho: 'DFC_VERSAO_SALVA',
        acao: whatsapp(
          'APROVADOR',
          'Olá, {destinatario}! A versão {versao} da DFC (fluxo de caixa) da {empresa} foi salva por {responsavel} (realizado até {realizado_ate}) e está aguardando a sua aprovação.\n\nAprove ou reprove em: {link}'
        ),
      },
    ],
  },
  {
    id: 'nova-versao-dfc',
    nome: 'Avisar nova versão da DFC',
    descricao: 'Quando a versão da DFC é aprovada, avisa os usuários escolhidos pelo WhatsApp — com o Excel do DFC anexo, se quiser.',
    passos: [
      {
        gatilho: 'DFC_VERSAO_APROVADA',
        acao: whatsapp(
          'USUARIOS',
          'Olá, {destinatario}! Está disponível a versão {versao} da DFC (fluxo de caixa) da {empresa}, aprovada por {aprovador} (realizado até {realizado_ate}).\n\nVeja no dashboard: {link}',
          true
        ),
      },
    ],
  },
  {
    id: 'reprovacao-versao-dfc',
    nome: 'Avisar reprovação da versão da DFC',
    descricao: 'Quando o Aprovador reprova a versão da DFC, devolve ao responsável (quem salvou) pelo WhatsApp, com o motivo.',
    passos: [
      {
        gatilho: 'DFC_VERSAO_REPROVADA',
        acao: whatsapp(
          'RESPONSAVEL',
          'Olá, {destinatario}. A versão {versao} da DFC (fluxo de caixa) da {empresa} foi reprovada por {reprovador}.\n\nMotivo: {motivo}\n\nPara corrigir, edite a última versão e salve de novo: {link}'
        ),
      },
    ],
  },
];

module.exports = { GATILHOS, DESTINATARIOS, MODELOS };
