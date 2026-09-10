export function parseBRNumber(value) {
  if (!value) return '';
  const cleaned = value.trim();
  if (cleaned.includes(',')) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }
  return cleaned.replace(/\./g, '');
}

export function formatBRNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function maskBRNumberInput(raw) {
  let cleaned = raw.replace(/[^0-9,]/g, '');
  const firstComma = cleaned.indexOf(',');
  if (firstComma !== -1) {
    cleaned = cleaned.slice(0, firstComma + 1) + cleaned.slice(firstComma + 1).replace(/,/g, '');
  }
  const [intPartRaw, decPart] = cleaned.split(',');
  const intPart = (intPartRaw || '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decPart !== undefined) {
    return `${intPart},${decPart.slice(0, 2)}`;
  }
  return intPart;
}
