import { useMemo, useState } from 'react';
import { ChevronRight, ChevronsRight, ChevronLeft, ChevronsLeft, Search } from 'lucide-react';

// Lista dupla (Disponíveis -> Selecionados, com setas) — mesmo padrão visual/interação da
// caixa de empresas em UsuarioForm.jsx (CaixaDeEmpresas + os 4 botões de seta), generalizado
// pra qualquer lista de itens em vez de só empresas. Clique num item só destaca (azul); as
// setas movem os destacados (ou todos) de um lado pro outro. Cada caixa tem busca própria.
//
// `getId`/`getLabel` desacoplam do formato do item (empresa, usuário, o que for).
export default function TransferList({
  itens,
  selecionados,
  onChange,
  getId = (item) => item.id,
  getLabel = (item) => item.label,
  disabled = false,
  tituloDisponiveis = 'Disponíveis',
  tituloSelecionados = 'Selecionados',
  vazioDisponiveisTexto = 'Nenhum item disponível.',
  vazioSelecionadosTexto = 'Nenhum item selecionado.',
  // Cor da borda/fundo da caixa "Selecionados" — mesmo par âmbar (vazio)/azul (preenchido) já
  // usado nos campos de MotorRiscoTab.jsx e HistoricoEtapasModal.jsx pra sinalizar de relance
  // se aquele campo já foi preenchido. Quem chama decide a cor (ex.: com base em
  // `selecionados.length > 0`); por padrão fica neutro.
  corSelecionados = 'border-gray-200',
}) {
  const [destaqueDisponiveis, setDestaqueDisponiveis] = useState([]);
  const [destaqueSelecionados, setDestaqueSelecionados] = useState([]);

  const disponiveis = useMemo(
    () => itens.filter((item) => !selecionados.includes(String(getId(item)))),
    [itens, selecionados, getId]
  );
  const selecionadosItens = useMemo(
    () => itens.filter((item) => selecionados.includes(String(getId(item)))),
    [itens, selecionados, getId]
  );

  function toggleDestaque(setDestaque, id) {
    const idStr = String(id);
    setDestaque((prev) => (prev.includes(idStr) ? prev.filter((v) => v !== idStr) : [...prev, idStr]));
  }

  function moverParaSelecionados(ids) {
    if (ids.length === 0) return;
    onChange([...selecionados, ...ids.filter((id) => !selecionados.includes(id))]);
    setDestaqueDisponiveis([]);
  }

  function moverParaDisponiveis(ids) {
    if (ids.length === 0) return;
    onChange(selecionados.filter((id) => !ids.includes(id)));
    setDestaqueSelecionados([]);
  }

  return (
    <div className="flex items-stretch gap-2">
      <CaixaTransferencia
        titulo={tituloDisponiveis}
        itens={disponiveis}
        destacados={destaqueDisponiveis}
        onToggleDestaque={(id) => toggleDestaque(setDestaqueDisponiveis, id)}
        disabled={disabled}
        vazioTexto={vazioDisponiveisTexto}
        getId={getId}
        getLabel={getLabel}
      />

      <div className="flex flex-col justify-center gap-1.5">
        <button
          type="button"
          title="Mover selecionados para a direita"
          disabled={disabled || destaqueDisponiveis.length === 0}
          onClick={() => moverParaSelecionados(destaqueDisponiveis)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          title="Mover todos para a direita"
          disabled={disabled || disponiveis.length === 0}
          onClick={() => moverParaSelecionados(disponiveis.map((item) => String(getId(item))))}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronsRight size={14} />
        </button>
        <button
          type="button"
          title="Mover selecionados para a esquerda"
          disabled={disabled || destaqueSelecionados.length === 0}
          onClick={() => moverParaDisponiveis(destaqueSelecionados)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          title="Mover todos para a esquerda"
          disabled={disabled || selecionadosItens.length === 0}
          onClick={() => moverParaDisponiveis(selecionadosItens.map((item) => String(getId(item))))}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronsLeft size={14} />
        </button>
      </div>

      <CaixaTransferencia
        titulo={tituloSelecionados}
        itens={selecionadosItens}
        destacados={destaqueSelecionados}
        onToggleDestaque={(id) => toggleDestaque(setDestaqueSelecionados, id)}
        disabled={disabled}
        vazioTexto={vazioSelecionadosTexto}
        getId={getId}
        getLabel={getLabel}
        corBorda={corSelecionados}
      />
    </div>
  );
}

function CaixaTransferencia({ titulo, itens, destacados, onToggleDestaque, disabled, vazioTexto, getId, getLabel, corBorda = 'border-gray-200' }) {
  const [busca, setBusca] = useState('');

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return itens;
    return itens.filter((item) => getLabel(item).toLowerCase().includes(termo));
  }, [itens, busca, getLabel]);

  return (
    <div className={`flex-1 rounded-xl border transition-colors ${corBorda}`}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="shrink-0 text-xs font-medium text-gray-500">
          {titulo} ({itens.length})
        </span>
        <div className="relative w-40">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            disabled={disabled || itens.length === 0}
            placeholder="Pesquisar"
            className="w-full rounded-md border border-gray-200 bg-white py-1 pl-6 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1.5">
        {itens.length === 0 ? (
          <p className="px-2 py-2 text-sm text-gray-400">{vazioTexto}</p>
        ) : itensFiltrados.length === 0 ? (
          <p className="px-2 py-2 text-sm text-gray-400">Nenhum item encontrado.</p>
        ) : (
          itensFiltrados.map((item) => {
            const id = getId(item);
            const destacado = destacados.includes(String(id));
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onToggleDestaque(id)}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                  destacado ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getLabel(item)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
