// Site do Horizon Finanças — liga as cenas. O texto já está no HTML; aqui entram as telas do produto
// (geradas com o motor real), a coreografia de rolagem e as interações. Só a abertura e a barra de abas
// rodam no carregamento; cada tela é montada (e o GSAP baixado) quando está perto de aparecer.
import { hojeBrasilia } from './dados/empresa-demo.js';
import { iniciarAbas } from './nucleo/abas.js';
import { montar, quandoPerto } from './nucleo/cenas.js';
import { montarAbertura } from './cenas/abertura.js';

// ?hoje=AAAA-MM-DD fixa a data (capturas de tela); senão, hoje em Brasília.
const parametros = new URLSearchParams(location.search);
const hoje = /^\d{4}-\d{2}-\d{2}$/.test(parametros.get('hoje') || '') ? parametros.get('hoje') : hojeBrasilia();
const ctx = { hoje };
const el = (sel) => document.querySelector(sel);

// Tudo começa depois do primeiro quadro desenhado: o primeiro layout da página (caro, é uma página longa)
// acontece antes, sem disputar com o JavaScript.
function iniciar() {
  montarAbertura();
  iniciarAbas();

  quandoPerto(el('[data-queda]'), () =>
    montar('painel', async () => {
      const [{ montarPainel }, { montarQueda }] = await Promise.all([import('./cenas/painel.js'), import('./cenas/queda.js')]);
      const painel = montarPainel(el('[data-painel]'), ctx);
      montarQueda(el('[data-queda]'), { painel });
    })
  );
  quandoPerto(el('[data-folego]'), () => montar('folego', async () => (await import('./cenas/painel.js')).montarFolego(el('[data-folego]'), ctx)));
  quandoPerto(el('#custo'), () => montar('custo', async () => (await import('./cenas/custo.js')).montarCusto(el('#custo'))));
  quandoPerto(el('[data-dre]'), () => montar('dre', async () => (await import('./cenas/dre.js')).montarDre(el('[data-dre]'), ctx)));
  quandoPerto(el('[data-orcamento]'), () => montar('orcamento', async () => (await import('./cenas/orcamento.js')).montarOrcamento(el('[data-orcamento]'), ctx)));
  quandoPerto(el('[data-simulador]'), () => montar('simulador', async () => (await import('./cenas/simulador.js')).montarSimulador(el('[data-simulador]'), ctx)));
  quandoPerto(el('[data-cena="dia"]'), () => montar('dia', async () => (await import('./cenas/dia.js')).montarDia(el('[data-cena="dia"]'), ctx)));
  quandoPerto(el('[data-cena="ia"]'), () => montar('ia', async () => (await import('./cenas/ia.js')).montarIa(el('[data-cena="ia"]'), ctx)));
  quandoPerto(el('[data-monitor]'), () => montar('integracoes', async () => (await import('./cenas/integracoes.js')).montarIntegracoes(el('[data-monitor]'))));
  quandoPerto(el('#nao-mexer'), () => montar('final', async () => (await import('./cenas/final.js')).montarFinal(el('#nao-mexer'))));
}
requestAnimationFrame(() => setTimeout(iniciar, 0));

if (parametros.has('captura')) window.__site = { ...(window.__site || {}), hoje };
