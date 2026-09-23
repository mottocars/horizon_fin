import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { MESES, SEMANA_CURTA, deISO, formatarDataBR, hojeISO, paraISO, semanaDe } from './constantes';

// 6 linhas x 7 colunas (domingo a sábado) cobrindo o mês inteiro, mais os dias de antes/depois
// que completam a 1ª/última semana. Cada LINHA é exatamente 1 semana — a mesma unidade que a
// tela seleciona — por isso passar o mouse ou clicar em qualquer dia de uma linha afeta a
// semana inteira, não só aquele dia.
function construirMes(ano, mes) {
  const primeiroDia = new Date(ano, mes, 1);
  const cursor = new Date(ano, mes, 1 - primeiroDia.getDay());
  const linhas = [];
  for (let l = 0; l < 6; l++) {
    const linha = [];
    for (let c = 0; c < 7; c++) {
      linha.push({ iso: paraISO(cursor), dia: cursor.getDate(), dentroDoMes: cursor.getMonth() === mes });
      cursor.setDate(cursor.getDate() + 1);
    }
    linhas.push(linha);
  }
  return linhas;
}

const LARGURA_PAINEL = 300;

// Seletor de período travado em semana (domingo a sábado — pedido do usuário, pra tabela de
// saldos nunca ficar larga demais). O gatilho mostra o intervalo por extenso ("20/09/2026 a
// 26/09/2026"); o painel é um calendário onde passar o mouse por cima de qualquer dia já
// colore a semana INTEIRA daquela linha (prévia de qual semana seria escolhida ao clicar) —
// mesmo padrão de portal/posicionamento/clique-fora do SearchableSelect.jsx, sem a busca (o
// calendário não precisa). `value`/`onChange` trabalham sempre com o domingo (ISO) da semana.
export default function SeletorSemana({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [mesVisivel, setMesVisivel] = useState(() => {
    const d = deISO(value);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const [semanaHover, setSemanaHover] = useState(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  const { fim } = useMemo(() => semanaDe(value), [value]);
  const linhas = useMemo(() => construirMes(mesVisivel.ano, mesVisivel.mes), [mesVisivel]);
  const hoje = hojeISO();

  function medirGatilho() {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, LARGURA_PAINEL);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 4, left: Math.max(8, left), width, gatilhoTop: rect.top });
  }

  useEffect(() => {
    if (!open) return;
    // Sempre reabre focado no mês da semana selecionada — não fica preso onde a navegação
    // (setas de mês) parou da última vez que o painel foi usado.
    const d = deISO(value);
    setMesVisivel({ ano: d.getFullYear(), mes: d.getMonth() });
    setSemanaHover(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !coords || !dropdownRef.current) return;
    const altura = dropdownRef.current.offsetHeight;
    const cabeAbaixo = coords.top + altura <= window.innerHeight - 8;
    if (!cabeAbaixo && coords.gatilhoTop - altura - 4 > 0 && coords.viradoParaCima === undefined) {
      setCoords((prev) => ({ ...prev, top: prev.gatilhoTop - altura - 4, viradoParaCima: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords?.top, coords?.left]);

  useEffect(() => {
    function handleClickFora(e) {
      const dentroGatilho = containerRef.current && containerRef.current.contains(e.target);
      const dentroPainel = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!dentroGatilho && !dentroPainel) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  function mudarMes(delta) {
    setMesVisivel((atual) => {
      const d = new Date(atual.ano, atual.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  function selecionar(domingoIso) {
    onChange(domingoIso);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (disabled ? null : setOpen((o) => !o))}
        className="flex w-auto items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-60"
      >
        <Calendar size={15} className="shrink-0 text-gray-400" />
        <span className="truncate">
          {formatarDataBR(value)} a {formatarDataBR(fim)}
        </span>
      </button>

      {open &&
        !disabled &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
            className="z-[100] rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => mudarMes(-1)}
                title="Mês anterior"
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {MESES[mesVisivel.mes]} de {mesVisivel.ano}
              </span>
              <button
                type="button"
                onClick={() => mudarMes(1)}
                title="Próximo mês"
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7">
              {SEMANA_CURTA.map((s) => (
                <div key={s} className="py-1 text-center text-[10px] font-medium uppercase text-gray-400">
                  {s}
                </div>
              ))}
            </div>

            {/* onMouseLeave no container das linhas (não em cada linha): sem isso, mover o
                mouse de uma linha direto pra outra "pisca" sem prévia nenhuma por um instante
                entre o mouseleave de uma e o mouseenter da seguinte. */}
            <div onMouseLeave={() => setSemanaHover(null)}>
              {linhas.map((linha) => {
                const domingoLinha = linha[0].iso;
                const selecionada = domingoLinha === value;
                const emPreviaDeHover = domingoLinha === semanaHover;
                return (
                  <div
                    key={domingoLinha}
                    onMouseEnter={() => setSemanaHover(domingoLinha)}
                    onClick={() => selecionar(domingoLinha)}
                    className={`grid cursor-pointer grid-cols-7 rounded-md transition-colors ${
                      emPreviaDeHover ? 'bg-primary-100' : selecionada ? 'bg-primary-50' : ''
                    }`}
                  >
                    {linha.map((d) => (
                      <div key={d.iso} className="flex items-center justify-center py-1">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                            d.iso === hoje ? 'font-semibold text-primary-600 ring-1 ring-primary-300' : ''
                          } ${d.dentroDoMes ? 'text-gray-800' : 'text-gray-300'}`}
                        >
                          {d.dia}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
