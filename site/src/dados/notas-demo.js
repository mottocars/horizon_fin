// Notas fiscais do Grupo Aurora para a demonstração do Espião NF-e / NFS-e. Ilustrativo — mas cada passo da
// história é algo que o módulo faz de verdade: chegam da SEFAZ / ADN, um evento cancela uma delas, a vinculação
// confere CNPJ + data + nº (3/3) com o contas a pagar, a ambígua vai para revisão e a sem título fica pendente.
//   destino: 'vincula' | 'ambigua' | 'sem-titulo' | 'cancela'
// venceEm: dias até o certificado vencer (o da Logística vence logo: a tela avisa em âmbar a 10 dias ou menos).
const CERTIFICADOS = [
  { id: 'ali', empresa: 'Aurora Alimentos', cnpj: '12.345.678/0001-90', venceEm: 145 },
  { id: 'log', empresa: 'Aurora Logística', cnpj: '98.765.432/0001-10', venceEm: 9 },
];

const NOTAS = [
  { id: 1, cert: 'ali', tipo: 'nfe', numero: '2.207', emissor: 'Distribuidora Ômega Ltda', dias: 34, valor: 75020, destino: 'sem-titulo', antiga: true },
  { id: 2, cert: 'ali', tipo: 'nfe', numero: '48.211', emissor: 'Embalagens Minas Ltda', dias: 1, valor: 84300, destino: 'vincula' },
  { id: 3, cert: 'log', tipo: 'nfse', numero: '9.072', emissor: 'Transportadora Rota 040', dias: 1, valor: 31950, destino: 'vincula' },
  { id: 4, cert: 'ali', tipo: 'nfe', numero: '120.554', emissor: 'Atacado Sul Alimentos', dias: 1, valor: 212708.4, destino: 'vincula' },
  { id: 5, cert: 'log', tipo: 'nfse', numero: '3.318', emissor: 'TechNuvem Serviços', dias: 2, valor: 12400, destino: 'ambigua' },
  { id: 6, cert: 'ali', tipo: 'nfe', numero: '61.045', emissor: 'Pneus Centro-Oeste', dias: 2, valor: 47660, destino: 'cancela' },
  { id: 7, cert: 'log', tipo: 'nfe', numero: '7.902', emissor: 'Gráfica Ponto Azul', dias: 1, valor: 6180, destino: 'vincula' },
  { id: 8, cert: 'log', tipo: 'nfse', numero: '518', emissor: 'Consultoria Vértice', dias: 1, valor: 9800, destino: 'vincula' },
];

const somarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

export function notasDemo(hoje) {
  return {
    certificados: CERTIFICADOS.map((c) => ({ ...c, vencimento: somarDias(hoje, c.venceEm) })),
    notas: NOTAS.map((n) => ({ ...n, emissao: somarDias(hoje, -n.dias) })),
    inicio: somarDias(hoje, -35),
    fim: hoje,
  };
}
