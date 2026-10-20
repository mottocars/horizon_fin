#!/usr/bin/env node
// Copia do app (frontend/) para o site o que o site reaproveita, para o simulador e o painel da página
// rodarem o MESMO motor de cálculo do painel do Fluxo de Caixa do Horizon:
//   frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/{modelo,analise}.js -> site/src/motor/
//   frontend/public/{logomarca,favicon}.svg                                      -> site/public/marca/
//   frontend/src/assets/integracoes/*.svg (lista abaixo)                          -> site/src/assets/integracoes/
// O site é outra imagem Docker (contexto ./site), por isso a cópia em vez de um import — mesma regra de
// backend/scripts/sincronizar-painel-fluxo.js. Única transformação nos .js: o import relativo ganha a
// extensão ".js" (exigência do ESM no Node, usado por scripts/testar-motor.mjs).
//
// Uso:  node scripts/sincronizar-do-app.mjs                     (gera)
//       node scripts/sincronizar-do-app.mjs --verificar         (só confere; sai com erro se divergir)
//       ... --verificar --tolerar-ausente                       (sem frontend/ — build no Docker — só avisa)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = path.resolve(SITE, '..');
const FRONT = path.join(RAIZ, 'frontend');

const MOTOR = ['modelo.js', 'analise.js'];
const INTEGRACOES = ['sienge', 'itau', 'prevision', 'construtor-vendas', 'portal-construtoras', 'zapi', 'mcp', 'email', 'certificados-digitais'];

const itens = [
  ...MOTOR.map((nome) => ({
    de: path.join(FRONT, 'src/pages/Dashboards/EconomicoFinanceiro/fluxo', nome),
    para: path.join(SITE, 'src/motor', nome),
    texto: true,
    transformar: (s) =>
      `// GERADO por site/scripts/sincronizar-do-app.mjs a partir de\n` +
      `// frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/${nome} — NÃO EDITE AQUI: edite lá e rode o script.\n` +
      s.replace(/^(import\s*\{[^}]+\}\s*from\s*'\.\/[^'.]+)';$/gm, "$1.js';"),
  })),
  { de: path.join(FRONT, 'public/logomarca.svg'), para: path.join(SITE, 'public/marca/logomarca.svg') },
  { de: path.join(FRONT, 'public/favicon.svg'), para: path.join(SITE, 'public/favicon.svg') },
  ...INTEGRACOES.map((n) => ({
    de: path.join(FRONT, 'src/assets/integracoes', `${n}.svg`),
    para: path.join(SITE, 'src/assets/integracoes', `${n}.svg`),
  })),
];

const verificar = process.argv.includes('--verificar');
const tolerarAusente = process.argv.includes('--tolerar-ausente');

if (!fs.existsSync(FRONT)) {
  if (tolerarAusente) {
    console.log('frontend/ não existe aqui (build isolado do site) — usando as cópias já commitadas.');
    process.exit(0);
  }
  console.error('frontend/ não encontrado — rode a partir do repositório completo.');
  process.exit(1);
}

let divergente = false;
for (const it of itens) {
  const bruto = fs.readFileSync(it.de);
  const gerado = it.transformar ? it.transformar(bruto.toString('utf8').replace(/\r\n/g, '\n')) : bruto;
  const atual = fs.existsSync(it.para) ? fs.readFileSync(it.para) : null;
  const igual = atual && (it.transformar ? atual.toString('utf8').replace(/\r\n/g, '\n') === gerado : atual.equals(gerado));
  const rel = path.relative(SITE, it.para).replace(/\\/g, '/');
  if (igual) {
    console.log(`ok          ${rel}`);
    continue;
  }
  if (verificar) {
    divergente = true;
    console.log(`DIVERGENTE  ${rel} — rode: npm run sincronizar (em site/)`);
  } else {
    fs.mkdirSync(path.dirname(it.para), { recursive: true });
    fs.writeFileSync(it.para, gerado);
    console.log(`gerado      ${rel}`);
  }
}
if (divergente) process.exit(1);
