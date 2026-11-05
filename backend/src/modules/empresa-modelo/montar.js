const C = require('./config');
const K = require('./clonador');
const O = require('./operacional');
const S = require('./sintese');

// ---------------------------------------------------------------------------------------
// Orquestra a montagem da empresa modelo. Recebe um client já em transação (BEGIN feito por
// quem chama) e só escreve na empresa modelo e na equipe fictícia.
// ---------------------------------------------------------------------------------------

async function montarEmpresaModelo(client, { log = () => {}, etapas = null, ensaio = false } = {}) {
  const inicio = Date.now();
  const { rows: o } = await client.query('SELECT id FROM empresas WHERE cnpj = $1', [C.CNPJ_ORIGEM]);
  if (!o[0]) throw new Error(`Empresa de origem (CNPJ ${C.CNPJ_ORIGEM}) não encontrada.`);
  const origem = o[0].id;

  const modelo = await K.garantirEmpresaModelo(client);
  if (modelo === origem) throw new Error('A empresa modelo não pode ser a empresa de origem.');
  const equipe = await K.garantirEquipe(client, modelo);

  const meta = await new K.Metadados(client).carregar();
  const mapas = new K.Mapas();
  const ctx = {
    client,
    meta,
    mapas,
    origem,
    modelo,
    empresaModelo: modelo,
    equipe,
    log,
    ensaio,
    // usuário real da origem → alguém da equipe fictícia (rodízio determinístico)
    usuario: (idAntigo) => equipe[Math.abs(Number(idAntigo) || 0) % equipe.length],
  };
  log(`Origem: empresa ${origem} · Modelo: empresa ${modelo} · Equipe: ${equipe.join(', ')}`);

  await K.prepararDicionarios(ctx);
  log('Limpando a empresa modelo…');
  await K.limparEmpresaModelo(ctx);

  const passos = [
    ['cadastros', K.copiarCadastros],
    ['clientes', K.copiarClientes],
    ['credores', K.copiarCredores],
    ['financeiro', K.copiarFinanceiro],
    ['vendas', K.copiarVendas],
    ['planejamento', K.copiarPlanejamento],
    ['integracoes', O.criarIntegracoes],
    ['contas', O.prepararContas],
    ['espiao', O.copiarEspiao],
    ['cronograma', O.copiarCronogramaEMonitor],
    ['saldos', S.sintetizarSaldos],
    ['cobranca', S.sintetizarCobranca],
    ['repasses', S.sintetizarRepasses],
    ['planovoo', S.sintetizarPlanoDeVoo],
  ];
  for (const [nome, fn] of passos) {
    if (etapas && !etapas.includes(nome)) continue;
    await fn(ctx);
  }
  log(`Montagem concluída em ${((Date.now() - inicio) / 1000).toFixed(1)} s.`);
  return { origem, modelo, equipe, ctx };
}

module.exports = { montarEmpresaModelo };
