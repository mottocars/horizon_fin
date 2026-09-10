// Progresso "ao vivo" (página atual / total de páginas) de uma
// sincronização em andamento — guardado só em memória, por empresa e por
// integração ('sienge' ou 'cvcrm'). A sincronização roda dentro da mesma
// requisição HTTP que a dispara (não é um job em background), mas como cada
// página é buscada com `await`, o event loop fica livre entre uma página e
// outra pra atender a requisição de status que o frontend faz em paralelo,
// enquanto pergunta "em que página estamos?" pra desenhar a barra de
// progresso. Não sobrevive a um restart do servidor — não precisa, é só
// feedback visual de uma operação em andamento.
const progresso = new Map();

function chave(empresaId, tipo) {
  return `${empresaId}:${tipo}`;
}

function set(empresaId, tipo, dados) {
  progresso.set(chave(empresaId, tipo), { ...dados, atualizadoEm: Date.now() });
}

function get(empresaId, tipo) {
  return progresso.get(chave(empresaId, tipo)) || null;
}

function clear(empresaId, tipo) {
  progresso.delete(chave(empresaId, tipo));
}

module.exports = { set, get, clear };
