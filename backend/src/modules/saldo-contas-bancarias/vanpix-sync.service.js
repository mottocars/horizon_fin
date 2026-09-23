// Ao abrir um período de saldo, busca automaticamente na VanPix o saldo final das contas
// que já têm banco/conta/dígito cadastrados (contas_bancarias_sienge.banco_enriquecido +
// conta_enriquecida + digito) e grava direto em saldos_contas_bancarias — sem exigir digitação
// manual pra quem já tem a integração configurada.
//
// Relação de datas (confirmada com o usuário testando ao vivo): pedir o retorno da VanPix com
// data_pesquisa = D+1 traz o saldo FINAL do dia D (o extrato da CAIXA "fecha" o dia seguinte).
// Por isso, pra plotar o saldo do dia `data` (o período sendo aberto), consultamos a VanPix
// com `data + 1 dia`.
const pool = require('../../config/db');
const vanpixService = require('../integracoes-vanpix/vanpix.service');
const saldosService = require('./saldos.service');

function addDiaISO(iso) {
  const d = new Date(`${iso}T12:00:00Z`); // meio-dia UTC evita virar o dia errado por fuso
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function paraDDMMYYYY(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${ano}`;
}

async function listarVanpixAtivasDaEmpresa(empresaId) {
  const { rows } = await pool.query('SELECT id FROM integracoes_vanpix WHERE empresa_id = $1 AND ativo = TRUE', [
    empresaId,
  ]);
  return rows;
}

// Mesmo critério de "banco efetivo" usado no resto do módulo de saldos (banco_enriquecido
// prevalece sobre o código bruto do Sienge).
async function buscarContasCorrespondentes(empresaId, banco, conta, digitoConta) {
  const { rows } = await pool.query(
    `SELECT company_id, numero_conta
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1
       AND conta_enriquecida = $2
       AND digito = $3
       AND COALESCE(NULLIF(banco_enriquecido, ''), REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g')) = $4`,
    [empresaId, conta, digitoConta, banco]
  );
  return rows;
}

// Roda todos os convênios VanPix ativos da empresa pra `data`, casa cada conta encontrada no
// retorno com o cadastro (banco+conta+dígito) e grava o saldo automaticamente. Não lança
// exceção por causa de UM convênio com problema — cada um é reportado individualmente; só
// propaga erro se a própria gravação em lote falhar (ex.: período fechado por outra aba).
async function buscarSaldosVanpix(empresaId, usuarioId, data) {
  const dataPesquisa = paraDDMMYYYY(addDiaISO(data));
  const integracoes = await listarVanpixAtivasDaEmpresa(empresaId);

  const relatorio = { convenios: [], atualizados: [], semCorrespondencia: [] };
  if (integracoes.length === 0) return relatorio;

  const itensParaGravar = [];

  for (const integracao of integracoes) {
    const cred = await vanpixService.getCredenciais(integracao.id);
    if (!cred || !cred.ativo || cred.apelidos.length === 0) continue;

    for (const apelido of cred.apelidos) {
      const resultado = await vanpixService.buscarRetorno(cred.serviceKey, cred.clientSecret, apelido, dataPesquisa);
      relatorio.convenios.push({ apelido, status: resultado.status, mensagem: resultado.mensagem });
      if (resultado.status !== 'ok_com_retorno') continue;

      for (const lote of resultado.lotes) {
        if (lote.saldoFinal.data !== data) continue; // arquivo trouxe saldo de outro dia — ignora

        const contas = await buscarContasCorrespondentes(empresaId, lote.banco, lote.conta, lote.digitoConta);
        if (contas.length === 0) {
          relatorio.semCorrespondencia.push({ apelido, banco: lote.banco, conta: lote.conta, digito: lote.digitoConta });
          continue;
        }

        const valor = Math.round(lote.saldoFinal.valorCentavos * (lote.saldoFinal.situacao === 'D' ? -1 : 1)) / 100;
        for (const conta of contas) {
          itensParaGravar.push({ company_id: conta.company_id, numero_conta: conta.numero_conta, data, saldo: valor });
          relatorio.atualizados.push({
            apelido,
            banco: lote.banco,
            conta: lote.conta,
            digito: lote.digitoConta,
            company_id: conta.company_id,
            numero_conta: conta.numero_conta,
            saldo: valor,
          });
        }
      }
    }
  }

  if (itensParaGravar.length > 0) {
    await saldosService.salvarSaldos(empresaId, usuarioId, itensParaGravar);
  }

  return relatorio;
}

module.exports = { buscarSaldosVanpix };
