// Grupos e endpoints da API Horizon v1 — fonte única dos exemplos, das tabelas, do menu e do
// "Testar" desta página. Backend: backend/src/modules/api-horizon/v1/. Mudou lá (rota, parâmetro,
// campo, erro)? Mude aqui. Grupo novo: entra em GRUPOS e seus endpoints em ENDPOINTS (campo grupo).

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const inicioDoMes = () => `${hoje().slice(0, 8)}01`;

const NOTA_EXEMPLO = {
  id: 6692,
  tipoDocumento: 'NFE',
  chaveAcesso: '33261005953543000228550000025147181514440192',
  numero: '2514718',
  serie: '0',
  dataEmissao: '2026-10-27T23:24:03-03:00',
  dataAtualizacao: '2026-10-28T02:51:16-03:00',
  cnpjEmitente: '05953543000228',
  razaoSocialEmitente: 'FORNECEDOR MODELO LTDA',
  cnpjDestinatario: '55510349000165',
  certificado: { id: 2, nome: 'EMPRESA MODELO 03 SPE LTDA', cnpj: '55510349000165' },
  valorTotal: 379.34,
  situacaoFiscal: 'autorizada',
  statusInterno: 'vinculada',
  motivoInativacao: null,
  inativadaEm: null,
  inativadaPor: null,
  vinculado: true,
  tituloVinculado: 18599,
  linkXml: 'https://api.horizonhub.com.br/v1/notas-fiscais/6692/xml',
};

const NOTA_INATIVADA = {
  ...NOTA_EXEMPLO,
  statusInterno: 'inativada',
  motivoInativacao: 'Nota de boleto, não é lançada no Sienge.',
  inativadaEm: '2026-10-28T09:15:42-03:00',
  inativadaPor: 'Usuário Modelo',
  dataAtualizacao: '2026-10-28T09:15:42-03:00',
  vinculado: false,
  tituloVinculado: null,
};

const ERRO = (codigo, mensagem) => ({ error: { codigo, mensagem } });

// Cada grupo é liberado na chave pelo dono (só aparece para quem tem a tela correspondente) e
// pode ter permissões de escrita próprias (escopos). Mesmos ids de backend/src/modules/api-horizon/grupos.js.
export const GRUPOS = [
  {
    id: 'autenticacao',
    titulo: 'Autenticação',
    descricao: ['Troca da chave de API pelo token usado em todos os outros endpoints.'],
  },
  {
    id: 'notas-fiscais',
    titulo: 'Notas fiscais',
    descricao: [
      'Certificados digitais e notas fiscais (NF-e e NFS-e) capturadas pelo Espião NF-e / NFS-e: situação fiscal, status de triagem, vínculo com o contas a pagar do Sienge e o XML original de cada nota.',
      'Quem consulta a Receita e as prefeituras é o Horizon, no intervalo configurado para a empresa. A API lê o que já foi capturado.',
    ],
    tela: 'Espião NFe / NFSe',
    escopos: [['notas:inativar', 'Inativar notas', 'Permite PATCH /notas-fiscais/{id}/inativar.']],
    referencias: [
      ['objeto-nota', 'Objeto Nota fiscal'],
      ['consulta-incremental', 'Consulta incremental'],
    ],
  },
];

