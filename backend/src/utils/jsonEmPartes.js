// Lê um JSON grande em partes, sem montar o texto inteiro: entrega um a um os itens da lista `campo`
// do objeto raiz — { ..., "data": [ {...}, {...} ] } — conforme o corpo chega. Feito para as bulk-data
// do Sienge, que devolvem tudo numa resposta só: a do contas a pagar da GENESIS passa de 512 MB e
// response.json() estourava o limite de texto do Node ("Cannot create a string longer than
// 0x1fffffe8 characters"). Só o item em leitura fica em memória.
// `corpo`: fetch Response.body (ou qualquer iterável assíncrono de Uint8Array).
// Sem a lista `campo` no objeto raiz, dá erro no fim (uma resposta inesperada não vira "zero itens").

const ASPAS = 34;
const BARRA = 92;
const DOIS_PONTOS = 58;
const VIRGULA = 44;
const ABRE_OBJ = 123;
const FECHA_OBJ = 125;
const ABRE_LISTA = 91;
const FECHA_LISTA = 93;

async function* itensDoCampo(corpo, campo) {
  const decodificador = new TextDecoder('utf-8');
  let prof = 0; // quantos { e [ estão abertos
  let emTexto = false;
  let escape = false;
  let texto = ''; // texto em leitura no 1º nível (para reconhecer as chaves)
  let ultimoTexto = null;
  let chave = null;
  let naLista = false; // dentro da lista `campo`
  let achou = false;
  let partes = null; // pedaços do item em leitura (ele pode atravessar vários blocos)

  const processar = function* (s) {
    let inicio = partes ? 0 : -1;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (emTexto) {
        if (escape) escape = false;
        else if (c === BARRA) escape = true;
        else if (c === ASPAS) {
          emTexto = false;
          if (prof === 1) ultimoTexto = texto;
        } else if (prof === 1) texto += s[i];
        continue;
      }
      if (c === ASPAS) {
        emTexto = true;
        if (prof === 1) texto = '';
      } else if (prof === 1 && c === DOIS_PONTOS) {
        chave = ultimoTexto;
      } else if (prof === 1 && c === VIRGULA) {
        chave = null;
      } else if (c === ABRE_OBJ || c === ABRE_LISTA) {
        if (naLista && prof === 2) {
          partes = [];
          inicio = i;
        }
        prof++;
        if (prof === 2 && c === ABRE_LISTA && chave === campo) {
          naLista = true;
          achou = true;
        }
      } else if (c === FECHA_OBJ || c === FECHA_LISTA) {
        prof--;
        if (naLista && prof === 2 && partes) {
          partes.push(s.slice(inicio, i + 1));
          const item = JSON.parse(partes.join(''));
          partes = null;
          inicio = -1;
          yield item;
        } else if (naLista && prof === 1) {
          naLista = false;
        }
      }
    }
    if (partes && inicio >= 0) partes.push(s.slice(inicio));
  };

  for await (const bloco of corpo) yield* processar(decodificador.decode(bloco, { stream: true }));
  yield* processar(decodificador.decode());
  if (!achou) throw new Error(`A resposta não trouxe a lista "${campo}".`);
}

module.exports = { itensDoCampo };
