// Telas do "dia no financeiro". Cada uma: html(ctx) e animar(el) -> parar(). Com movimento reduzido, a cena
// não chama animar(): o html já é o estado final.
import { addM, lbl } from '../motor/modelo.js';
import { obterD } from '../dados/demo-calculado.js';
import { barraJanela, dataBR, esc } from '../nucleo/dom.js';

const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (v) => `R$ ${nf2.format(v)}`;

function agenda() {
  const t = [];
  return {
    depois: (ms, fn) => t.push(setTimeout(fn, ms)),
    parar: () => t.splice(0).forEach(clearTimeout),
  };
}

// ─── 06:00 Monitor de Integrações ────────────────────────────────────────────────────────────────
const ROTINAS = [
  ['Sienge', 'Contas a pagar', '1.284 títulos, 12 novos'],
  ['Sienge', 'Contas a receber', '3.902 parcelas'],
  ['Itaú', 'Extrato e saldo', '3 contas'],
  ['VanPix', 'Extrato Pix', '418 lançamentos'],
  ['SEFAZ', 'NF-e e NFS-e', '23 notas'],
];
export const monitor = {
  html: () => `${barraJanela(['Integrações', 'Monitor de Integrações'], { usuario: false })}
    <div class="mock monitor-mock">
      <div class="mock__cab"><h3 class="mock__titulo">Monitor de Integrações</h3><span class="mock__sub">rotina diária · 06:00 (Brasília)</span></div>
      ${ROTINAS.map(([s, r, res]) => `<div class="rotina"><span><b>${s} · ${r}</b><small data-res>${res}</small></span><span class="progresso feito"><i style="--p:100%"></i></span><span class="st good" data-st>ok</span></div>`).join('')}
      <div class="log" data-log>${ROTINAS.map(([s, r, res], i) => `<p>06:0${i}:1${i} <b>ok</b> ${s} ${r.toLowerCase()}: ${res}</p>`).join('')}</div>
    </div>`,
  animar(el) {
    const a = agenda();
    const linhas = [...el.querySelectorAll('.rotina')];
    const log = el.querySelector('[data-log]');
    const ciclo = () => {
      log.innerHTML = '';
      linhas.forEach((l) => {
        l.querySelector('.progresso').classList.remove('feito');
        l.querySelector('i').style.setProperty('--p', '0%');
        const st = l.querySelector('[data-st]');
        st.className = 'st info';
        st.textContent = 'na fila';
      });
      linhas.forEach((l, i) => {
        const [s, r, res] = ROTINAS[i];
        const t0 = 400 + i * 1300;
        a.depois(t0, () => {
          const st = l.querySelector('[data-st]');
          st.textContent = 'rodando';
          log.insertAdjacentHTML('beforeend', `<p>06:0${i}:0${i} iniciando ${s} ${r.toLowerCase()}…</p>`);
        });
        [35, 70, 100].forEach((p, k) => a.depois(t0 + 300 + k * 330, () => l.querySelector('i').style.setProperty('--p', `${p}%`)));
        a.depois(t0 + 1250, () => {
          l.querySelector('.progresso').classList.add('feito');
          const st = l.querySelector('[data-st]');
          st.className = 'st good';
          st.textContent = 'ok';
          log.insertAdjacentHTML('beforeend', `<p>06:0${i}:1${i} <b>ok</b> ${s} ${r.toLowerCase()}: ${res}</p>`);
          while (log.children.length > 6) log.firstElementChild.remove();
        });
      });
      a.depois(400 + linhas.length * 1300 + 3200, ciclo);
    };
    ciclo();
    return a.parar;
  },
};

