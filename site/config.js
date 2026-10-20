// Configuração do site público — importada pelo navegador (src/) e pelo Node (vite/plugin-site.js).
// O endereço do site (base, URL pública, indexação) vem das variáveis VITE_BASE, VITE_SITE_URL e
// VITE_INDEXAR no build; aqui fica só o que é conteúdo.

// Botão "Acessar o sistema": a raiz do app — logado cai direto no Horizon, deslogado vai para o login.
export const APP_URL = 'https://financas.horizonhub.com.br/';

// Número do WhatsApp comercial (DDI + DDD + número, só dígitos): (31) 99592-7763. Se voltar a ser o
// placeholder, o build avisa.
export const WHATSAPP_PLACEHOLDER = '5500000000000';
export const WHATSAPP = {
  numero: '5531995927763',
  // Mensagem pronta de cada botão, pelo contexto em que ele aparece.
  mensagens: {
    padrao: 'Olá! Quero ver o Horizon Finanças funcionando na minha empresa.',
    topo: 'Olá! Vim pelo site e quero conhecer o Horizon Finanças.',
    custo: 'Olá! Fiz a conta no site e a planilha está saindo cara. Quero ver o Horizon Finanças.',
    simulador: 'Olá! Brinquei com o simulador do site e quero ver o Horizon com os números da minha empresa.',
    ia: 'Olá! Quero ver a IA do Horizon respondendo sobre o financeiro da minha empresa.',
    erp: 'Olá! Uso outro ERP e quero saber como o Horizon se conecta a ele.',
    dialogo: 'Olá! Acabei de excluir a planilha "NÃO MEXER" no site de vocês. E agora? Quero o Horizon.',
  },
};

// PENDENTE: razão social e CNPJ (rodapé e dados estruturados). null = não aparece.
export const ORGANIZACAO = {
  nome: 'Horizon Finanças',
  razaoSocial: null,
  cnpj: null,
};

export function linkWhatsApp(contexto = 'padrao', extra = '') {
  const texto = (WHATSAPP.mensagens[contexto] || WHATSAPP.mensagens.padrao) + (extra ? ` ${extra}` : '');
  return `https://wa.me/${WHATSAPP.numero}?text=${encodeURIComponent(texto)}`;
}
