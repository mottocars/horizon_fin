import { CircleDashed, CreditCard, Lock, ShieldCheck, Target, TrendingUp, Unlock } from 'lucide-react';

export const SEM_CLASSIFICACAO = 'SEM_CLASSIFICACAO';

// Nível 1 do drilldown. Mesma ordem da lista de classificações do cadastro da conta,
// com "Sem classificação" por último (as contas que ainda não foram classificadas
// precisam aparecer em algum lugar, senão os totais deixariam saldo de fora).
export const GRUPOS_CLASSIFICACAO = [
  { value: 'APLICACAO', label: 'Aplicação', icon: TrendingUp, cor: 'text-emerald-600', fundo: 'bg-emerald-50' },
  { value: 'BLOQUEADA', label: 'Bloqueada', icon: Lock, cor: 'text-red-600', fundo: 'bg-red-50' },
  { value: 'CHEQUE_ESPECIAL', label: 'Cheque Especial', icon: CreditCard, cor: 'text-amber-600', fundo: 'bg-amber-50' },
  { value: 'DEDICADA', label: 'Dedicada', icon: Target, cor: 'text-violet-600', fundo: 'bg-violet-50' },
  { value: 'GARANTIDA', label: 'Garantida', icon: ShieldCheck, cor: 'text-sky-600', fundo: 'bg-sky-50' },
  { value: 'LIBERADA', label: 'Liberada', icon: Unlock, cor: 'text-primary-600', fundo: 'bg-primary-50' },
  { value: SEM_CLASSIFICACAO, label: 'Sem classificação', icon: CircleDashed, cor: 'text-gray-400', fundo: 'bg-gray-100' },
];

export const OPCOES_CLASSIFICACAO = GRUPOS_CLASSIFICACAO.map(({ value, label }) => ({ value, label }));

// Igual ao limite do backend (saldos.controller.js) — 3 meses de colunas já é bastante tabela.
export const MAX_DIAS_PERIODO = 93;

// ---------------------------------------------------------------------------
// Datas — sempre 'YYYY-MM-DD' em horário LOCAL (toISOString() devolve UTC e, à noite,
// já cairia no dia seguinte).
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

export function paraISO(data) {
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

export function deISO(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function hojeISO() {
  return paraISO(new Date());
}

// Quantos dias pra trás o período padrão começa (a data fim padrão é hoje).
export const DIAS_PADRAO_ATRAS = 7;

// Período com que a tela abre: de 7 dias atrás até hoje (8 colunas). Recalculado a cada
// abertura da tela, então "hoje" nunca fica velho.
export function periodoPadrao() {
  const hoje = deISO(hojeISO());
  return {
    inicio: paraISO(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - DIAS_PADRAO_ATRAS)),
    fim: paraISO(hoje),
  };
}

// Conta os dois extremos: 01 a 30 = 30 dias. (Math.round absorve a hora a mais/a menos
// nos dias de mudança de horário de verão.)
export function contarDias(inicio, fim) {
  return Math.round((deISO(fim) - deISO(inicio)) / 86_400_000) + 1;
}

function somarDias(iso, dias) {
  const d = deISO(iso);
  d.setDate(d.getDate() + dias);
  return paraISO(d);
}

// Setas ‹ › do filtro de período. Anda a janela pelo tamanho dela (7 dias pra trás + hoje =
// 8 dias, então cada clique pula 8) — mas, se o período é um ou mais meses cheios (dia 1 ao
// último dia), anda de mês em mês do calendário, que é o que se espera nesse caso.
// `direcao`: -1 = anterior, 1 = próximo.
export function deslocarPeriodo(inicio, fim, direcao) {
  const ini = deISO(inicio);
  const f = deISO(fim);
  const ultimoDiaDoMesFim = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  if (ini.getDate() === 1 && f.getDate() === ultimoDiaDoMesFim) {
    const meses = (f.getFullYear() - ini.getFullYear()) * 12 + (f.getMonth() - ini.getMonth()) + 1;
    const novoInicio = new Date(ini.getFullYear(), ini.getMonth() + direcao * meses, 1);
    const novoFim = new Date(novoInicio.getFullYear(), novoInicio.getMonth() + meses, 0);
    return { inicio: paraISO(novoInicio), fim: paraISO(novoFim) };
  }
  const dias = contarDias(inicio, fim);
  return { inicio: somarDias(inicio, direcao * dias), fim: somarDias(fim, direcao * dias) };
}

// null se o período é válido; senão a mensagem pra mostrar na tela.
export function validarPeriodo(inicio, fim) {
  if (!inicio || !fim) return 'Informe a data início e a data fim.';
  if (fim < inicio) return 'A data fim não pode ser anterior à data início.';
  if (contarDias(inicio, fim) > MAX_DIAS_PERIODO) return `O período pode ter no máximo ${MAX_DIAS_PERIODO} dias.`;
  return null;
}

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function nomeMes(ano, mes) {
  return `${MESES[mes]} de ${ano}`;
}

// Uma entrada por dia do período — é o que vira coluna da tabela. `pendente` = dia útil
// que já passou (ou é hoje): é onde um saldo em branco significa "falta informar".
export function listarDias(inicio, fim) {
  const hoje = hojeISO();
  const dias = [];
  const cursor = deISO(inicio);
  const limite = deISO(fim);
  while (cursor <= limite) {
    const iso = paraISO(cursor);
    const semana = cursor.getDay();
    const fimDeSemana = semana === 0 || semana === 6;
    dias.push({
      iso,
      dia: cursor.getDate(),
      mes: cursor.getMonth(),
      ano: cursor.getFullYear(),
      semana: SEMANA_CURTA[semana],
      fimDeSemana,
      hoje: iso === hoje,
      pendente: !fimDeSemana && iso <= hoje,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

export function formatarSaldo(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Como o valor aparece dentro do campo enquanto se edita: sem separador de milhar, com vírgula.
export function numeroParaEdicao(valor) {
  return Number(valor).toFixed(2).replace('.', ',');
}

// Texto digitado -> número. Devolve null pra vazio (= "não informado"), NaN pra texto
// inválido e o número (2 casas) nos demais casos. Aceita "1.234,56", "1234,56", "1234.56",
// "-500", "R$ 10". Sem vírgula, ponto seguido de exatamente 3 dígitos é milhar (pt-BR):
// "1.500" = 1500.
export function interpretarSaldo(texto) {
  let t = String(texto ?? '').replace(/\s/g, '').replace(/^(-?)R\$/i, '$1');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  const n = Math.round(parseFloat(t) * 100) / 100;
  return Number.isFinite(n) && Math.abs(n) <= 9_999_999_999_999.99 ? n : NaN;
}

// Soma em centavos (inteiros) pra não acumular erro de ponto flutuante nos totais.
export function somarSaldos(valores) {
  return valores.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100;
}
