import { MonitorCog, Landmark, KeyRound, Database } from 'lucide-react';
import iconPortalConstrutoras from '../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../assets/integracoes/prevision.svg';
import iconSienge from '../assets/integracoes/sienge.svg';
import iconConstrutorVendas from '../assets/integracoes/construtor-vendas.svg';
import iconCertificadosDigitais from '../assets/integracoes/certificados-digitais.svg';
import iconZapi from '../assets/integracoes/zapi.svg';
import iconEmail from '../assets/integracoes/email.svg';
import iconMcp from '../assets/integracoes/mcp.svg';
import iconActioon from '../assets/integracoes/actioon.svg';

// Integrações do sistema — fonte única da tela-hub Integrações (/integracoes, ver
// pages/Integracoes/IntegracoesHub.jsx). Cada item é uma tela com permissão própria
// (config/telasSistema.js); o hub só mostra as que o usuário acessa.
// Item com `image` usa o logo; sem, usa o ícone (`icon`, lucide).
export const INTEGRACOES = [
  { label: 'Monitor de Integrações', to: '/integracoes/monitor', icon: MonitorCog },
  { label: 'Portal das Construtoras', to: '/integracoes/portal-das-construtoras', image: iconPortalConstrutoras },
  { label: 'Prevision', to: '/integracoes/prevision', image: iconPrevision },
  { label: 'Sienge', to: '/integracoes/sienge', image: iconSienge },
  { label: 'Construtor de Vendas', to: '/integracoes/construtor-de-vendas', image: iconConstrutorVendas },
  { label: 'Certificados Digitais', to: '/integracoes/certificados-digitais', image: iconCertificadosDigitais },
  { label: 'Convênios Bancários', to: '/integracoes/contas-bancarias', icon: Landmark },
  { label: 'Whatsapp Z-API', to: '/integracoes/z-api', image: iconZapi },
  { label: 'Email', to: '/integracoes/email', image: iconEmail },
  { label: 'MCP', to: '/integracoes/mcp', image: iconMcp },
  { label: 'API Horizon', to: '/integracoes/api-horizon', icon: KeyRound },
  { label: 'Actioon', to: '/integracoes/actioon', image: iconActioon },
  { label: 'Banco de Dados', to: '/integracoes/banco-dados', icon: Database },
];
