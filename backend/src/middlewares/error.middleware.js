function errorMiddleware(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.expose ? err.message : 'Erro interno do servidor.';
  // `code` é opcional: só alguns erros (ex.: saldos.service.js::abrirPeriodo, quando o dia
  // pedido já foi encerrado) marcam um código pra tela distinguir esse caso de um erro comum
  // sem precisar comparar a mensagem em texto.
  res.status(status).json(err.code ? { message, code: err.code } : { message });
}

module.exports = errorMiddleware;
