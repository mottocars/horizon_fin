// Vitrine do login: os títulos do site com uma mini tela animada do sistema, em ordem aleatória. O primeiro tema de
// cada visita sai dos que a pessoa ainda não viu (ou viu há mais tempo) — a lista dos já mostrados fica no
// localStorage —, então quem passa poucos segundos no login vê um assunto diferente da vez anterior. Só aparece em
// telas largas (lg); é decorativa (aria-hidden).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { TEMAS, movimentoReduzido } from './vitrine/temas';
import './vitrine/vitrine.css';

const CHAVE = 'horizon_vitrine_vistos';
const DURACAO = 9000; // ms de cada tema (o hover pausa)
const SAIDA = 650; // ms da animação de saída
const RECENTES = 4; // depois de ver todos, o primeiro tema da visita não é nenhum dos 4 últimos mostrados

function lerVistos() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function marcarVisto(id) {
  try {
    const v = [id, ...lerVistos().filter((x) => x !== id)].slice(0, TEMAS.length);
    localStorage.setItem(CHAVE, JSON.stringify(v));
  } catch {
    // sem localStorage (aba anônima, bloqueado): só perde a memória entre visitas
  }
}

function embaralhar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fila da visita: o primeiro sorteado entre os nunca vistos (ou, se já viu todos, fora dos últimos), o resto
// embaralhado. Quando a fila acaba, outra embaralhada que não repete o tema que está na tela.
function montarFila(atual) {
  if (atual) {
    const fila = embaralhar(TEMAS);
    if (fila[0] === atual) fila.push(fila.shift());
    return fila;
  }
  const vistos = lerVistos();
  const nunca = TEMAS.filter((t) => !vistos.includes(t.id));
  const candidatos = nunca.length ? nunca : TEMAS.filter((t) => !vistos.slice(0, RECENTES).includes(t.id));
  const primeiro = candidatos[Math.floor(Math.random() * candidatos.length)];
  return [primeiro, ...embaralhar(TEMAS.filter((t) => t !== primeiro))];
}

function useMedia(consulta) {
  const [casa, setCasa] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const mudou = () => setCasa(m.matches);
    m.addEventListener('change', mudou);
    return () => m.removeEventListener('change', mudou);
  }, [consulta]);
  return casa;
}

// Título palavra por palavra (cada uma sobe de dentro de uma máscara); a segunda frase vai na cor do tema.
function Titulo({ texto }) {
  const frases = texto.split(/(?<=[?.])\s+/);
  let i = 0;
  return (
    <h2 className="vt-titulo">
      {frases.map((frase, k) => (
        <Fragment key={k}>
          {k > 0 && ' '}
          <span className={k ? 'vt-destaque' : undefined}>
            {frase.split(' ').map((p, j) => (
              <Fragment key={j}>
                {j > 0 && ' '}
                <span className="vt-p">
                  <span style={{ '--i': i++ }}>{p}</span>
                </span>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </h2>
  );
}

// Células da grade de fundo que acendem devagar, em lugares sorteados.
function Celulas() {
  const celulas = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        col: Math.floor(Math.random() * 22),
        lin: Math.floor(Math.random() * 22),
        atraso: Math.random() * 9,
        dur: 5 + Math.random() * 5,
      })),
    []
  );
  return (
    <div className="vt-celulas">
      {celulas.map((c, i) => (
        <span key={i} style={{ left: c.col * 44, top: c.lin * 44, animationDelay: `${c.atraso}s`, animationDuration: `${c.dur}s` }} />
      ))}
    </div>
  );
}

function Palco() {
  const [reduzido] = useState(movimentoReduzido);
  const [estado, setEstado] = useState(() => ({ fila: montarFila(null), pos: 0, volta: 0 }));
  const [saindo, setSaindo] = useState(false);
  const raiz = useRef(null);
  const cena = useRef(null);
  const escala = useRef(null);
  const espera = useRef(0);
  const quadro = useRef(0);
  const tema = estado.fila[estado.pos];
  const { Visual, Icone } = tema;

  // Conta como visto assim que aparece: mesmo uma olhada rápida empurra o tema para o fim da próxima visita.
  useEffect(() => {
    marcarVisto(tema.id);
  }, [tema.id, estado.volta]);

  useEffect(
    () => () => {
      clearTimeout(espera.current);
      cancelAnimationFrame(quadro.current);
    },
    []
  );

  // A tela do tema encolhe (sem mudar de proporção) quando a janela é baixa demais para ela.
  useEffect(() => {
    const ajustar = () => {
      if (!cena.current || !escala.current) return;
      const k = Math.min(1, cena.current.clientHeight / escala.current.offsetHeight);
      escala.current.style.setProperty('--k', k.toFixed(3));
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(cena.current);
    ro.observe(escala.current);
    ajustar();
    return () => ro.disconnect();
  }, []);

  function avancar() {
    setSaindo(true);
    espera.current = setTimeout(
      () => {
        setEstado((e) =>
          e.pos + 1 < e.fila.length ? { ...e, pos: e.pos + 1 } : { fila: montarFila(e.fila[e.pos]), pos: 0, volta: e.volta + 1 }
        );
        setSaindo(false);
      },
      reduzido ? 0 : SAIDA
    );
  }

  // Inclinação e luz seguindo o mouse (variáveis CSS, sem re-render).
  function mover(e) {
    const el = raiz.current;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', ((px / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty('--my', ((py / r.height) * 2 - 1).toFixed(3));
      el.style.setProperty('--px', `${px}px`);
      el.style.setProperty('--py', `${py}px`);
    });
  }

  function largar() {
    cancelAnimationFrame(quadro.current);
    raiz.current.style.setProperty('--mx', '0');
    raiz.current.style.setProperty('--my', '0');
  }

  const chave = `${estado.volta}-${estado.pos}`;
  return (
    <div
      ref={raiz}
      className={`vitrine ${saindo ? 'sai' : ''}`}
      style={{ '--vt-cor': tema.cor, '--vt-dur': `${reduzido ? DURACAO + 3000 : DURACAO}ms` }}
      onMouseMove={mover}
      onMouseLeave={largar}
      aria-hidden="true"
    >
      <div className="vt-fundo">
        <div className="vt-aurora">
          <i />
          <i />
        </div>
        <div className="vt-grade-fundo" />
        <Celulas />
        <div className="vt-luz" />
      </div>

      <div className="vt-conteudo">
        <div className="vt-topo" key={`m${chave}`}>
          <span className="vt-modulo">
            <Icone size={14} strokeWidth={2.2} />
            {tema.modulo}
          </span>
        </div>

        <div className="vt-meio">
          <div className="vt-texto" key={`t${chave}`}>
            <Titulo texto={tema.titulo()} />
            <p className="vt-apoio">{tema.apoio}</p>
          </div>
          <div className="vt-cena" ref={cena}>
            <div className="vt-escala" ref={escala}>
              <div className="vt-tilt">
                <div className="vt-cartao" key={`c${chave}`}>
                  <Visual />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="vt-rodape">
          <div className="vt-progresso">
            <i key={chave} onAnimationEnd={avancar} />
          </div>
          <span>Dados ilustrativos de uma empresa fictícia</span>
        </div>
      </div>
    </div>
  );
}

export default function Vitrine() {
  const larga = useMedia('(min-width: 1024px)');
  return larga ? <Palco /> : null;
}
