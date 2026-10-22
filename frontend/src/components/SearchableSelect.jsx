import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  // Classes de borda/fundo do gatilho padrão — substituem (não somam a)
  // `border-gray-200`, pra evitar conflito de especificidade do Tailwind
  // entre a cor padrão e uma cor de estado (ex.: o par âmbar/azul de
  // "vazio"/"preenchido" usado em RepassesCef/HistoricoEtapasModal.jsx).
  corClasses = 'border-gray-200',
  // Só com `multiple`: troca o "Limpar seleção" do topo da lista por
  // "Selecionar todos" (marca todas as opções) — e, quando todas já estão
  // marcadas, por "Desmarcar todos". Usado nas telas em que o filtro nasce
  // com tudo marcado (ex.: EmpreendimentosMasaPage.jsx).
  selecionarTodos = false,
  // Largura mínima do painel de opções, em px — o gatilho (campo) continua do tamanho dele, só o
  // painel que abre fica mais largo (ex.: Máscara DFC no Plano Contas da DFC Construtoras).
  larguraPainel = 0,
  // Classe de altura máxima da lista de opções (padrão max-h-60).
  alturaLista = 'max-h-60',
  // Gatilho baixo, de texto pequeno — mesma altura das comboboxes das linhas da aba Máscaras da DRE
  // (ex.: Máscara DRE no Plano de Contas da DRE Gerencial). O painel que abre não muda.
  compacto = false,
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const listaRef = useRef(null);

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
    const width = Math.min(Math.max(rect.width, LARGURA_MINIMA_PAINEL, larguraPainel), window.innerWidth - 16);
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
  // fim da viewport, vira pra cima dele. Se não couber nem embaixo nem em
  // cima, fica do lado com mais espaço e a lista encolhe (com rolagem) até
  // caber — o painel nunca passa da tela.
  useLayoutEffect(() => {
    if (!open || !coords || !dropdownRef.current || coords.viradoParaCima !== undefined) return;
    const alturaPainel = dropdownRef.current.offsetHeight;
    const espacoAbaixo = window.innerHeight - 8 - coords.top;
    const espacoAcima = coords.gatilhoTop - 4 - 8;
    if (alturaPainel <= espacoAbaixo) return;
    if (alturaPainel <= espacoAcima) {
      setCoords((prev) => ({ ...prev, top: prev.gatilhoTop - alturaPainel - 4, viradoParaCima: true }));
      return;
    }
    const resto = alturaPainel - (listaRef.current?.offsetHeight || 0);
    const paraCima = espacoAcima > espacoAbaixo;
    const maxLista = Math.max(80, (paraCima ? espacoAcima : espacoAbaixo) - resto);
    setCoords((prev) => ({
      ...prev,
      maxLista,
      top: paraCima ? prev.gatilhoTop - (resto + maxLista) - 4 : prev.top,
      viradoParaCima: paraCima,
    }));
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

  // Opção com `grupo` (texto): a lista mostra um título não clicável com o nome do grupo antes da
  // primeira opção dele (as opções vêm já ordenadas por grupo). A busca também acha pelo grupo.
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(termo) || (o.grupo || '').toLowerCase().includes(termo)
    );
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
  const todosSelecionados =
    multiple && options.every((o) => valoresSelecionados.some((v) => String(v) === String(o.value)));

  return (
    <div ref={containerRef} className="relative">
      {renderTrigger ? (
        renderTrigger({ open, toggle: () => (disabled ? null : open ? setOpen(false) : abrir()), temSelecao })
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : abrir())}
          className={`flex w-full items-center justify-between border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:opacity-60 ${
            compacto ? 'h-6.75 rounded-md px-1.5 text-xs' : 'rounded-lg px-3 py-2 text-sm'
          } ${corClasses}`}
        >
          <span className={`truncate ${temSelecao ? 'text-gray-900' : 'text-gray-400'}`}>{rotuloBotao}</span>
          <ChevronDown size={compacto ? 14 : 16} className="shrink-0 text-gray-400" />
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
            <div
              ref={listaRef}
              className={`${alturaLista} overflow-auto py-1`}
              style={coords.maxLista ? { maxHeight: coords.maxLista } : undefined}
            >
              {multiple && selecionarTodos && (
                <button
                  type="button"
                  onClick={() => onChange(todosSelecionados ? [] : options.map((o) => o.value))}
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-primary-600 hover:bg-gray-50"
                >
                  {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              )}
              {multiple && !selecionarTodos && (
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
                filtrados.map((opcao, i) => {
                  const ativo = multiple
                    ? valoresSelecionados.some((v) => String(v) === String(opcao.value))
                    : String(opcao.value) === String(value);
                  const abreGrupo = opcao.grupo && opcao.grupo !== filtrados[i - 1]?.grupo;
                  return (
                    <Fragment key={opcao.value}>
                      {abreGrupo && (
                        <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          {opcao.grupo}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => selecionar(opcao)}
                        className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm hover:bg-primary-50 ${
                          opcao.grupo ? 'pl-6' : 'pl-3'
                        } ${ativo ? 'bg-primary-50 text-primary-600' : 'text-gray-900'}`}
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
                    </Fragment>
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
