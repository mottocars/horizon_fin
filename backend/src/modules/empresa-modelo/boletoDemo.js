const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const pool = require('../../config/db');

// Boleto fictício da empresa modelo (o "boleto do Sienge" da régua de cobrança). Mostra os
// dados da parcela da própria HZN CONSTRUTORA e deixa claro que é um documento de
// demonstração — não tem código de barras válido nem pode ser pago.

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

function linhaDigitavel(billId, installmentId, valor) {
  const base = `10490${String(billId).padStart(10, '0')}${String(installmentId).padStart(3, '0')}${String(Math.round(Number(valor || 0) * 100)).padStart(10, '0')}`;
  const d = base.padEnd(47, '0').slice(0, 47);
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}

async function boletoDemonstracao(empresaId, { billId, installmentId }) {
  const { rows } = await pool.query(
    `SELECT i.client_name, i.due_date::text AS venc, COALESCE(i.corrected_balance_amount, i.balance_amount, i.original_amount)::float AS valor,
            i.installment_number, i.main_unit, i.project_name, i.company_name
     FROM sie_income i WHERE i.empresa_id = $1 AND i.bill_id = $2 AND i.installment_id = $3`,
    [empresaId, billId, installmentId]
  );
  const p = rows[0] || {};
  const digitavel = linhaDigitavel(billId, installmentId, p.valor);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 420]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cinza = rgb(0.35, 0.35, 0.4);
  const laranja = rgb(0.93, 0.47, 0.13);
  page.drawRectangle({ x: 0, y: 380, width: 595, height: 40, color: laranja });
  page.drawText('BOLETO DE DEMONSTRAÇÃO — NÃO PAGUE', { x: 24, y: 394, size: 15, font: negrito, color: rgb(1, 1, 1) });
  const linhas = [
    ['Beneficiário', p.company_name || 'HZN CONSTRUTORA E INCORPORADORA LTDA'],
    ['Pagador', p.client_name || '—'],
    ['Empreendimento / unidade', `${p.project_name || '—'}${p.main_unit ? ` · unidade ${p.main_unit}` : ''}`],
    ['Parcela', `${p.installment_number || installmentId} (título ${billId})`],
    ['Vencimento', dataBr(p.venc)],
    ['Valor do documento', fmt(p.valor)],
  ];
  let y = 345;
  for (const [rotulo, valor] of linhas) {
    page.drawText(rotulo.toUpperCase(), { x: 24, y, size: 8, font: fonte, color: cinza });
    page.drawText(String(valor).slice(0, 80), { x: 24, y: y - 14, size: 12, font: negrito });
    y -= 40;
  }
  page.drawText(digitavel, { x: 24, y: 70, size: 13, font: negrito });
  page.drawText('Documento fictício gerado pela empresa modelo do Horizon Hub para demonstração.', { x: 24, y: 40, size: 9, font: fonte, color: cinza });
  const bytes = await pdf.save();
  return { base64: Buffer.from(bytes).toString('base64'), digitableNumber: digitavel.replace(/\D/g, '') };
}

module.exports = { boletoDemonstracao };