export const ENDPOINTS = [
  {
    id: 'auth-token',
    grupo: 'autenticacao',
    metodo: 'POST',
    caminho: '/auth/token',
    titulo: 'Gerar token',
    resumo: 'Troca a chave de API por um token temporário (15 minutos).',
    descricao: [
      'Primeira chamada de toda integração. Envie a chave no cabeçalho <code class="ic">X-Api-Key</code> e use o token devolvido como <code class="ic">Authorization: Bearer</code> nas demais rotas.',
      'Reaproveite o mesmo token até ele expirar. Ao receber <code class="ic">401 TOKEN_EXPIRADO</code>, gere outro.',
    ],
    autenticacao: 'chave',
    cabecalhos: [{ nome: 'X-Api-Key', obrigatorio: true, descricao: 'Chave gerada em Integrações › API Horizon (<code class="ic">hzn_…</code>).' }],
    resposta: {
      token: 'hzt_7mQe1oVJ2c8WkxL0aR5sYdN3pT9uFgHbZi4Kw6Ej_Xo',
      tipo: 'Bearer',
      expiraEm: '2026-10-28T10:15:00-03:00',
      expiraEmSegundos: 900,
      grupos: ['notas-fiscais'],
      escopos: ['notas:inativar'],
    },
    camposResposta: [
      ['token', 'texto', 'Token a enviar em <code class="ic">Authorization: Bearer</code>.'],
      ['tipo', 'texto', 'Sempre <code class="ic">Bearer</code>.'],
      ['expiraEm', 'data e hora', 'Quando o token deixa de valer.'],
      ['expiraEmSegundos', 'número', 'Validade em segundos (900).'],
      ['grupos', 'lista', 'Grupos de endpoints liberados na chave (ex.: <code class="ic">notas-fiscais</code>).'],
      ['escopos', 'lista', 'Permissões de escrita liberadas na chave (ex.: <code class="ic">notas:inativar</code>). Vazia = só leitura.'],
    ],
    erros: ['CHAVE_AUSENTE', 'CHAVE_INVALIDA', 'CHAVE_EXPIRADA', 'CHAVE_REVOGADA', 'SEM_PERMISSAO', 'LIMITE_EXCEDIDO'],
    teste: { campos: [] },
  },
  {
    id: 'certificados',
    grupo: 'notas-fiscais',
    metodo: 'GET',
    caminho: '/certificados',
    titulo: 'Listar certificados',
    resumo: 'Certificados digitais da empresa, com CNPJ e validade.',
    descricao: [
      'Cada certificado corresponde a um CNPJ (SPE ou holding) que captura notas na Receita e nas prefeituras. Use o <code class="ic">id</code> no parâmetro <code class="ic">certificadoIds</code> da listagem de notas.',
      'Acompanhe <code class="ic">validadeAte</code>: se um certificado vencer, a captura de notas daquele CNPJ para.',
    ],
    autenticacao: 'token',
    resposta: {
      items: [
        {
          id: 3,
          nome: 'EMPRESA MODELO 04 SPE LTDA',
          cnpj: '57692838000100',
          validadeAte: '2026-11-13',
          diasParaVencer: 16,
          situacao: 'vence_em_breve',
          ultimaConsultaEm: '2026-10-28T07:06:19-03:00',
          totais: { nfe: 154, nfse: 150, nfeInativas: 0, nfseInativas: 3 },
        },
      ],
    },
    camposResposta: [
      ['id', 'número', 'Identificador do certificado.'],
      ['nome', 'texto', 'Razão social do titular do certificado.'],
      ['cnpj', 'texto, 14 dígitos', 'CNPJ do titular.'],
      ['validadeAte', 'data', 'Último dia de validade do certificado.'],
      ['diasParaVencer', 'número', 'Dias até o vencimento (negativo se já venceu).'],
      ['situacao', 'texto', '<code class="ic">valido</code>, <code class="ic">vence_em_breve</code> (30 dias ou menos), <code class="ic">vencido</code> ou <code class="ic">sem_validade</code>.'],
      ['ultimaConsultaEm', 'data e hora', 'Última consulta do Horizon à Receita/prefeitura com este certificado.'],
      ['totais', 'objeto', 'Quantidade de notas capturadas: <code class="ic">nfe</code>, <code class="ic">nfse</code>, <code class="ic">nfeInativas</code>, <code class="ic">nfseInativas</code>.'],
    ],
    erros: ['TOKEN_AUSENTE', 'TOKEN_INVALIDO', 'TOKEN_EXPIRADO', 'GRUPO_NAO_LIBERADO', 'SEM_PERMISSAO', 'LIMITE_EXCEDIDO'],
    teste: { campos: [] },
  },
  {
    id: 'notas',
    grupo: 'notas-fiscais',
    metodo: 'GET',
    caminho: '/notas-fiscais',
    titulo: 'Listar notas fiscais',
    resumo: 'Notas dos certificados escolhidos, por período de emissão.',
    descricao: [
      'Informe sempre os certificados e o período de emissão (até 366 dias, datas inclusivas). Ordem: data de emissão crescente, depois <code class="ic">id</code>.',
      'Para buscar só o que mudou desde a última consulta, use <code class="ic">atualizadoDesde</code> (ver <a href="#consulta-incremental">Consulta incremental</a>).',
    ],
    autenticacao: 'token',
    parametros: [
      { nome: 'certificadoIds', tipo: 'lista de números', obrigatorio: true, descricao: 'Ids dos certificados, separados por vírgula. Ex.: <code class="ic">1,2,7</code>.' },
      { nome: 'dataEmissaoInicio', tipo: 'data', obrigatorio: true, descricao: 'Emitidas a partir deste dia (<code class="ic">AAAA-MM-DD</code>).' },
      { nome: 'dataEmissaoFim', tipo: 'data', obrigatorio: true, descricao: 'Emitidas até este dia, inclusive.' },
      { nome: 'tipoDocumento', tipo: 'texto', descricao: '<code class="ic">NFE</code> ou <code class="ic">NFSE</code>.' },
      { nome: 'status', tipo: 'lista de textos', descricao: 'Um ou mais de <code class="ic">pendente</code>, <code class="ic">vinculada</code>, <code class="ic">inativada</code>, <code class="ic">cancelada</code>.' },
      { nome: 'atualizadoDesde', tipo: 'data e hora', descricao: 'Só notas cujo status mudou a partir deste momento. ISO 8601 com fuso: <code class="ic">2026-10-20T07:00:00-03:00</code>.' },
      { nome: 'page', tipo: 'número', descricao: 'Página. Padrão <code class="ic">1</code>.' },
      { nome: 'pageSize', tipo: 'número', descricao: 'Itens por página. Padrão <code class="ic">100</code>, máximo <code class="ic">200</code>.' },
    ],
    exemploConsulta: 'certificadoIds=1,2,7&dataEmissaoInicio=2026-10-01&dataEmissaoFim=2026-10-31&status=pendente,vinculada',
    resposta: { items: [NOTA_EXEMPLO], pagination: { page: 1, pageSize: 100, total: 412, totalPages: 5 } },
    camposResposta: [
      ['items', 'lista', 'Notas da página — ver <a href="#objeto-nota">Nota fiscal</a>.'],
      ['pagination', 'objeto', '<code class="ic">page</code>, <code class="ic">pageSize</code>, <code class="ic">total</code> (notas no filtro) e <code class="ic">totalPages</code>.'],
    ],
    erros: ['PARAMETRO_INVALIDO', 'PARAMETRO_DESCONHECIDO', 'CERTIFICADO_INVALIDO', 'TOKEN_EXPIRADO', 'GRUPO_NAO_LIBERADO', 'SEM_PERMISSAO', 'LIMITE_EXCEDIDO'],
    teste: {
      campos: [
        { nome: 'certificadoIds', tipo: 'certificados', obrigatorio: true, exemplo: '1,2,7' },
        { nome: 'dataEmissaoInicio', tipo: 'date', obrigatorio: true, padrao: inicioDoMes },
        { nome: 'dataEmissaoFim', tipo: 'date', obrigatorio: true, padrao: hoje },
        { nome: 'tipoDocumento', tipo: 'select', opcoes: ['', 'NFE', 'NFSE'] },
        { nome: 'status', tipo: 'multi', opcoes: ['pendente', 'vinculada', 'inativada', 'cancelada'] },
        { nome: 'atualizadoDesde', tipo: 'text', placeholder: '2026-10-20T07:00:00-03:00' },
        { nome: 'page', tipo: 'number', padrao: () => '1' },
        { nome: 'pageSize', tipo: 'number', padrao: () => '20' },
      ],
    },
  },
  {
    id: 'nota',
    grupo: 'notas-fiscais',
    metodo: 'GET',
    caminho: '/notas-fiscais/{id}',
    titulo: 'Consultar uma nota',
    resumo: 'Uma nota pelo id.',
    descricao: ['Mesmo formato de cada item da listagem. Útil para conferir o status de uma nota específica.'],
    autenticacao: 'token',
    parametrosCaminho: [{ nome: 'id', tipo: 'número', obrigatorio: true, descricao: 'Id da nota (campo <code class="ic">id</code> da listagem).' }],
    resposta: NOTA_EXEMPLO,
    camposResposta: [['—', '', 'Ver <a href="#objeto-nota">Nota fiscal</a>.']],
    erros: ['NOTA_NAO_ENCONTRADA', 'TOKEN_EXPIRADO', 'GRUPO_NAO_LIBERADO', 'SEM_PERMISSAO', 'LIMITE_EXCEDIDO'],
    teste: { campos: [{ nome: 'id', tipo: 'number', obrigatorio: true, caminho: true }] },
  },
  {
    id: 'xml',
    grupo: 'notas-fiscais',
    metodo: 'GET',
    caminho: '/notas-fiscais/{id}/xml',
    titulo: 'Baixar o XML',
    resumo: 'Arquivo XML original da nota (itens, impostos, CFOP).',
    descricao: [
      'Devolve o XML tal como veio da Receita (NF-e) ou do Ambiente Nacional da NFS-e, com <code class="ic">Content-Type: application/xml</code>. Itens, impostos e CFOP estão nele.',
      'É o mesmo endereço do campo <code class="ic">linkXml</code>. Exige o token como as demais rotas e fica disponível enquanto a nota existir no Horizon.',
    ],
    autenticacao: 'token',
    parametrosCaminho: [{ nome: 'id', tipo: 'número', obrigatorio: true, descricao: 'Id da nota.' }],
    respostaTexto:
      '<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">\n  <NFe>\n    <infNFe Id="NFe3326100595354300022855…" versao="4.00">\n      <ide>…</ide>\n      <emit>…</emit>\n      <det nItem="1">…</det>\n      <total>…</total>\n    </infNFe>\n  </NFe>\n  <protNFe>…</protNFe>\n</nfeProc>',
    erros: ['NOTA_NAO_ENCONTRADA', 'XML_INDISPONIVEL', 'TOKEN_EXPIRADO', 'GRUPO_NAO_LIBERADO', 'LIMITE_EXCEDIDO'],
    teste: { campos: [{ nome: 'id', tipo: 'number', obrigatorio: true, caminho: true }] },
  },
  {
    id: 'inativar',
    grupo: 'notas-fiscais',
    metodo: 'PATCH',
    caminho: '/notas-fiscais/{id}/inativar',
    titulo: 'Inativar uma nota',
    resumo: 'Marca a nota como "não lançar", com motivo.',
    descricao: [
      'Mesma ação do botão <strong>Inativar</strong> da tela Espião NFe / NFSe: a nota sai das pendentes e passa a <code class="ic">statusInterno: "inativada"</code>, registrada no nome do dono da chave.',
      'Exige a permissão <strong>Inativar notas</strong> (escopo <code class="ic">notas:inativar</code>) liberada na chave, junto com Notas fiscais. Reativar continua sendo feito na tela.',
    ],
    autenticacao: 'token',
    escopo: 'notas:inativar',
    parametrosCaminho: [{ nome: 'id', tipo: 'número', obrigatorio: true, descricao: 'Id da nota.' }],
    corpo: [{ nome: 'motivo', tipo: 'texto', obrigatorio: true, descricao: 'Por que a nota não deve ser lançada. De 3 a 500 caracteres.' }],
    exemploCorpo: { motivo: 'Nota de boleto, não é lançada no Sienge.' },
    resposta: NOTA_INATIVADA,
    camposResposta: [['—', '', 'A nota já atualizada — ver <a href="#objeto-nota">Nota fiscal</a>.']],
    erros: ['PARAMETRO_INVALIDO', 'GRUPO_NAO_LIBERADO', 'ESCOPO_INSUFICIENTE', 'NOTA_NAO_ENCONTRADA', 'NOTA_JA_INATIVADA', 'LIMITE_EXCEDIDO'],
    teste: {
      campos: [
        { nome: 'id', tipo: 'number', obrigatorio: true, caminho: true },
        { nome: 'motivo', tipo: 'textarea', obrigatorio: true, corpo: true, placeholder: 'Ex.: Nota de boleto, não é lançada no Sienge.', exemplo: 'Nota de boleto, não é lançada no Sienge.' },
      ],
      confirmacao: 'Entendo que esta nota será inativada de verdade no Horizon.',
    },
  },
];

