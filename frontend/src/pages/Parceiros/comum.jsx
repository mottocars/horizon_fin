// Peças compartilhadas da tela Cadastros › Parceiros (lista e detalhe).

export const STATUS_PARCEIRO = {
  EM_ANALISE: { label: 'Em análise', classe: 'bg-amber-50 text-amber-700 border-amber-200' },
  APROVADO: { label: 'Aprovado', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SUSPENSO: { label: 'Suspenso', classe: 'bg-red-50 text-red-700 border-red-200' },
  RECUSADO: { label: 'Recusado', classe: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export const OPCOES_STATUS = Object.entries(STATUS_PARCEIRO).map(([value, s]) => ({ value, label: s.label }));

export function StatusParceiro({ status }) {
  const s = STATUS_PARCEIRO[status] || { label: status, classe: 'bg-gray-100 text-gray-600 border-gray-200' };
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.classe}`}>{s.label}</span>;
}

export function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
