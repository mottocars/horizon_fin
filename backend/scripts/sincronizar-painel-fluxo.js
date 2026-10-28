#!/usr/bin/env node
// Gera a cópia do servidor (CommonJS) dos cálculos e textos dos painéis do dashboard Econômico
// Financeiro, a partir da fonte única no frontend:
//   Fluxo de Caixa: frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/{modelo,analise,sumarioTexto}.js
//                   -> backend/src/modules/dashboards/painelFluxo/  (ferramenta dfc_painel_fluxo_caixa do MCP)
//   Aging List:     frontend/src/pages/Dashboards/EconomicoFinanceiro/aging/{modelo,sumarioTexto}.js
//                   -> backend/src/modules/dashboards/painelAging/  (ferramentas aging_* do MCP)
// Assim a tela e o MCP calculam e explicam exatamente igual.
// (O backend e o frontend são imagens Docker separadas, por isso a cópia em vez de um import.)
//
// Uso:  node backend/scripts/sincronizar-painel-fluxo.js            (gera)
//       node backend/scripts/sincronizar-painel-fluxo.js --verificar (só confere; sai com erro se divergir)
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const TELAS = 'frontend/src/pages/Dashboards/EconomicoFinanceiro';
// `imports`: caminho do import na tela -> caminho do require na cópia.
const GRUPOS = [
  { pasta: 'fluxo', destino: 'painelFluxo', arquivos: ['modelo.js', 'analise.js', 'sumarioTexto.js'], imports: {} },
  { pasta: 'aging', destino: 'painelAging', arquivos: ['modelo.js', 'sumarioTexto.js'], imports: { '../fluxo/modelo': '../painelFluxo/modelo' } },
];

function converter(fonte, nome, grupo) {
  const exportados = [];
  let s = fonte
    // import { a, b as c } from './x';  ->  const { a, b: c } = require('./x');
    .replace(/^import\s*\{([^}]+)\}\s*from\s*'(\.\.?\/[^']+)';$/gm, (_, nomes, de) => {
      const lista = nomes
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '));
      return `const { ${lista.join(', ')} } = require('${grupo.imports[de] || de}');`;
    })
    // export { a, b };  (repassa o que veio de outro arquivo)  ->  só entra no module.exports
    .replace(/^export\s*\{([^}]+)\};\n/gm, (_, nomes) => {
      exportados.push(...nomes.split(',').map((n) => n.trim()).filter(Boolean));
      return '';
    })
    .replace(/^export (async function|function|const|let) (\w+)/gm, (_, tipo, n) => {
      exportados.push(n);
      return `${tipo} ${n}`;
    });
  if (/^\s*(import|export)\s/m.test(s)) throw new Error(`${nome}: sobrou import/export que o conversor não entende.`);
  if (/require\('\.\.\/(?!painel)/.test(s)) throw new Error(`${nome}: import de fora da pasta sem mapeamento em GRUPOS.imports.`);
  const cabecalho =
    `// GERADO por backend/scripts/sincronizar-painel-fluxo.js a partir de\n` +
    `// ${TELAS}/${grupo.pasta}/${nome} — NÃO EDITE AQUI: edite lá e rode o script.\n`;
  return `${cabecalho}${s.trimEnd()}\n\nmodule.exports = { ${exportados.join(', ')} };\n`;
}

const verificar = process.argv.includes('--verificar');
let divergente = false;
for (const grupo of GRUPOS) {
  const origem = path.join(RAIZ, TELAS, grupo.pasta);
  const destino = path.join(RAIZ, 'backend/src/modules/dashboards', grupo.destino);
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of grupo.arquivos) {
    const gerado = converter(fs.readFileSync(path.join(origem, nome), 'utf8').replace(/\r\n/g, '\n'), nome, grupo);
    const alvo = path.join(destino, nome);
    const rotulo = `${grupo.destino}/${nome}`;
    const atual = fs.existsSync(alvo) ? fs.readFileSync(alvo, 'utf8').replace(/\r\n/g, '\n') : null;
    if (atual === gerado) {
      console.log(`ok          ${rotulo}`);
      continue;
    }
    if (verificar) {
      divergente = true;
      console.log(`DIVERGENTE  ${rotulo} — rode: node backend/scripts/sincronizar-painel-fluxo.js`);
    } else {
      fs.writeFileSync(alvo, gerado);
      console.log(`gerado      ${rotulo}`);
    }
  }
}
if (divergente) process.exit(1);
