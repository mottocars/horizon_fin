const pool = require('../../config/db');
const itauService = require('../integracoes-itau/itau.service');
const { montarExtrato } = require('./extratos.calculo');

// Relatório Extratos Bancários (por enquanto só API Itaú). NADA é gravado: cada geração busca
// o extrato na hora, no Itaú, e devolve já montado (dias, saldo inicial/final, saldo após cada
// lançamento) — ver extratos.calculo.js. A busca começa alguns dias antes do período pedido só
// pra ter o fechamento do dia útil anterior (saldo inicial do primeiro dia, e base do dia de
// hoje, que ainda não tem fechamento); esses dias extras não aparecem no relatório.

const DIAS_ANTES_PARA_SALDO = 7;
const CONSULTAS_SIMULTANEAS = 4;

function menosDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

async function listarConexoes(empresaId, conexaoIds) {
  const params = [empresaId];
  let filtro = '';
  if (conexaoIds.length) {
    params.push(conexaoIds);
    filtro = `AND c.id = ANY($${params.length}::int[])`;
  }
  // Conta do cadastro (nome e empresa do Sienge) com a mesma agência/conta/dígito no Itaú.
  const { rows } = await pool.query(
    `SELECT c.id, c.nome, c.agencia, c.conta, c.dac,
            s.nome AS nome_cadastro, s.company_name AS empresa_conta
     FROM conexoes_itau c
     LEFT JOIN LATERAL (
       SELECT sc.nome, sc.company_name FROM contas_bancarias_sienge sc
       WHERE sc.empresa_id = c.empresa_id
         AND LTRIM(sc.agencia_enriquecida, '0') = LTRIM(c.agencia, '0')
         AND LTRIM(sc.conta_enriquecida, '0') = LTRIM(c.conta, '0')
         AND sc.digito = c.dac
       LIMIT 1
     ) s ON TRUE
     WHERE c.empresa_id = $1 AND c.ativo = TRUE AND c.certificado_pem IS NOT NULL
       AND c.agencia IS NOT NULL AND c.conta IS NOT NULL AND c.dac IS NOT NULL
       ${filtro}
     ORDER BY c.nome`,
    params
  );
  return rows;
}

async function gerarRelatorio(empresaId, { conexaoIds = [], dataInicio, dataFim }) {
  const conexoes = await listarConexoes(empresaId, conexaoIds);
  const janelaInicio = menosDias(dataInicio, DIAS_ANTES_PARA_SALDO);

  const resultados = new Array(conexoes.length);
  let proxima = 0;
  async function trabalhar() {
    while (proxima < conexoes.length) {
      const i = proxima++;
      const c = conexoes[i];
      const base = {
        conexaoId: c.id,
        conexao: c.nome,
        banco: { codigo: '341', nome: 'Itaú Unibanco' },
        agencia: c.agencia,
        conta: c.conta,
        dac: c.dac,
        nomeCadastro: c.nome_cadastro || null,
        empresaConta: c.empresa_conta || null,
      };
      const r = await itauService.buscarExtratoPeriodo(c.id, janelaInicio, dataFim);
      resultados[i] = r.ok
        ? { ...base, status: 'ok', ...montarExtrato({ eventos: r.eventos, saldos: r.saldos, dataInicio, dataFim }) }
        : { ...base, status: 'erro', mensagem: r.mensagem, dias: [] };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONSULTAS_SIMULTANEAS, conexoes.length) }, trabalhar));

  return { dataInicio, dataFim, geradoEm: new Date().toISOString(), contas: resultados };
}

module.exports = { gerarRelatorio };