// [status, codigo, quando, grupo] — sem grupo = vale para qualquer endpoint.
export const ERROS = [
  [400, 'PARAMETRO_INVALIDO', 'Parâmetro ausente, com formato errado ou fora do limite. A mensagem diz qual.'],
  [400, 'PARAMETRO_DESCONHECIDO', 'Parâmetro que a rota não aceita (geralmente nome digitado errado).'],
  [400, 'CERTIFICADO_INVALIDO', 'Algum id de <code class="ic">certificadoIds</code> não é da empresa da chave.', 'notas-fiscais'],
  [400, 'JSON_INVALIDO', 'Corpo da requisição não é um JSON válido.'],
  [401, 'CHAVE_AUSENTE', 'Faltou o cabeçalho <code class="ic">X-Api-Key</code>.'],
  [401, 'CHAVE_INVALIDA', 'Chave inexistente.'],
  [401, 'CHAVE_EXPIRADA', 'A chave passou da validade. Gere outra.'],
  [401, 'CHAVE_REVOGADA', 'A chave foi revogada ou substituída por uma nova em Integrações › API Horizon.'],
  [401, 'TOKEN_AUSENTE', 'Faltou o cabeçalho <code class="ic">Authorization: Bearer</code>.'],
  [401, 'TOKEN_INVALIDO', 'Token inexistente ou de chave revogada.'],
  [401, 'TOKEN_EXPIRADO', 'O token passou dos 15 minutos. Gere outro.'],
  [403, 'GRUPO_NAO_LIBERADO', 'O grupo do endpoint não está liberado na chave. Libere em Integrações › API Horizon.'],
  [403, 'SEM_PERMISSAO', 'O dono da chave está inativo, perdeu o acesso à empresa da chave ou à tela exigida pelo grupo.'],
  [403, 'ESCOPO_INSUFICIENTE', 'A permissão de escrita que o endpoint exige não está liberada na chave.'],
  [404, 'NOTA_NAO_ENCONTRADA', 'Nota inexistente ou de outra empresa.', 'notas-fiscais'],
  [404, 'XML_INDISPONIVEL', 'A nota existe, mas o arquivo XML não está disponível.', 'notas-fiscais'],
  [404, 'ROTA_NAO_ENCONTRADA', 'Caminho ou método inexistente.'],
  [409, 'NOTA_JA_INATIVADA', 'A nota já estava inativada.', 'notas-fiscais'],
  [413, 'CORPO_MUITO_GRANDE', 'Corpo da requisição grande demais.'],
  [429, 'LIMITE_EXCEDIDO', 'Limite de requisições atingido. Espere os segundos do cabeçalho <code class="ic">Retry-After</code>.'],
  [500, 'ERRO_INTERNO', 'Falha do lado do Horizon. Tente de novo em instantes.'],
];

