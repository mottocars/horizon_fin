export function nomeExibicaoEmpresa(empresa) {
  if (!empresa) return '';
  return empresa.nome_fantasia?.trim() || empresa.razao_social;
}
