// Datas de calendário (colunas DATE do Postgres) — sempre como texto
// 'YYYY-MM-DD', nunca como Date.
//
// O backend manda toda coluna DATE (e todo `::date`) como a string pura
// 'YYYY-MM-DD' (ver types.setTypeParser(1082) em backend/src/config/db.js).
// Esse valor é um dia de calendário, não um instante: não tem fuso. Só que
// `new Date('2026-08-10')` é lido pela spec como meia-noite EM UTC, e
// qualquer getter/`toLocaleDateString` local logo depois reconverte pro fuso
// do navegador — no Brasil (UTC-3) isso vira 09/08. Por isso as funções
// daqui trabalham só com o texto (e, pra contar dias, com Date.UTC dos dois
// lados), e a data exibida é exatamente a que está gravada no banco.
//
// Atenção: é só pra campo de DATA PURA. TIMESTAMP/TIMESTAMPTZ (criado_em,
// atualizado_em...) são instantes de verdade e continuam sendo exibidos no
// fuso local com new Date(...).toLocaleString(...).

const RE_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

// 'YYYY-MM-DD' -> 'DD/MM/YYYY', sem passar por Date. `vazio` é o que volta
// quando não há data (cada tela tem sua convenção: '—', '' ...). Valor que
// não começa com 'YYYY-MM-DD' volta como veio, pra não esconder dado
// inesperado atrás de uma data inventada.
export function formatarDataISO(valor, vazio = '—') {
  if (!valor) return vazio;
  const m = RE_DATA_ISO.exec(String(valor));
  if (!m) return String(valor);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Hoje no fuso LOCAL do navegador, como 'YYYY-MM-DD' (toISOString() devolve
// o dia em UTC, que a partir das 21h no Brasil já é amanhã). Comparável por
// string com as datas que vêm do banco ('2026-08-10' < '2026-09-01').
export function hojeISO(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Dias corridos de `de` até `ate` (ambos 'YYYY-MM-DD'), positivo quando
// `ate` é depois. Date.UTC dos dois lados: sem fuso nem horário de verão
// no meio da conta. null quando alguma das datas falta ou é inválida.
export function diasEntreISO(de, ate) {
  const a = RE_DATA_ISO.exec(String(de || ''));
  const b = RE_DATA_ISO.exec(String(ate || ''));
  if (!a || !b) return null;
  const utc = (m) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((utc(b) - utc(a)) / 86400000);
}
