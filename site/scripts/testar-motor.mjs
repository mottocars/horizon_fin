#!/usr/bin/env node
// Confere, no Node, que o Grupo Aurora passando pelo motor real conta a história que o site promete:
// mínimo do Orçamento acima do colchão, o "Estresse" rompe, alguma empresa zera sozinha, etc.
// Roda no prebuild — se o motor do app mudar e a história quebrar, o build para.
// Uso: node scripts/testar-motor.mjs [--hoje=AAAA-MM-DD] [--detalhar]
import { cenario, lbl, brl, PRESETS, obraMaiorEntrada } from '../src/motor/modelo.js';
import { calibracao } from '../src/motor/analise.js';
import { cartoesSite, folegoSite, obterD, pontoDeRuptura, rupturas } from '../src/dados/demo-calculado.js';

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const detalhar = process.argv.includes('--detalhar');
const datas = arg('hoje') ? [arg('hoje')] : [undefined, '2026-11-03', '2027-01-20', '2027-03-15', '2027-06-30'];

let falhas = 0;
const conferir = (ok, msg) => {
  if (!ok) falhas++;
  console.log(`${ok ? 'ok    ' : 'FALHA '} ${msg}`);
};
const serieDelay = (D) => D.centros.find((c) => /SERRA AZUL/i.test(c.nome))?.id ?? obraMaiorEntrada(D)?.id;

for (const hoje of datas) {
  const D = obterD({ hoje });
  console.log(`\n— hoje ${D.hoje} (m0 ${D.m0}) —`);
  conferir(!!D, 'modelo() devolveu o D');
  const soma = (a) => a.reduce((x, y) => x + y, 0);
  conferir(soma(D.overheadP) < 0 && soma(D.obraP) < 0 && soma(D.vendasP) > 0, 'séries de estrutura fixa, custos diretos e vendas não estão zeradas (máscaras casaram com o CFG)');
  conferir(soma(D.sociosR) + soma(D.sociosP) < 0, 'distribuição a sócios reconhecida');
  const base = cenario(D, { ...PRESETS.base, delayId: null });
  conferir(base.every((v, i) => Math.abs(v - D.saldoFut[i]) < 1), 'preset "Orçamento" = saldoFut do modelo');
  conferir(D.caixaHoje > D.colchao, `caixa hoje ${brl(D.caixaHoje)} acima do colchão ${brl(D.colchao)}`);
  conferir(D.minBase > D.colchao, `mínimo do Orçamento ${brl(D.minBase)} em ${lbl(D.fut[D.minIdx])} acima do colchão`);
  conferir(D.minBase < D.caixaHoje * 0.92, 'o Orçamento tem um vale visível (mínimo ao menos 8% abaixo de hoje)');
  const delayId = serieDelay(D);
  const est = cenario(D, { ...PRESETS.stress, delayId });
  const rEst = rupturas(D, est);
  conferir(rEst.colchao >= 0, `"Estresse" fura o colchão${rEst.colchao >= 0 ? ` em ${lbl(D.fut[rEst.colchao])}` : ''}`);
  const cons = cenario(D, { ...PRESETS.cons, delayId });
  const rCons = rupturas(D, cons);
  const f = folegoSite(D);
  conferir(f.zeram.length >= 1, `alguma empresa zera sozinha (${f.resumo.zeram}; primeira: ${f.resumo.primeira_a_zerar})`);
  const pr = pontoDeRuptura(D);
  conferir(pr !== null && pr >= 5 && pr <= 30, `ponto de ruptura plausível: queda de ${pr}% nas vendas`);
  if (detalhar) {
    console.log('  meses        ', D.fut.map(lbl).join('  '));
    console.log('  orçamento    ', base.map((v) => (v / 1e6).toFixed(1).padStart(6)).join(''));
    console.log('  conservador  ', cons.map((v) => (v / 1e6).toFixed(1).padStart(6)).join(''), rCons.colchao >= 0 ? `fura em ${lbl(D.fut[rCons.colchao])}` : 'não fura');
    console.log('  estresse     ', est.map((v) => (v / 1e6).toFixed(1).padStart(6)).join(''), rEst.zero >= 0 ? `zera em ${lbl(D.fut[rEst.zero])}` : '');
    console.log('  colchão', brl(D.colchao), '· overheadRun', brl(D.overheadRun));
    cartoesSite(D).forEach((c) => console.log('  card', c.titulo.padEnd(42), c.valor_fmt.padStart(14), c.etiqueta.texto, '|', c.detalhe.map((p) => (typeof p === 'string' ? p : p.b)).join('')));
    f.linhas.forEach((s) => console.log('  fôlego', s.nome.padEnd(24), brl(s.caixa).padStart(14), s.situacao.texto));
    calibracao(D).forEach((c) => console.log('  calib', c.nome.padEnd(32), c.dv.toFixed(1)));
  }
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nHistória do Grupo Aurora confere.');
process.exit(falhas ? 1 : 0);
