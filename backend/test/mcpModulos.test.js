// Módulos do conector Horizon (Integrações > MCP) — `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/config/telas');
const { normalizarModulos, modulosDoUsuario } = require('../src/modules/integracoes-mcp/modulos');

test('Altera Orçamento inclui o DFC; códigos inválidos saem; ordem do catálogo', () => {
  assert.deepStrictEqual(normalizarModulos(['SALDOS_CONTAS', 'DFC_ORCAMENTO', 'XYZ']), ['DFC', 'DFC_ORCAMENTO', 'SALDOS_CONTAS']);
  assert.deepStrictEqual(normalizarModulos([]), []);
});

test('cada usuário recebe só os módulos das telas que tem; MASTER recebe todos', () => {
  const conector = ['DFC_ORCAMENTO', 'SALDOS_CONTAS'];
  assert.deepStrictEqual(modulosDoUsuario({ permissao: 'MASTER', telas_permitidas: [] }, conector), ['DFC', 'DFC_ORCAMENTO', 'SALDOS_CONTAS']);
  assert.deepStrictEqual(modulosDoUsuario({ permissao: 'BASICO', telas_permitidas: [T.SALDOS] }, conector), ['SALDOS_CONTAS']);
  assert.deepStrictEqual(modulosDoUsuario({ permissao: 'BASICO', telas_permitidas: [T.DFC] }, conector), ['DFC', 'DFC_ORCAMENTO']);
  assert.deepStrictEqual(modulosDoUsuario({ permissao: 'BASICO', telas_permitidas: [] }, conector), []);
});
