import { AlertTriangle, Bot, Globe2, HelpCircle, Monitor, Smartphone, Terminal } from 'lucide-react';

// Tipos gravados pelo backend (ver backend/src/utils/clienteHttp.js).
// `suspeito` = não é o sistema aberto num navegador de verdade — alguém
// chamando a API por fora (Postman, script...) com o login de um usuário.
export const TIPOS = {
  navegador: { label: 'Navegador', icone: Monitor, cor: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  celular: { label: 'Celular', icone: Smartphone, cor: 'border-sky-200 bg-sky-50 text-sky-700' },
  imitando_navegador: {
    label: 'Imitando navegador',
    icone: AlertTriangle,
    cor: 'border-amber-200 bg-amber-50 text-amber-700',
    suspeito: true,
    dica: 'Se apresenta como navegador, mas não envia os cabeçalhos que todo navegador envia sozinho — típico de script.',
  },
  fora_do_app: {
    label: 'Chamada manual',
    icone: AlertTriangle,
    cor: 'border-amber-200 bg-amber-50 text-amber-700',
    suspeito: true,
    dica: 'Navegador de verdade, mas a chamada não saiu das telas do sistema — console do navegador, extensão ou outro site usando o token.',
  },
  navegador_automatizado: { label: 'Navegador automatizado', icone: Bot, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  postman: { label: 'Postman', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  insomnia: { label: 'Insomnia', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  python: { label: 'Script Python', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  curl: { label: 'curl', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  node: { label: 'Script Node.js', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  script: { label: 'Outro programa', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  desconhecido: { label: 'Desconhecido', icone: HelpCircle, cor: 'border-gray-200 bg-gray-50 text-gray-600', suspeito: true },
};

// País vem do backend como código ISO ("BR", "US"...) — calculado pelo IP
// (ver backend/src/utils/paisDoIp.js). 'LOCAL' = rede interna.
const nomesRegioes = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

export function nomePais(codigo) {
  if (codigo === 'LOCAL') return 'Rede interna';
  try {
    return nomesRegioes.of(codigo) || codigo;
  } catch {
    return codigo;
  }
}

export function ehExterior(codigo) {
  return codigo !== 'BR' && codigo !== 'LOCAL';
}

export function Pais({ codigo }) {
  const exterior = ehExterior(codigo);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${exterior ? 'font-medium text-red-700' : 'text-gray-600'}`}>
      {codigo === 'LOCAL' ? (
        <Globe2 size={12} className="text-gray-400" />
      ) : (
        <span
          className={`rounded px-1 py-px font-mono text-[10px] font-semibold ${
            exterior ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {codigo}
        </span>
      )}
      {nomePais(codigo)}
    </span>
  );
}

export function formatarDataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function BadgeTipo({ tipo }) {
  const info = TIPOS[tipo] || TIPOS.desconhecido;
  const Icone = info.icone;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${info.cor}`}
      title={info.dica}
    >
      <Icone size={12} />
      {info.label}
    </span>
  );
}
