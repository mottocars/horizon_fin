// Chave liga/desliga (role="switch") com rótulo e descrição opcionais — mesmo
// desenho que nasceu na antiga Gestão Aprovações, aqui como componente compartilhado (usado em
// Cadastros › Novidades).
export default function Interruptor({ ligado, onChange, disabled, rotulo, descricao }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={disabled}
        onClick={() => onChange(!ligado)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${ligado ? 'bg-primary-600' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {(rotulo || descricao) && (
        <span className="min-w-0">
          {rotulo && <span className="block text-sm font-medium text-gray-800">{rotulo}</span>}
          {descricao && <span className="block text-xs text-gray-500">{descricao}</span>}
        </span>
      )}
    </label>
  );
}
