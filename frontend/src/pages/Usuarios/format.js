export function formatDdd(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 3);
}

export function formatCelular(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 9);
  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}
