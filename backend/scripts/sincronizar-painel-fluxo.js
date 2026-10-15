#!/usr/bin/env node
// Gera a cópia do servidor (CommonJS) dos cálculos e textos do painel do Fluxo de Caixa
// (dashboard Econômico Financeiro), a partir da fonte única no frontend:
//   frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/{modelo,analise,sumarioTexto}.js
//   -> backend/src/modules/dashboards/painelFluxo/{modelo,analise,sumarioTexto}.js
// Assim a tela e a ferramenta dfc_painel_fluxo_caixa do MCP calculam e explicam exatamente igual.
// (O backend e o frontend são imagens Docker separadas, por isso a cópia em vez de um import.)
//
// Uso:  node backend/scripts/sincronizar-painel-fluxo.js            (gera)
//       node backend/scripts/sincronizar-painel-fluxo.js --verificar (só confere; sai com erro se divergir)
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const ORIGEM = path.join(RAIZ, 'frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo');
const DESTINO = path.join(RAIZ, 'backend/src/modules/dashboards/painelFluxo');
const ARQUIVOS = ['modelo.js', 'analise.js', 'sumarioTexto.js'];

function converter(fonte, nome) {
  const exportados = [];
  let s = fonte
    // import { a, b as c } from './x';  ->  const { a, b: c } = require('./x');
    .replace(/^import\s*\{([^}]+)\}\s*from\s*'(\.\/[^']+)';$/gm, (_, nomes, de) => {
      const lista = nomes
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '));
      return `const { ${lista.join(', ')} } = require('${de}');`;
    })
    .replace(/^export (async function|function|const|let) (\w+)/gm, (_, tipo, n) => {
      exportados.push(n);
      return `${tipo} ${n}`;
    });
  if (/^\s*(import|export)\s/m.test(s)) throw new Error(`${nome}: sobrou import/export que o conversor não entende.`);
  const cabecalho =
    `// GERADO por backend/scripts/sincronizar-painel-fluxo.js a partir de\n` +
    `// frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/${nome} — NÃO EDITE AQUI: edite lá e rode o script.\n`;
  return `${cabecalho}${s.trimEnd()}\n\nmodule.exports = { ${exportados.join(', ')} };\n`;
}

const verificar = process.argv.includes('--verificar');
let divergente = false;
fs.mkdirSync(DESTINO, { recursive: true });
for (const nome of ARQUIVOS) {
  const gerado = converter(fs.readFileSync(path.join(ORIGEM, nome), 'utf8').replace(/\r\n/g, '\n'), nome);
  const alvo = path.join(DESTINO, nome);
  const atual = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8').replace(/\r\n/g, '\n') : null;
  if (atual === gerado) {
    console.log(`ok          ${nome}`);
    continue;
  }
  if (verificar) {
    divergente = true;
    console.log(`DIVERGENTE  ${nome} — rode: node backend/scripts/sincronizar-painel-fluxo.js`);
  } else {
    fs.writeFileSync(alvo, gerado);
    console.log(`gerado      ${nome}`);
  }
}
if (divergente) process.exit(1);
