// Módulos do conector Horizon (um conector só, com login do Horizon Fin) — mesmos códigos de
// backend/src/modules/integracoes-mcp/modulos.js. Altera Orçamento inclui o DFC. Nenhum marcado, na
// criação, = conector de cobrança (token na URL, sem login).
export const MODULOS = [
  {
    codigo: 'DFC',
    titulo: 'DFC CONSTRUTORAS',
    curto: 'DFC',
    cor: 'bg-primary-50 text-primary-700',
    descricao: 'Leitura do DFC Construtoras (fluxo de caixa): realizado, projetado, saldos, Projeção CEF e as bases.',
  },
  {
    codigo: 'DFC_ORCAMENTO',
    titulo: 'DFC CONSTRUTORAS (ALTERA ORÇAMENTO)',
    curto: 'Altera Orçamento',
    cor: 'bg-amber-50 text-amber-700',
    inclui: 'DFC',
    descricao:
      'Inclui o DFC, e o Claude também pode inserir ou atualizar valores do Orçamento — só nas contas com Origem Projeção "HORIZON - INFORMADO" — e salvar a versão.',
  },
  {
    codigo: 'SALDOS_CONTAS',
    titulo: 'SALDO DAS CONTAS BANCÁRIAS',
    curto: 'Saldo das Contas',
    cor: 'bg-sky-50 text-sky-700',
    descricao:
      'Leitura do Saldo Contas Bancárias: saldo de cada conta por dia e de onde veio (automático, dia anterior ou manual), totais (liberado, bloqueado, limite cheque, a cobrir), bloqueios, cheque especial, classificações e automações.',
  },
  {
    codigo: 'AGING',
    titulo: 'AGING LIST (CONTAS A PAGAR E A RECEBER)',
    curto: 'Aging List',
    cor: 'bg-emerald-50 text-emerald-700',
    descricao:
      'Leitura do Aging List: contas a receber e a pagar em aberto por faixa de vencimento, centro, plano de contas, cliente, fornecedor e SPE; inadimplência e recuperação; o que já foi recebido e pago; e a projeção do caixa (dia, semana ou mês, com cenários e por SPE) partindo do saldo das contas bancárias.',
  },
];

// Marca/desmarca um módulo mantendo as dependências (Altera Orçamento liga o DFC; desligar o DFC
// desliga o Altera Orçamento) e a ordem do catálogo.
export function alternarModulo(atuais, codigo) {
  const set = new Set(atuais);
  if (set.has(codigo)) {
    set.delete(codigo);
    MODULOS.filter((m) => m.inclui === codigo).forEach((m) => set.delete(m.codigo));
  } else {
    set.add(codigo);
    const inclui = MODULOS.find((m) => m.codigo === codigo).inclui;
    if (inclui) set.add(inclui);
  }
  return MODULOS.map((m) => m.codigo).filter((c) => set.has(c));
}

// Etiquetas dos módulos de um conector (lista de conectores, Conexões com IA). Altera Orçamento já
// diz que inclui o DFC — o DFC sozinho não repete a etiqueta.
export function etiquetasModulos(codigos = []) {
  const lista = MODULOS.filter((m) => codigos.includes(m.codigo));
  return lista.filter((m) => !lista.some((o) => o.inclui === m.codigo));
}
