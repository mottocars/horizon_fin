// Blocos de layout das Configurações Globais da Régua — mesmo desenho do
// Motor de Risco (MotorRiscoTab.jsx::SectionHeader e CampoNumerico.jsx),
// duplicado aqui de propósito (mesma convenção do módulo de não
// compartilhar componentes entre abas).

// Cabeçalho de uma sessão: selo ("Sessão 1"), título e explicação.
export function SectionHeader({ selo, titulo, texto, acao }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
      <div>
        {selo && <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>}
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
      </div>
      {acao}
    </div>
  );
}

// Um parâmetro: rótulo, explicação e exemplo à esquerda; o controle à
// direita (campo curto) ou embaixo, na largura toda (`largo` — cartões de
// opção, tabelas).
export function ParametroLinha({ label, desc, exemplo, children, largo = false, primeiro = false }) {
  const texto = (
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {desc && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">{desc}</p>}
      {exemplo && (
        <p className="mt-2 max-w-3xl border-l-2 border-primary-100 pl-2.5 text-xs leading-relaxed text-primary-700">{exemplo}</p>
      )}
    </div>
  );
  if (largo) {
    return (
      <div className={`space-y-3 py-4 ${primeiro ? '' : 'border-t border-gray-100'}`}>
        {texto}
        {children}
      </div>
    );
  }
  return (
    <div
      className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_180px] sm:items-start sm:gap-4 ${primeiro ? '' : 'border-t border-gray-100'}`}
    >
      {texto}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
