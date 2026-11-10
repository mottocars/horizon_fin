import { formatarDataISO, hojeISO } from '../../utils/datas';

// Formatos da tela Contas Pagar / Receber.

export const numeroBr = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const moeda = (v) => `R$ ${numeroBr(v)}`;
export const data = (v) => formatarDataISO(v, '—');
export const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const mensagemErro = (e, padrao = 'Não foi possível concluir.') => e?.response?.data?.message || e?.message || padrao;

// "1.234,56" / "1234.56" / "1234,5" -> número (NaN se não for número).
export function lerValor(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!t) return NaN;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

export const centavos = (v) => Math.round(Number(v) * 100);

// Primeiro e último dia do mês de hoje ('AAAA-MM-DD').
export function mesAtual() {
  const hoje = hojeISO();
  const [a, m] = hoje.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: `${hoje.slice(0, 7)}-${String(ultimo).padStart(2, '0')}` };
}

// 'AAAA-MM-DD' + n meses (o dia que não existe no mês cai no último dia: 31/01 + 1 = 28/02).
export function somarMeses(iso, n) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const pad = (x) => String(x).padStart(2, '0');
  return `${alvo.getFullYear()}-${pad(alvo.getMonth() + 1)}-${pad(Math.min(d, ultimo))}`;
}

export const TIPOS = {
  PAGAR: { rotulo: 'A pagar', cor: 'bg-red-50 text-red-600' },
  RECEBER: { rotulo: 'A receber', cor: 'bg-emerald-50 text-emerald-700' },
};

export const TIPOS_DOCUMENTO = [
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'PROJECAO_PLS_CEF', label: 'Projeção PLS CEF' },
];