export const CAMPOS_NOTA = [
  ['id', 'número', 'Identificador da nota no Horizon.'],
  ['tipoDocumento', 'texto', '<code class="ic">NFE</code> ou <code class="ic">NFSE</code>.'],
  ['chaveAcesso', 'texto', 'Chave de acesso: 44 dígitos na NF-e, 50 na NFS-e nacional.'],
  ['numero', 'texto', 'Número da nota.'],
  ['serie', 'texto', 'Série. Na NFS-e é a série da DPS e pode vir vazia.'],
  ['dataEmissao', 'data e hora', 'Emissão, como consta na nota.'],
  ['dataAtualizacao', 'data e hora', 'Última mudança de status da nota. Base do <code class="ic">atualizadoDesde</code>.'],
  ['cnpjEmitente', 'texto, 14 dígitos', 'CNPJ de quem emitiu (fornecedor/prestador). CPF, com 11 dígitos, se for pessoa física.'],
  ['razaoSocialEmitente', 'texto', 'Razão social de quem emitiu.'],
  ['cnpjDestinatario', 'texto, 14 dígitos', 'CNPJ que recebeu a nota (destinatário da NF-e ou tomador da NFS-e).'],
  ['certificado', 'objeto', '<code class="ic">id</code>, <code class="ic">nome</code> e <code class="ic">cnpj</code> do certificado que capturou a nota.'],
  ['valorTotal', 'número', 'Valor total, em reais. NF-e: total da nota. NFS-e: valor do serviço.'],
  ['situacaoFiscal', 'texto', '<code class="ic">autorizada</code> ou <code class="ic">cancelada</code> na Receita/prefeitura. Independe da triagem.'],
  ['statusInterno', 'texto', 'Status de triagem — ver tabela abaixo.'],
  ['motivoInativacao', 'texto ou null', 'Motivo registrado ao inativar. Preenchido só quando <code class="ic">inativada</code>.'],
  ['inativadaEm', 'data e hora ou null', 'Quando foi inativada.'],
  ['inativadaPor', 'texto ou null', 'Nome do usuário que inativou (pela tela ou pela API).'],
  ['vinculado', 'booleano', '<code class="ic">true</code> se a nota foi vinculada a um título do contas a pagar do Sienge.'],
  ['tituloVinculado', 'número ou null', 'Número do título no contas a pagar do Sienge.'],
  ['linkXml', 'texto (URL)', 'Endereço do XML completo — ver <a href="#ep-xml">Baixar o XML</a>.'],
];

export const STATUS_INTERNO = [
  ['pendente', 'Ainda não encontrada no contas a pagar e não marcada para não lançar.'],
  ['vinculada', 'Encontrada no contas a pagar do Sienge (CNPJ do fornecedor + número + data de emissão) ou vinculada à mão.'],
  ['inativada', 'Marcada para não lançar, com motivo.'],
  ['cancelada', 'Cancelada na Receita/prefeitura.'],
];
