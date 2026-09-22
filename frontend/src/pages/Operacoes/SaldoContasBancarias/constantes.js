// Nível 1 do drilldown. Mesma ordem da lista de classificações do cadastro da conta. Contas
// sem classificação não entram em grupo nenhum aqui (pedido do usuário: "só deverá aparecer
// o que tem classificação") — ficam de fora da matriz até serem classificadas. Sem ícone por
// grupo (pedido do usuário) — só o rótulo.
export const GRUPOS_CLASSIFICACAO = [
  { value: 'APLICACAO', label: 'Aplicação' },
  { value: 'BLOQUEADA', label: 'Bloqueada' },
  { value: 'CHEQUE_ESPECIAL', label: 'Cheque Especial' },
  { value: 'DEDICADA', label: 'Dedicada' },
  { value: 'GARANTIDA', label: 'Garantida' },
  { value: 'LIBERADA', label: 'Liberada' },
];

export const OPCOES_CLASSIFICACAO = GRUPOS_CLASSIFICACAO.map(({ value, label }) => ({ value, label }));

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

export function formatarDataBR(iso) {
  return deISO(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Domingo da semana que contém `iso` — getDay() vale 0 no domingo, então basta voltar
// `diaSemana` dias. Base de tudo que "trava" a grade numa semana só (pedido do usuário: "vamos
// travar o calendário em apenas semanal" — em vez de Data início/Data fim livres, que podiam
// gerar um período tão longo que a tabela ficava larga demais e precisava rolar na horizontal).
export function domingoDaSemana(iso) {
  const data = deISO(iso);
  return paraISO(new Date(data.getFullYear(), data.getMonth(), data.getDate() - data.getDay()));
}

// { inicio, fim } (domingo a sábado) da semana que contém `iso`.
export function semanaDe(iso) {
  const inicio = domingoDaSemana(iso);
  const d = deISO(inicio);
  return { inicio, fim: paraISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6)) };
}

// Período com que a tela abre: a semana atual. Recalculado a cada abertura, então nunca fica
// parado numa semana velha.
export function semanaAtual() {
  return semanaDe(hojeISO());
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
