import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const NOMES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const montar = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;

// Campo de mês compacto ("nov/2026") em duas partes, como o campo de data do navegador (pedido do
// usuário): clicar no mês o seleciona e o que se digita troca só ele; o ano é outra parte.
//   Mês — letras: assim que só um mês começa pelo que foi digitado ("f" = fev; "ma" espera, "mar" = mar)
//         ele vale e o cursor vai pro ano; números: 2 a 9 = o mês, 0/1 esperam o segundo dígito (12 = dez).
//   Ano — só dígitos; com 4 vale. Saindo com 2 dígitos vira 20xx; com 1 ou 3, volta ao de antes.
// Digitar corrido ("fevereiro/2020", "fev2020") funciona: o que sobra de letra e a barra são ignorados no
// ano. ↑/↓ mudam a parte selecionada, ←/→ trocam de parte, Backspace apaga. O ícone abre o painel com o
// ano (setas) e os 12 meses. `valor` / `onChange` em 'AAAA-MM'; `min` / `max` ('AAAA-MM') limitam o painel.
export default function SeletorMes({ valor, onChange, disabled = false, min, max, title }) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(null); // 'mes' | 'ano' | null
  const [bufMes, setBufMes] = useState('');
  const [bufAno, setBufAno] = useState('');
  const [anoPainel, setAnoPainel] = useState(() => Number((valor || mesDeHoje()).slice(0, 4)));
  const raiz = useRef(null);
  const refMes = useRef(null);
  const refAno = useRef(null);
  const tempo = useRef(null);
  const atual = mesDeHoje();
  // O valor que vale NO CAMPO: muda na hora em que se digita (a página aplica o `valor` novo um pouco
  // depois — sem isto, "fevereiro/2020" digitado corrido juntava o ano com o mês antigo).
  const [local, setLocal] = useState(valor);
  const localRef = useRef(valor);
  useEffect(() => {
    setLocal(valor);
    localRef.current = valor;
  }, [valor]);
  const base = local || atual;
  const anoValor = Number(base.slice(0, 4));
  const mesValor = Number(base.slice(5, 7));
  const agora = () => {
    const b = localRef.current || atual;
    return { ano: Number(b.slice(0, 4)), mes: Number(b.slice(5, 7)) };
  };
  const dentro = (v) => (!min || v >= min) && (!max || v <= max);

  useEffect(() => {
    if (!aberto) return undefined;
    setAnoPainel(anoValor);
    const fora = (e) => raiz.current && !raiz.current.contains(e.target) && setAberto(false);
    const tecla = (e) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('mousedown', fora);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', tecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  useEffect(() => () => clearTimeout(tempo.current), []);

  const aplicar = (v) => {
    const mudou = v !== localRef.current;
    localRef.current = v;
    setLocal(v);
    if (mudou) onChange(v);
  };
  // O que foi digitado no mês "esquece" depois de 1 s parado (como no campo de data do navegador).
  const reiniciarDepois = () => {
    clearTimeout(tempo.current);
    tempo.current = setTimeout(() => setBufMes(''), 1000);
  };

  function teclaMes(e) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const m = ((agora().mes - 1 + (k === 'ArrowUp' ? 1 : -1) + 12) % 12) + 1;
      aplicar(montar(agora().ano, m));
      return;
    }
    if (k === 'ArrowRight' || k === '/') {
      e.preventDefault();
      refAno.current?.focus();
      return;
    }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      setBufMes('');
      return;
    }
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      const buf = /^\d$/.test(bufMes) ? bufMes + k : k;
      const n = Number(buf);
      if (buf.length === 1 && n <= 1) {
        // 0 ou 1: espera o segundo dígito (1 já mostra jan).
        if (n === 1) aplicar(montar(agora().ano, 1));
        setBufMes(buf);
        reiniciarDepois();
        return;
      }
      // Dois dígitos que não são mês (00, 13…): fica o que estava e vai pro ano.
      const mes = n >= 1 && n <= 12 ? n : null;
      if (mes) aplicar(montar(agora().ano, mes));
      setBufMes('');
      refAno.current?.focus();
      return;
    }
    if (/^[a-zA-ZçÇãÃâÂéÉêÊíÍóÓôÔõÕúÚ]$/.test(k)) {
      e.preventDefault();
      const buf = semAcento((/^\d/.test(bufMes) ? '' : bufMes) + k);
      const candidatos = NOMES.map((nome, i) => ({ nome, i })).filter((x) => x.nome.startsWith(buf));
      if (!candidatos.length) {
        // Não bate com nenhum mês: recomeça pela letra.
        setBufMes('');
        return;
      }
      aplicar(montar(agora().ano, candidatos[0].i + 1));
      if (candidatos.length === 1) {
        setBufMes('');
        refAno.current?.focus();
      } else {
        setBufMes(buf);
        reiniciarDepois();
      }
    }
  }

  function confirmarAno(buf = bufAno) {
    setBufAno('');
    if (!buf) return;
    const a = buf.length === 2 ? 2000 + Number(buf) : buf.length === 4 ? Number(buf) : null;
    if (a && a >= 1900) aplicar(montar(a, agora().mes));
  }

  function teclaAno(e) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      setBufAno('');
      aplicar(montar(agora().ano + (k === 'ArrowUp' ? 1 : -1), agora().mes));
      return;
    }
    if (k === 'ArrowLeft') {
      e.preventDefault();
      confirmarAno();
      refMes.current?.focus();
      return;
    }
    if (k === 'Enter') {
      e.preventDefault();
      confirmarAno();
      return;
    }
    if (k === 'Escape') {
      setBufAno('');
      return;
    }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      setBufAno((b) => b.slice(0, -1));
      return;
    }
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      const buf = (bufAno + k).slice(-4);
      if (buf.length === 4) confirmarAno(buf);
      else setBufAno(buf);
      return;
    }
    // Letras e a barra (de "fevereiro/2020" digitado corrido) não entram no ano.
    if (k.length === 1) e.preventDefault();
  }

  const segmento = (ativo) =>
    `rounded px-0.5 outline-none ${ativo ? 'bg-primary-100 text-primary-800' : ''} ${disabled ? '' : 'cursor-text'}`;

  return (
    <div ref={raiz} className="relative">
      <div
        title={title || 'Clique no mês ou no ano e digite (ex.: mar, 03, 2027)'}
        className={`flex w-full items-center rounded-lg border bg-white transition-colors ${disabled ? 'bg-gray-50 text-gray-400' : ''} ${
          aberto || foco ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-200'
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center py-2 pl-2.5 text-sm tabular-nums">
          <span
            ref={refMes}
            role="spinbutton"
            aria-label="Mês"
            aria-valuenow={mesValor}
            tabIndex={disabled ? -1 : 0}
            onFocus={() => {
              setFoco('mes');
              setBufMes('');
            }}
            onBlur={() => setFoco((f) => (f === 'mes' ? null : f))}
            onKeyDown={disabled ? undefined : teclaMes}
            className={segmento(foco === 'mes')}
          >
            {local ? MESES[mesValor - 1] : 'mmm'}
          </span>
          <span className="text-gray-400">/</span>
          <span
            ref={refAno}
            role="spinbutton"
            aria-label="Ano"
            aria-valuenow={anoValor}
            tabIndex={disabled ? -1 : 0}
            onFocus={() => {
              setFoco('ano');
              setBufAno('');
            }}
            onBlur={() => {
              confirmarAno();
              setFoco((f) => (f === 'ano' ? null : f));
            }}
            onKeyDown={disabled ? undefined : teclaAno}
            className={segmento(foco === 'ano')}
          >
            {bufAno ? bufAno.padStart(4, '·') : local ? anoValor : 'aaaa'}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAberto((a) => !a)}
          className="shrink-0 rounded-r-lg px-2.5 py-2 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
          aria-label="Escolher o mês"
          title="Escolher o mês"
        >
          <CalendarDays size={15} />
        </button>
      </div>
      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 animate-item-sobe rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAnoPainel((a) => a - 1)}
              disabled={Boolean(min) && anoPainel <= Number(min.slice(0, 4))}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              aria-label="Ano anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold tabular-nums text-gray-900">{anoPainel}</span>
            <button
              type="button"
              onClick={() => setAnoPainel((a) => a + 1)}
              disabled={Boolean(max) && anoPainel >= Number(max.slice(0, 4))}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
              aria-label="Próximo ano"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MESES.map((m, i) => {
              const chave = montar(anoPainel, i + 1);
              const escolhido = chave === valor;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!dentro(chave)}
                  onClick={() => {
                    setAberto(false);
                    aplicar(chave);
                  }}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    escolhido
                      ? 'bg-primary-600 text-white'
                      : chave === atual
                        ? 'text-primary-700 ring-1 ring-primary-200 hover:bg-primary-50'
                        : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
