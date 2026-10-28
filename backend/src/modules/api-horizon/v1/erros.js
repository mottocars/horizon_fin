// Erros da API pública, sempre no formato { "error": { "codigo", "mensagem" } } (pedido da
// especificação da integração). Os códigos estão documentados em api-docs/ — mudou aqui, mude lá.
class ErroApi extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

function responderErro(res, status, codigo, mensagem, detalhes) {
  const error = { codigo, mensagem };
  if (detalhes) error.detalhes = detalhes;
  return res.status(status).json({ error });
}

// Último middleware do router da v1: ErroApi sai como foi criado; JSON malformado no corpo
// vira 400; o resto é 500 sem detalhe (o detalhe vai pro log).
// eslint-disable-next-line no-unused-vars
function tratarErros(err, req, res, next) {
  if (err instanceof ErroApi) return responderErro(res, err.status, err.codigo, err.message, err.detalhes);
  if (err.type === 'entity.parse.failed') return responderErro(res, 400, 'JSON_INVALIDO', 'O corpo da requisição não é um JSON válido.');
  if (err.type === 'entity.too.large') return responderErro(res, 413, 'CORPO_MUITO_GRANDE', 'O corpo da requisição é grande demais.');
  console.error('[api-horizon]', err);
  return responderErro(res, 500, 'ERRO_INTERNO', 'Erro interno. Tente de novo em instantes.');
}

module.exports = { ErroApi, responderErro, tratarErros };
