// Macro etapas fixas dos Repasses — compartilhadas entre a tela de Máscaras
// (onde o usuário cadastra as micro etapas de cada uma) e o Kanban de
// Repasses CEF (onde cada uma vira um bucket). Cada macro etapa é vinculada
// à integração que a alimenta, mostrada como logo no lugar do nome escrito.
// `value` é o mesmo código usado como `grupo` em mascara_itens no backend
// (ver backend/src/modules/mascaras/mascaras.controller.js).
import iconConstrutorVendas from '../assets/integracoes/construtor-vendas.svg';
import iconSienge from '../assets/integracoes/sienge.svg';
import iconPortalConstrutoras from '../assets/integracoes/portal-construtoras.svg';

export const MACRO_ETAPAS_REPASSES = [
  { value: 'VENDA', numero: 1, label: 'Reserva', logo: iconConstrutorVendas, integracaoNome: 'Construtor de Vendas' },
  { value: 'CONTRATO', numero: 2, label: 'Contrato', logo: iconSienge, integracaoNome: 'Sienge' },
  { value: 'ASSINATURA', numero: 3, label: 'Assinatura', logo: iconPortalConstrutoras, integracaoNome: 'Portal das Construtoras' },
  { value: 'REGISTRO', numero: 4, label: 'Registro', logo: iconPortalConstrutoras, integracaoNome: 'Portal das Construtoras' },
];
