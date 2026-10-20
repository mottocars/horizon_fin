// Conversa com a IA consultando o Horizon pelo conector MCP. As respostas saem do motor sobre o Grupo
// Aurora — os mesmos números do painel e do simulador desta página. Toca uma vez, quando aparece; a
// transcrição completa fica no HTML (oculta) para leitores de tela.
import { brl, cenario, curto, lbl, pct, PRESETS } from '../motor/modelo.js';
import { calibracao } from '../motor/analise.js';
import { folegoSite, obterD, pontoDeRuptura, rupturas } from '../dados/demo-calculado.js';
import { esc, mesPorExtenso, nomeLinha } from '../nucleo/dom.js';
import { reduzir } from '../nucleo/preferencias.js';
import { registrarCena } from '../nucleo/cenas.js';

// Texto com **negrito** -> palavras em <span> (para aparecerem uma a uma), negrito preservado.
function palavras(txt) {
  return txt
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((parte) => {
      const forte = parte.startsWith('**');
      const limpo = forte ? parte.slice(2, -2) : parte;
      const ws = limpo.split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : `<span class="p">${esc(w)}</span>`)).join('');
      return forte ? `<b>${ws}</b>` : ws;
    })
    .join('');
}
const semMarcas = (t) => t.replace(/\*\*/g, '');

export function montarIa(raiz, { hoje }) {
  const chat = raiz.querySelector('[data-chat]');
  const transcricao = raiz.querySelector('[data-chat-transcricao]');
  const D = obterD({ hoje });
  const f = folegoSite(D);
  const zera = f.zeram[0];
  const s10 = cenario(D, { ...PRESETS.base, vendas: 10, delayId: null });
  const r10 = rupturas(D, s10);
  const mn10 = Math.min(...s10);
  const pr = pontoDeRuptura(D);
  const calib = calibracao(D).find((c) => c.lado === 'sai' && c.ruim);

  const roteiro = [
    { tipo: 'eu', texto: 'Como está o caixa do grupo?' },
    { tipo: 'ferramenta', texto: 'Consultando o Horizon: painel do fluxo de caixa' },
    {
      tipo: 'ia',
      texto:
        `O caixa consolidado hoje é de **${brl(D.caixaHoje)}**. Pelo orçamento, ele desce até **${brl(D.minBase)} em ${lbl(D.fut[D.minIdx])}** e depois volta a subir, ` +
        `sempre acima do colchão de ${brl(D.colchao)}.` +
        (zera ? ` Um ponto de atenção: a **${curto(zera.nome)}** zera o próprio caixa em **${lbl(zera.zera)}** se não receber dinheiro das outras empresas.` : ''),
    },
    { tipo: 'eu', texto: 'E se as vendas caírem 10%?' },
    { tipo: 'ferramenta', texto: 'Rodando o simulador de cenário' },
    {
      tipo: 'ia',
      texto:
        (r10.colchao >= 0
          ? `Com vendas 10% menores, o caixa fura o colchão em **${lbl(D.fut[r10.colchao])}** e chega a **${brl(mn10)}** no pior mês.`
          : `Com vendas 10% menores, o caixa chega a **${brl(mn10)}** no pior mês, ainda acima do colchão.`) +
        (pr ? ` O ponto de ruptura é uma queda de **${pr}%**: a partir dela, o colchão não aguenta o horizonte inteiro.` : ''),
    },
    { tipo: 'eu', texto: 'Monta o resumo para a reunião de diretoria.' },
    { tipo: 'ferramenta', texto: 'Lendo fôlego das empresas e orçamento × realizado' },
    {
      tipo: 'doc',
      titulo: `Resumo para a diretoria, ${mesPorExtenso(D.m0)}`,
      itens: [
        `Caixa de ${brl(D.caixaHoje)}; mínimo de ${brl(D.minBase)} em ${lbl(D.fut[D.minIdx])}.`,
        zera ? `${curto(zera.nome)} precisa de reforço de caixa até ${lbl(zera.zera)}.` : 'Nenhuma empresa zera sozinha no horizonte.',
        calib ? `${nomeLinha(calib.nome)}: ${pct(calib.dv, true)} acima do orçado nos últimos ${D.hist.length} meses.` : 'Orçamento aderente ao realizado.',
        pr ? `Ponto de ruptura: queda de ${pr}% nas vendas.` : '',
      ].filter(Boolean),
    },
  ];

  const html = (m) => {
    if (m.tipo === 'eu') return `<div class="msg msg--eu">${esc(m.texto)}</div>`;
    if (m.tipo === 'ferramenta') return `<div class="msg msg--ferramenta"><i></i>${esc(m.texto)}</div>`;
    if (m.tipo === 'ia') return `<div class="msg msg--ia">${palavras(m.texto)}</div>`;
    return `<div class="msg msg--doc"><span class="anexo" style="box-shadow:none;padding:0"><i class="pdf">DOC</i></span><span><b>${esc(m.titulo)}</b><ul>${m.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></span></div>`;
  };

  chat.innerHTML = `<div class="chat__cab"><span class="chat__pontinho"></span><b>Claude</b><span>com o conector do Horizon Finanças</span></div>
    <div class="chat__msgs" data-msgs>${roteiro.map(html).join('')}</div>
    <div class="chat__entrada"><span>Pergunte sobre o financeiro do grupo…</span><i></i></div>`;
  transcricao.innerHTML = `<p>Exemplo de conversa:</p>${roteiro
    .map((m) => `<p>${m.tipo === 'eu' ? 'Diretor' : m.tipo === 'ferramenta' ? 'IA consulta o Horizon' : 'IA'}: ${esc(m.tipo === 'doc' ? `${m.titulo}. ${m.itens.join(' ')}` : semMarcas(m.texto))}</p>`)
    .join('')}`;

  const caixa = chat.querySelector('[data-msgs]');
  const msgs = [...caixa.children];
  let tocou = false;

  function tocar() {
    const t = [];
    const depois = (ms, fn) => t.push(setTimeout(fn, ms));
    msgs.forEach((m) => (m.style.display = 'none'));
    let ms = 300;
    const rolar = () => (caixa.scrollTop = caixa.scrollHeight);
    roteiro.forEach((r, i) => {
      const el = msgs[i];
      if (r.tipo === 'eu') {
        depois(ms, () => {
          el.style.display = '';
          rolar();
        });
        ms += 700;
      } else if (r.tipo === 'ferramenta') {
        depois(ms, () => {
          el.style.display = '';
          el.classList.add('rodando');
          rolar();
        });
        ms += 1100;
        depois(ms, () => {
          el.classList.remove('rodando');
          el.classList.add('feita');
        });
        ms += 200;
      } else if (r.tipo === 'ia') {
        const ps = [...el.querySelectorAll('.p')];
        ps.forEach((p) => (p.style.opacity = '0'));
        depois(ms, () => {
          el.style.display = '';
          rolar();
        });
        ps.forEach((p, k) =>
          depois(ms + k * 38, () => {
            p.style.opacity = '';
            if (k % 8 === 0) rolar();
          })
        );
        ms += ps.length * 38 + 900;
      } else {
        depois(ms, () => {
          el.style.display = '';
          rolar();
        });
        ms += 600;
      }
    });
    return () => t.forEach(clearTimeout);
  }

  registrarCena(chat, {
    entrar() {
      if (tocou || reduzir()) return;
      tocou = true;
      tocar();
    },
  });
}
