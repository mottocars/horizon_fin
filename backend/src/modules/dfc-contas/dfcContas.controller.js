const { z } = require('zod');
const service = require('./dfcContas.service');
const { carimbar } = require('../dfc-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const companyIdSchema = z.coerce.number().int().positive('Empresa da conta inválida.');
const numeroContaSchema = z.string().trim().min(1, 'Conta inválida.').max(20, 'Conta inválida.');
const updateSchema = z.object({ projeta_dfc: z.boolean({ required_error: 'Informe o Projeta DFC.' }) });

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    res.json(await service.list(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const companyId = companyIdSchema.parse(req.params.companyId);
    const numeroConta = numeroContaSchema.parse(req.params.numeroConta);
    const salvo = await service.update(empresaId, companyId, numeroConta, updateSchema.parse(req.body));
    // Versões da DFC: o carimbo (aba Versões › Contas).
    await carimbar(req, {
      descricao: `Conta bancária ${numeroConta}${salvo.nome ? ` - ${salvo.nome}` : ''}${salvo.company_name ? ` (${salvo.company_name})` : ''}: Projeta DFC ${
        salvo.projeta_dfc ? 'marcado' : 'desmarcado'
      }.`,
      detalhes: { company_id: companyId, numero_conta: numeroConta, projeta_dfc: salvo.projeta_dfc },
      chave: `conta:${companyId}:${numeroConta}`,
    });
    res.json(salvo);
  } catch (err) {
    tratar(err, next);
  }
}

async function sincronizar(req, res, next) {
  try {
    res.json(await service.sincronizar(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

const configSaldoSchema = z.object({
  tipo_saldo: z.enum(['ERP', 'HORIZON'], { errorMap: () => ({ message: 'Escolha o tipo de saldo das contas.' }) }),
  soma_liberado: z.boolean(),
  soma_cheque: z.boolean(),
  soma_bloqueado: z.boolean(),
});

async function getConfigSaldo(req, res, next) {
  try {
    res.json(await service.getConfigSaldo(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

const NOME_TIPO = { ERP: 'Sistema ERP', HORIZON: 'Saldo das Contas Horizon' };

async function salvarConfigSaldo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dados = configSaldoSchema.parse(req.body);
    if (dados.tipo_saldo === 'HORIZON' && !dados.soma_liberado && !dados.soma_cheque && !dados.soma_bloqueado) {
      throw erro(400, 'Marque ao menos uma parte do saldo (Liberado, Cheque especial ou Bloqueado).');
    }
    const { antes, depois } = await service.salvarConfigSaldo(empresaId, req.user.id, dados);
    const partes = [depois.soma_liberado && 'Liberado', depois.soma_cheque && 'Cheque especial', depois.soma_bloqueado && 'Bloqueado'].filter(Boolean);
    // Versões da DFC: o carimbo (aba Versões › Contas).
    await carimbar(req, {
      descricao: `Configuração do saldo: ${NOME_TIPO[antes.tipo_saldo]} → ${NOME_TIPO[depois.tipo_saldo]}${
        depois.tipo_saldo === 'HORIZON' ? ` (soma ${partes.join(' + ')})` : ''
      }.`,
      detalhes: { antes, depois: { ...dados } },
      chave: 'config-saldo',
    });
    res.json(depois);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, sincronizar, getConfigSaldo, salvarConfigSaldo };