// ─── 07:30 Saldo das contas no WhatsApp da diretoria (formato do comunicarSaldos.service.js) ──────
export const saldos = {
  html: ({ hoje }) => {
    const D = obterD({ hoje });
    const grupos = {};
    D.contas.forEach((c) => (grupos[c.tipo === 'INVESTIMENTO' ? 'Aplicações' : 'Conta corrente'] = (grupos[c.tipo === 'INVESTIMENTO' ? 'Aplicações' : 'Conta corrente'] || 0) + c.saldo));
    const total = Object.values(grupos).reduce((s, v) => s + v, 0);
    const texto = [
      '<b>[ SALDO DAS CONTAS ]</b>',
      `<em>Posição de ${dataBR(hoje)}</em>`,
      '',
      'Olá, Marcos! Segue os saldos das contas bancárias.',
      '',
      'Resumo por classificação:',
      ...Object.entries(grupos).map(([k, v]) => `* ${k}: ${moeda(v)}`),
      `<b>Total: ${moeda(total)}</b>`,
      '',
      'Crescimento de R$ 312.418,22 📈',
      '',
      '📎 Detalhe por conta na planilha anexa',
      '',
      '<em>Comunicado automático enviado pelo Horizon Finanças.</em>',
    ].join('\n');
    return `<div class="celular"><div class="celular__tela">
      <div class="celular__cab"><span class="celular__foto">HF</span><span>Diretoria Grupo Aurora<small>Horizon Finanças, Marcos, Juliana, Rafael</small></span></div>
      <div class="celular__msgs">
        <div class="balao" data-msg>${texto}<span class="balao__hora">07:30</span></div>
        <div class="anexo" data-anexo><i>XLSX</i><span>Saldos_${dataBR(hoje).replaceAll('/', '-')}.xlsx<small>planilha · 18 KB</small></span></div>
        <div class="balao" data-resposta style="align-self:flex-end;background:#dcefd9">Ótimo. Obrigado!<span class="balao__hora">07:34</span></div>
      </div>
    </div></div>`;
  },
  animar(el) {
    const a = agenda();
    const partes = [...el.querySelectorAll('[data-msg],[data-anexo],[data-resposta]')];
    partes.forEach((p) => (p.style.visibility = 'hidden'));
    partes.forEach((p, i) => a.depois(500 + i * 1100, () => (p.style.visibility = '')));
    return a.parar;
  },
};

