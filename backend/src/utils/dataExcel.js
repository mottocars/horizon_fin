// Coluna DATE chega do pg como texto 'AAAA-MM-DD' (ver config/db.js). Escrita
// assim no Excel ela viraria uma célula de TEXTO — o usuário perderia ordenar,
// filtrar por período e fazer conta de data na planilha. Por isso a data vira
// Date de novo só na hora de gravar a célula, ancorada na meia-noite UTC do
// dia: o exceljs converte Date em número serial pelo instante UTC
// (utils.dateToExcel usa getTime()), então a célula mostra exatamente o dia
// gravado no banco, seja o servidor em UTC (produção) ou em UTC−3 (dev local).
// Qualquer outro valor (null, número, texto que não é data pura) passa intacto.
function dataParaExcel(valor) {
  if (typeof valor !== 'string') return valor;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return valor;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// Cópia da linha com dataParaExcel aplicado nos campos informados.
function datasParaExcel(row, campos) {
  const out = { ...row };
  for (const campo of campos) out[campo] = dataParaExcel(out[campo]);
  return out;
}

module.exports = { dataParaExcel, datasParaExcel };
