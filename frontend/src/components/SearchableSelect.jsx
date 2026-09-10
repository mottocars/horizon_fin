import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  emptyMessage = 'Nenhum resultado encontrado.',
  disabled = false,
  // false pra campos obrigatórios sem estado "vazio" válido (enums, status,
  // classificações) — some a opção de limpar a seleção no topo da lista.
  // Ignorado quando `multiple` é true (lá o "limpar" é o link acima da lista).
  clearable = true,
  // Múltipla seleção: `value`/`onChange` passam a trabalhar com array. O
  // painel fica aberto entre cliques (cada clique só alterna aquela opção),
  // com checkbox em vez de destaque de linha única.
  multiple = false,
  // Substitui o botão padrão (caixa com texto + chevron) por um gatilho
  // customizado — usado pelos filtros de coluna da tabela de Rotinas
  // (RotinasTab.jsx), que precisam de só um ícone pequeno ao lado do nome
  // da coluna, não de uma caixa de seleção inteira. Recebe `{ open, toggle,
  // temSelecao }`; todo o resto (painel, busca, portal, posicionamento,
  // clique fora) continua exatamente igual.
  renderTrigger,
  // Elemento cuja largura/posição definem o painel, no lugar do próprio
  // gatilho — usado junto com `renderTrigger` quando o gatilho é só um
  // ícone pequeno mas o painel precisa ocupar a largura de outra coisa
  // (ex.: a coluna inteira da tabela em RotinasTab.jsx, via ref do <th>).
  larguraRef,
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const valoresSelecionados = multiple ? (Array.isArray(value) ? value : []) : null;
  const selecionado = multiple ? null : options.find((o) => String(o.value) === String(value));

  // O painel é renderizado via portal direto no <body> (posição `fixed`,
  // calculada a partir do próprio gatilho) em vez de `absolute` dentro do
  // container — assim ele flutua por cima de qualquer coisa, inclusive
  // Modals com `overflow-y-auto`, sem forçar rolagem interna neles.
  // Largura mínima do painel — sem isso, um gatilho compacto (ex.: o ícone
  // de filtro de coluna em RotinasTab.jsx, só ~20px) faria o painel nascer
  // igualmente estreito, espremendo a busca e a lista de opções numa
  // fatia inutilizável. Gatilhos "cheios" (a caixa de seleção padrão) já
  // são bem mais largos que isso, então não são afetados.
  const LARGURA_MINIMA_PAINEL = 220;

  function medirGatilho() {
    const el = larguraRef?.current || containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, LARGURA_MINIMA_PAINEL);
    // Não deixa o painel vazar pela borda direita da viewport quando o
    // gatilho está perto dela (ex.: filtro de coluna no fim de uma tabela).
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 4, left: Math.max(8, left), width, gatilhoTop: rect.top });
  }

  useEffect(() => {
    if (!open) return;
    medirGatilho();
    function reposicionar() {
      medirGatilho();
    }
    window.addEventListener('scroll', reposicionar, true);
    window.addEventListener('resize', reposicionar);
    return () => {
      window.removeEventListener('scroll', reposicionar, true);
      window.removeEventListener('resize', reposicionar);
    };
  }, [open]);

  // Depois de medido e renderizado, se não couber abaixo do gatilho até o
  // fim da viewport, vira pra cima dele.
  useLayoutEffect(() => {
    if (!open || !coords || !dropdownRef.current) return;
    const alturaPainel = dropdownRef.current.offsetHeight;
    const cabeAbaixo = coords.top + alturaPainel <= window.innerHeight - 8;
    if (!cabeAbaixo && coords.gatilhoTop - alturaPainel - 4 > 0 && coords.viradoParaCima === undefined) {
      setCoords((prev) => ({ ...prev, top: prev.gatilhoTop - alturaPainel - 4, viradoParaCima: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords?.top, coords?.left]);

  useEffect(() => {
    function handleClickFora(e) {
      const dentroGatilho = containerRef.current && containerRef.current.contains(e.target);
      const dentroPainel = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!dentroGatilho && !dentroPainel) {
        setOpen(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return options;
    return options.filter((o) => o.label.toLowerCase().includes(termo));
  }, [busca, options]);

  function abrir() {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selecionar(opcao) {
    if (multiple) {
      const jaSelecionado = valoresSelecionados.some((v) => String(v) === String(opcao.value));
      const novaLista = jaSelecionado
        ? valoresSelecionados.filter((v) => String(v) !== String(opcao.value))
        : [...valoresSelecionados, opcao.value];
      onChange(novaLista);
      return; // painel continua aberto — múltipla seleção em sequência
    }
    onChange(opcao ? opcao.value : '');
    setOpen(false);
    setBusca('');
  }

  const rotuloBotao = multiple
    ? valoresSelecionados.length === 0
      ? placeholder
      : valoresSelecionados.length === 1
        ? options.find((o) => String(o.value) === String(valoresSelecionados[0]))?.label || placeholder
        : `${valoresSelecionados.length} selecionados`
    : selecionado
      ? selecionado.label
      : placeholder;
  const temSelecao = multiple ? valoresSelecionados.length > 0 : Boolean(selecionado);

  return (
    <div ref={containerRef} className="relative">
      {renderTrigger ? (
        renderTrigger({ open, toggle: () => (disabled ? null : open ? setOpen(false) : abrir()), temSelecao })
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : abrir())}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:opacity-60"
        >
          <span className={`truncate ${temSelecao ? 'text-gray-900' : 'text-gray-400'}`}>{rotuloBotao}</span>
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        </button>
      )}

      {open &&
        !disabled &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
            className="z-[100] rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            <div className="relative border-b border-gray-100 p-2">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full rounded-md border border-gray-200 py-1.5 pl-7 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="max-h-60 overflow-auto py-1">
              {multiple && (
                <button
                  type="button"
                  disabled={valoresSelecionados.length === 0}
                  onClick={() => onChange([])}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  Limpar seleção
                </button>
              )}
              {!multiple && clearable && (
                <button
                  type="button"
                  onClick={() => selecionar(null)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50"
                >
                  {placeholder}
                </button>
              )}
              {filtrados.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</p>
              ) : (
                filtrados.map((opcao) => {
                  const ativo = multiple
                    ? valoresSelecionados.some((v) => String(v) === String(opcao.value))
                    : String(opcao.value) === String(value);
                  return (
                    <button
                      key={opcao.value}
                      type="button"
                      onClick={() => selecionar(opcao)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50 ${
                        ativo ? 'bg-primary-50 text-primary-600' : 'text-gray-900'
                      }`}
                    >
                      {multiple && (
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            ativo ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300'
                          }`}
                        >
                          {ativo && <Check size={11} strokeWidth={3} />}
                        </span>
                      )}
                      <span className="truncate">{opcao.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