// ─── 09:00 Espião NF-e / NFS-e ───────────────────────────────────────────────────────────────────
const NOTAS = [
  ['Embalagens Minas Ltda', 'NF-e 48.211', 'R$ 84.300,00', 'good', 'Vinculada'],
  ['Transportadora Rota 040', 'NFS-e 9.072', 'R$ 31.950,00', 'good', 'Vinculada'],
  ['Atacado Sul Alimentos', 'NF-e 120.554', 'R$ 212.708,40', 'good', 'Vinculada'],
  ['TechNuvem Serviços', 'NFS-e 3.318', 'R$ 12.400,00', 'warn', 'Sem pedido'],
  ['Gráfica Ponto Azul', 'NF-e 7.902', 'R$ 6.180,00', 'good', 'Vinculada'],
  ['Pneus Centro-Oeste', 'NF-e 61.045', 'R$ 47.660,00', 'good', 'Vinculada'],
];
export const notas = {
  html: () => `${barraJanela(['Operações', 'Espião NFe / NFSe', 'Recebidas'], { usuario: false })}
    <div class="mock">
      <div class="mock__cab"><h3 class="mock__titulo">Notas recebidas hoje</h3><span class="mock__sub"><span data-n>23</span> notas · 21 vinculadas ao contas a pagar</span></div>
      <div class="panel" style="padding:0;overflow-x:auto">
        <table class="nfe-tab">
          <thead><tr><th>Emitente</th><th>Nota</th><th style="text-align:right">Valor</th><th>Situação</th></tr></thead>
          <tbody>${NOTAS.map(([e, n, v, t, s]) => `<tr><td>${esc(e)}</td><td>${n}</td><td class="num">${v}</td><td><span class="chip ${t}">${s}</span></td></tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="note">PDF gerado na hora. A nota "sem pedido" vai para quem aprova antes do boleto vencer.</p>
    </div>`,
  animar(el) {
    const a = agenda();
    const linhas = [...el.querySelectorAll('tbody tr')];
    const n = el.querySelector('[data-n]');
    const ciclo = () => {
      linhas.forEach((l) => {
        l.style.visibility = 'hidden';
        l.classList.remove('chegando');
      });
      n.textContent = '17';
      linhas.forEach((l, i) =>
        a.depois(500 + i * 650, () => {
          l.style.visibility = '';
          l.classList.add('chegando');
          n.textContent = String(18 + i);
        })
      );
      a.depois(500 + linhas.length * 650 + 4000, ciclo);
    };
    ciclo();
    return a.parar;
  },
};

// ─── 10:30 Gestão de cobranças ───────────────────────────────────────────────────────────────────
export const cobranca = {
  html: () => `${barraJanela(['Operações', 'Gestão de Cobranças', 'Rotinas'], { usuario: false })}
    <div class="mock">
      <div class="mock__cab"><h3 class="mock__titulo">Cobrança do dia</h3><span class="mock__sub">régua automática · 10:30</span></div>
      <div class="cob-mock__corpo">
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <ul class="clusters">
            <li style="--cor:#0ca30c"><b>412</b>Bom pagador</li>
            <li style="--cor:#2a78d6"><b>96</b>Novo cliente</li>
            <li style="--cor:#fab219"><b>58</b>Pagador duvidoso</li>
            <li style="--cor:#d03b3b"><b>21</b>Mau pagador</li>
          </ul>
          <div class="score">
            <span><b>Marina Duarte</b> · motor de risco</span>
            <span class="score__barra"><i data-score style="--s:72%"></i></span>
            <span class="note">Paga em dia 9 de 11 parcelas · atraso médio de 3 dias</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <div class="balao" style="max-width:100%;border:1px solid var(--line)">Olá, Marina! A parcela 14 do seu contrato vence amanhã, no valor de R$ 2.418,00. Segue o boleto para facilitar. 🙂<span class="balao__hora">10:30 · WhatsApp</span></div>
          <div class="anexo" style="max-width:100%;border:1px solid var(--line)"><i class="pdf">PDF</i><span>boleto_parcela_14.pdf<small>gerado no ERP</small></span></div>
          <div class="panel" style="padding:12px">
            <h4 class="ph-mini">Carteira do dia dividida na equipe</h4>
            <ul class="equipe">
              <li><span class="janela__avatar">CS</span><span class="barra-eq"><i data-p style="--p:82%"></i></span><span class="num">41</span></li>
              <li><span class="janela__avatar">PL</span><span class="barra-eq"><i data-p style="--p:76%"></i></span><span class="num">38</span></li>
              <li><span class="janela__avatar">TA</span><span class="barra-eq"><i data-p style="--p:79%"></i></span><span class="num">40</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>`,
  animar(el) {
    const a = agenda();
    const score = el.querySelector('[data-score]');
    const barras = [...el.querySelectorAll('[data-p]')];
    const finais = barras.map((b) => b.style.getPropertyValue('--p'));
    const ciclo = () => {
      score.style.setProperty('--s', '30%');
      barras.forEach((b) => b.style.setProperty('--p', '0%'));
      a.depois(450, () => score.style.setProperty('--s', '72%'));
      barras.forEach((b, i) => a.depois(900 + i * 250, () => b.style.setProperty('--p', finais[i])));
      a.depois(6500, ciclo);
    };
    ciclo();
    return a.parar;
  },
};

// ─── 16:00 Plano de voo (Kanban da equipe) ───────────────────────────────────────────────────────
const COLUNAS = [
  ['Aguardando', ''],
  ['Progresso', ''],
  ['Atrasado', 'kanban__col--atrasado'],
  ['Concluído', 'kanban__col--concluido'],
];
export const tarefas = {
  html: ({ hoje }) => {
    const mes = lbl(hoje.slice(0, 7));
    const ant = lbl(addM(hoje.slice(0, 7), -1));
    const cards = {
      0: [[`Fechamento DRE ${mes}`, 'Rafael', 'em 12 dias']],
      1: [[`Conciliação Itaú ${ant}`, 'Juliana', 'vence hoje', 'mover']],
      2: [['Notas sem pedido (2)', 'Carla', '1 dia de atraso']],
      3: [
        ['Saldos da semana', 'Juliana', 'entregue'],
        ['Revisão do orçamento v3', 'Marcos', 'entregue'],
      ],
    };
    return `${barraJanela(['Plano de voo', 'Atividades da equipe'], { usuario: false })}
    <div class="mock">
      <div class="mock__cab"><h3 class="mock__titulo">Atividades da equipe</h3><span class="mock__sub" data-entregues>2 de 5 entregues</span></div>
      <div class="kanban">${COLUNAS.map(
        ([t, cls], i) => `<div class="kanban__col ${cls}" data-col="${i}"><h5>${t}<span>${cards[i].length}</span></h5>${cards[i]
          .map(([n, q, p, mover]) => `<div class="kcard"${mover ? ' data-mover' : ''}><b>${esc(n)}</b><span class="kcard__pe"><span>${q}</span><span>${p}</span></span></div>`)
          .join('')}</div>`
      ).join('')}</div>
    </div>`;
  },
  animar(el) {
    const a = agenda();
    const card = el.querySelector('[data-mover]');
    const origem = el.querySelector('[data-col="1"]');
    const destino = el.querySelector('[data-col="3"]');
    const contar = () => {
      origem.querySelector('h5 span').textContent = origem.querySelectorAll('.kcard').length;
      destino.querySelector('h5 span').textContent = destino.querySelectorAll('.kcard').length;
      el.querySelector('[data-entregues]').textContent = `${destino.querySelectorAll('.kcard').length} de 5 entregues`;
    };
    const ciclo = () => {
      origem.appendChild(card);
      card.querySelector('.kcard__pe span:last-child').textContent = 'vence hoje';
      contar();
      a.depois(1600, () => {
        card.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 300, easing: 'ease-in' }).onfinish = () => {
          destino.insertBefore(card, destino.querySelector('.kcard'));
          card.querySelector('.kcard__pe span:last-child').textContent = 'entregue';
          contar();
          card.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'ease-out' });
        };
      });
      a.depois(6000, ciclo);
    };
    ciclo();
    return a.parar;
  },
};

export const TELAS = { monitor, saldos, notas, cobranca, tarefas };
