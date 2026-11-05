// ---------------------------------------------------------------------------------------
// Configuração da empresa modelo (HZN CONSTRUTORA). A base é uma cópia anonimizada da empresa
// de ORIGEM (TOSTE E DINIZ, achada pelo CNPJ — o id pode mudar entre ambientes). As conexões
// API Itaú são espelhos das conexões da empresa ITAU_ORIGEM (GENESIS), sem nada dela na tela.
// ---------------------------------------------------------------------------------------

const CNPJ_ORIGEM = '05093251000181'; // TOSTES E DINIZ CONSTRUCOES E LOCACAO DE EQUIPAMENTOS LTDA
const CNPJ_ITAU_ORIGEM = '12164139000150'; // GENESIS (conexões API Itaú espelhadas)

const EMPRESA = {
  cnpj: '48375926000198', // fictício (dígitos verificadores válidos)
  razao_social: 'HZN CONSTRUTORA E INCORPORADORA LTDA',
  nome_fantasia: 'HZN CONSTRUTORA',
  cep: '27251000',
  logradouro: 'AVENIDA DOS HORIZONTES',
  numero: '1500',
  complemento: 'SALA 801',
  bairro: 'CENTRO',
  cidade: 'Volta Redonda',
  estado: 'RJ',
  telefone: '2433500000',
  situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2009-03-16',
};

const TENANT = 'hznconstrutora';

// Centros de custo da origem (pelo nome normalizado) → nome na HZN. Obras com nomes ligados ao
// horizonte; áreas administrativas mantêm nomes genéricos.
const CENTROS = {
  'ESCRITORIO CENTRAL': 'ESCRITÓRIO CENTRAL',
  'TOSTES EASY 2': 'HZN AURORA II',
  'TOSTES EASY 1': 'HZN AURORA I',
  'TOSTES NORMAND': 'HZN MIRANTE',
  'TOSTES LIVING': 'HZN POENTE',
  'TOSTES URBAN': 'HZN ORIENTE',
  'TOSTES ESSENCE': 'HZN PANORAMA',
  'SMART JOAQUIM LEITE': 'HZN ZÊNITE',
  'TOSTES ON': 'HZN ALVORADA',
  'NOVOS NEGOCIOS': 'NOVOS NEGÓCIOS',
  GALPAO: 'GALPÃO',
  'TD ORIGENS': 'HZN NASCENTE',
  'TOSTES LINE': 'HZN LINHA DO HORIZONTE',
  'POS OBRA': 'PÓS OBRA',
  'TOSTES SELECT': 'HZN CREPÚSCULO',
  'TD VOLDAC': 'HZN ALTITUDE',
  'TOSTES JD AMALIA': 'HZN VISTA ALEGRE',
};

// Nomes curtos das obras como aparecem soltos (nome de conta bancária, orçamento, Caixa…).
// Só aplicados em colunas onde o texto é o nome da obra — palavras como LINE/ON/SELECT são
// comuns demais para trocar no texto livre.
const OBRAS_CURTAS = {
  'EASY 2': 'AURORA II',
  'EASY 1': 'AURORA I',
  EASY: 'AURORA',
  NORMAND: 'MIRANTE',
  LIVING: 'POENTE',
  URBAN: 'ORIENTE',
  ESSENCE: 'PANORAMA',
  SMART: 'ZÊNITE',
  'JOAQUIM LEITE': 'ZÊNITE',
  ON: 'ALVORADA',
  ORIGENS: 'NASCENTE',
  'TD ORIGENS': 'HZN NASCENTE',
  LINE: 'LINHA DO HORIZONTE',
  SELECT: 'CREPÚSCULO',
  VOLDAC: 'ALTITUDE',
  'TD VOLDAC': 'HZN ALTITUDE',
  'JD AMALIA': 'VISTA ALEGRE',
  'JARDIM AMALIA': 'VISTA ALEGRE',
  'SEDE ADM': 'SEDE ADM',
};

// Empresas (SPEs) da origem, pelo nome normalizado → razão social na HZN.
const EMPRESAS_GRUPO = {
  'TOSTES E DINIZ CONSTRUCOES E LOCACAO DE EQUIPAMENTOS LTDA': 'HZN CONSTRUTORA E INCORPORADORA LTDA',
  'RODRIGO TOSTES EMPREENDIMENTOS IMOBILIARIOS LTDA': 'HZN PARTICIPAÇÕES E EMPREENDIMENTOS LTDA',
  'TOSTES 01 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN ORIENTE EMPREENDIMENTOS SPE LTDA',
  'TOSTES 02 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN PANORAMA EMPREENDIMENTOS SPE LTDA',
  'TOSTES 03 EMPREENDIMENTOS IMOBILARIOS SPE LTDA': 'HZN POENTE EMPREENDIMENTOS SPE LTDA',
  'TOSTES 03 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN POENTE EMPREENDIMENTOS SPE LTDA',
  'TOSTES 04 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN ALVORADA EMPREENDIMENTOS SPE LTDA',
  'TOSTES 05 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN NASCENTE EMPREENDIMENTOS SPE LTDA',
  'TOSTES 06 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN LINHA DO HORIZONTE EMPREENDIMENTOS SPE LTDA',
  'TOSTES 07 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA': 'HZN CREPÚSCULO EMPREENDIMENTOS SPE LTDA',
  'VR4 CONSTRUCAO E INCORPORACAO SPE LTDA': 'HZN ZÊNITE CONSTRUÇÃO E INCORPORAÇÃO SPE LTDA',
  'VR3 CONST E INCORP SPE LTDA': 'HZN MIRANTE CONSTRUÇÃO E INCORPORAÇÃO SPE LTDA',
};

// Equipe fictícia da HZN (usuários do sistema só da empresa modelo, sem senha conhecida).
// Todo usuário real que aparece nos dados da origem (responsáveis, quem lançou, quem recebeu
// comunicado…) vira um destes, em rodízio determinístico.
const EQUIPE = [
  { nome: 'Camila Prado', email: 'camila.prado@hznconstrutora.com.br', username: 'camila.prado', cargo: 'Diretora Financeira' },
  { nome: 'Rafael Duarte', email: 'rafael.duarte@hznconstrutora.com.br', username: 'rafael.duarte', cargo: 'Controller' },
  { nome: 'Juliana Teixeira', email: 'juliana.teixeira@hznconstrutora.com.br', username: 'juliana.teixeira', cargo: 'Coordenadora de Cobrança' },
  { nome: 'Marcos Lacerda', email: 'marcos.lacerda@hznconstrutora.com.br', username: 'marcos.lacerda', cargo: 'Engenheiro de Planejamento' },
  { nome: 'Patrícia Moura', email: 'patricia.moura@hznconstrutora.com.br', username: 'patricia.moura', cargo: 'Analista Financeira' },
  { nome: 'Thiago Sampaio', email: 'thiago.sampaio@hznconstrutora.com.br', username: 'thiago.sampaio', cargo: 'Analista de Cobrança' },
];

// Palavras que NUNCA podem aparecer em dado da empresa modelo (auditoria final).
const PROIBIDOS = [
  /TOSTE/i,
  /DINIZ/i,
  /GENESIS/i,
  /tostesediniz/i,
  /\bVR[34]\b/,
  /NORMAND/i,
  /VOLDAC/i,
  /JOAQUIM LEITE/i,
  /\bT&D\b/,
  /AMALIA/i,
];

module.exports = { CNPJ_ORIGEM, CNPJ_ITAU_ORIGEM, EMPRESA, TENANT, CENTROS, OBRAS_CURTAS, EMPRESAS_GRUPO, EQUIPE, PROIBIDOS };
