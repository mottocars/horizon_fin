// Calculadora "Quanto custa a planilha": pessoas × horas por semana × 52 semanas × custo por hora
// (custo mensal ÷ 176 horas). A conta fica exposta, e o botão leva o valor na mensagem do WhatsApp.
import { linkWhatsApp } from '../../config.js';

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const lim = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

function resumido(v) {
  if (v >= 1e6) return `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v / 1e6)} mi`;
  if (v >= 1e3) return `R$ ${nf.format(v / 1e3)} mil`;
  return `R$ ${nf.format(v)}`;
}

export function montarCusto(raiz) {
  const form = raiz.querySelector('[data-form-custo]');
  const campo = (n) => form.elements[n];
  const saida = raiz.querySelector('[data-resultado]');
  const valorAno = raiz.querySelector('[data-valor-ano]');
  const aberta = raiz.querySelector('[data-conta-aberta]');
  const link = raiz.querySelector('[data-link-custo]');

  function calcular() {
    const p = lim(+campo('pessoas').value, 1, 99);
    const h = lim(+campo('horas').value, 1, 60);
    const c = lim(+campo('custo').value, 1000, 99000);
    const hora = c / 176;
    const ano = p * h * 52 * hora;
    saida.textContent = `R$ ${nf.format(ano)}`;
    valorAno.textContent = resumido(ano);
    aberta.textContent = `${p} ${p === 1 ? 'pessoa' : 'pessoas'} × ${h} h × 52 semanas × R$ ${nf.format(hora)} por hora`;
    link.href = linkWhatsApp('custo', `Pela conta do site, a planilha custa ${resumido(ano)} por ano.`);
  }

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', calcular);
  calcular();
}
