import { AlertTriangle, CheckCircle2, XCircle, FileCheck2 } from 'lucide-react';

// Legenda didática pra cada situação possível de uma nota — a Receita
// devolve o texto oficial do evento (ex.: "MDF-e autorizado"), que sozinho
// não diz muita coisa pra quem não é da área fiscal.
const LEGENDAS_SITUACAO = {
  Cancelamento: 'O emitente cancelou esta nota — ela não tem mais validade fiscal.',
  'Cancelamento de NFS-e': 'O prestador cancelou esta nota de serviço — ela não tem mais validade fiscal.',
  'Cancelamento de NFS-e por Substituição':
    'Esta nota foi cancelada porque foi substituída por outra NFS-e (geralmente para corrigir algum dado).',
  'Cancelamento homologado': 'O pedido de cancelamento desta nota foi confirmado (homologado) pela prefeitura/sistema.',
  'MDF-e autorizado':
    'A mercadoria desta nota entrou em um Manifesto de Documentos Fiscais (MDF-e) — documento de controle usado no transporte de carga.',
  'MDF-e Autorizado com CT-e':
    'A mercadoria desta nota entrou em um manifesto de transporte (MDF-e) que também tem um Conhecimento de Transporte (CT-e) vinculado.',
  'Registro de Autorização de CT-e para a NF-e':
    'Foi emitido um Conhecimento de Transporte Eletrônico (CT-e) referenciando esta nota — indica que houve um frete formalizado pra essa mercadoria.',
  'Registro de Passagem Automatico Originado MDFe':
    'Um posto fiscal/pedágio registrou automaticamente a passagem do veículo que transportava esta mercadoria.',
  'Registro de Passagem de NFe propagado pelo MDFe/CTe':
    'Um registro de passagem em posto fiscal foi repassado a partir do manifesto de transporte (MDF-e/CT-e) vinculado a esta nota.',
  'Carta de Correção': 'O emitente corrigiu algum dado desta nota (não muda valores nem itens).',
  EPEC: 'A nota foi emitida em contingência (sistema da Receita fora do ar) e depois regularizada normalmente.',
  'Confirmação da Operação': 'O destinatário confirmou que recebeu a mercadoria/serviço desta nota.',
  'Ciência da Operação': 'O destinatário tomou conhecimento desta nota, mas ainda não confirmou nem recusou o recebimento.',
  'Desconhecimento da Operação': 'O destinatário declarou não reconhecer esta operação.',
  'Operação não Realizada': 'O destinatário informou que a operação descrita nesta nota não chegou a acontecer.',
};

export function explicarSituacao(situacao) {
  if (!situacao || situacao === 'Emitida') {
    return 'Nota emitida normalmente — nenhum evento adicional (cancelamento, correção, etc.) foi registrado até agora.';
  }
  if (LEGENDAS_SITUACAO[situacao]) return LEGENDAS_SITUACAO[situacao];

  const s = situacao.toLowerCase();
  if (s.includes('cancelamento')) return 'Esta nota foi cancelada.';
  if (s.includes('mdf-e') || s.includes('mdfe')) {
    return 'Evento relacionado ao transporte/manifesto de carga (MDF-e) vinculado a esta nota.';
  }
  if (s.includes('ct-e') || s.includes('cte')) {
    return 'Evento relacionado ao transporte (Conhecimento de Transporte Eletrônico) desta nota.';
  }
  if (s.includes('autoriza')) return 'Autorização relacionada a esta nota.';
  if (s.includes('passagem')) return 'Registro de passagem em posto fiscal relacionado ao transporte desta nota.';
  return 'Evento fiscal informado pela Receita relacionado a esta nota (não é uma nota nova).';
}

// Ícone + cor da situação: cancelamento = vermelho, autorização = verde,
// qualquer outro tipo de evento/notificação = amarelo (alerta). Sem evento
// (Emitida) = ícone neutro em cinza. borderClass é a mesma cor aplicada como
// friso na borda esquerda da linha (ver LinhaNota em EspiaoNfeNfsePage.jsx)
// — dá pra notar uma nota fora do normal sem precisar passar o mouse em cada
// uma; o ícone+tooltip continua sendo quem explica o que aconteceu.
export function infoSituacao(situacao) {
  if (!situacao || situacao === 'Emitida') {
    return { Icon: FileCheck2, colorClass: 'text-gray-400', borderClass: 'border-l-transparent' };
  }
  const s = situacao.toLowerCase();
  if (s.includes('cancelamento')) {
    return { Icon: XCircle, colorClass: 'text-red-600', borderClass: 'border-l-red-500' };
  }
  if (s.includes('autoriza')) {
    return { Icon: CheckCircle2, colorClass: 'text-emerald-600', borderClass: 'border-l-emerald-500' };
  }
  return { Icon: AlertTriangle, colorClass: 'text-amber-600', borderClass: 'border-l-amber-500' };
}
