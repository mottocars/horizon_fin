import { useEffect, useState } from 'react';
import Modal from '../../../../components/Modal';
import Avatar from '../../../Home/PlanoDeVoo/Avatar';
import { versaoPublicadaDre } from '../../../../api/dreVersoes.api';

const data = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '');
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '');
const mesmo = (a, b) => (a?.id ? a.id === b?.id : a?.nome === b?.nome);

// Rótulo pequeno em caixa-alta, como a linha do nome do dashboard no CabecalhoDashboard.
function Rotulo({ children }) {
  return <div className="mb-1 font-display text-[9px] font-bold uppercase tracking-[0.14em] text-[#6b7780] [font-stretch:125%]">{children}</div>;
}

function Foto({ pessoa, onAbrir, titulo }) {
  return (
    <button type="button" onClick={() => onAbrir(pessoa)} className="flex rounded-full transition hover:z-10 hover:scale-110 focus:outline-none" title={titulo}>
      <Avatar usuario={pessoa} tamanho="md" titulo={titulo} />
    </button>
  );
}

// Dashboard Econômico Financeiro › Demonstração do Resultado, no cabeçalho, antes da logomarca (pedido do usuário):
// a versão publicada da DRE (a última salva — Operações › DRE Construtoras › Versões) e quem fez ela —
// Responsável (quem abriu e quem fechou), Aprovador (a aprovação ainda vai existir: por enquanto, quem fechou)
// e Colaboradores (todo usuário com alguma alteração carimbada na versão). Clicar numa foto abre os detalhes.
export default function VersaoPublicada({ empresaId }) {
  const [v, setV] = useState(null);
  const [pessoa, setPessoa] = useState(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    setV(null);
    if (!empresaId) return undefined;
    let ativo = true;
    versaoPublicadaDre(empresaId)
      .then((r) => ativo && setV(r))
      .catch(() => ativo && setV(null));
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  if (!v) return null;

  const responsaveis = mesmo(v.abriu, v.fechou) ? [{ p: v.abriu, t: 'Abriu e fechou a versão' }] : [
    { p: v.abriu, t: 'Abriu a versão' },
    { p: v.fechou, t: 'Fechou a versão' },
  ];
  const visiveis = v.colaboradores.slice(0, 4);
  const resto = v.colaboradores.length - visiveis.length;

  // O que a pessoa fez nesta versão (a janela da foto).
  const papeis = (x) => {
    const l = [];
    if (mesmo(x, v.abriu)) l.push(`Abriu a versão ${v.numero} em ${dataHora(v.aberta_em)}`);
    if (mesmo(x, v.fechou)) l.push(`Fechou (salvou) a versão ${v.numero} em ${dataHora(v.fechada_em)}`);
    if (mesmo(x, v.aprovador)) l.push('Aprovador — por enquanto, quem fechou a versão (a aprovação ainda vai existir)');
    const c = v.colaboradores.find((y) => mesmo(x, y));
    if (c) {
      l.push(
        `${c.alteracoes === 1 ? '1 alteração' : `${c.alteracoes} alterações`} nesta versão${
          c.primeira ? ` (${data(c.primeira) === data(c.ultima) ? `em ${data(c.primeira)}` : `de ${data(c.primeira)} a ${data(c.ultima)}`})` : ''
        }`
      );
    }
    return l;
  };

  return (
    <div className="flex items-end gap-5">
      <div>
        <Rotulo>Versão</Rotulo>
        <div className="flex h-9 flex-col justify-center">
          <div className="whitespace-nowrap text-[13px] leading-tight text-[#13202a]">
            <b className="font-semibold">Versão {v.numero}</b> <span className="font-mono text-[11px] text-[#44525c]">· {data(v.fechada_em)}</span>
          </div>
          <div className="whitespace-nowrap text-[11px] leading-tight text-[#6b7780]">realizado até {mesCurto(v.corte)}</div>
        </div>
      </div>
      <div className="h-10 w-px bg-[#d3dade]" />
      <div>
        <Rotulo>Responsável</Rotulo>
        <div className="flex h-9 items-center -space-x-2">
          {responsaveis.map(({ p, t }) => (
            <Foto key={t} pessoa={p} onAbrir={setPessoa} titulo={`${p.nome} — ${t}`} />
          ))}
        </div>
      </div>
      <div>
        <Rotulo>Aprovador</Rotulo>
        <div className="flex h-9 items-center">
          <Foto pessoa={v.aprovador} onAbrir={setPessoa} titulo={`${v.aprovador.nome} — Aprovador`} />
        </div>
      </div>
      <div>
        <Rotulo>Colaboradores</Rotulo>
        {v.colaboradores.length ? (
          <div className="flex h-9 items-center -space-x-2">
            {visiveis.map((c) => (
              <Foto key={c.id || c.nome} pessoa={c} onAbrir={setPessoa} titulo={`${c.nome} — ${c.alteracoes === 1 ? '1 alteração' : `${c.alteracoes} alterações`}`} />
            ))}
            {resto > 0 && (
              <button
                type="button"
                onClick={() => setTodos(true)}
                title="Ver todos os colaboradores"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e8ecef] text-xs font-semibold text-[#44525c] ring-2 ring-white hover:bg-[#dde3e7]"
              >
                +{resto}
              </button>
            )}
          </div>
        ) : (
          <div className="h-9 text-[11px] leading-9 text-[#6b7780]">sem alterações</div>
        )}
      </div>

      <Modal open={Boolean(pessoa)} onClose={() => setPessoa(null)} title={`Versão ${v.numero} da DRE`} maxWidthClass="max-w-sm">
        {pessoa && (
          <div className="flex flex-col items-center text-center">
            <Avatar usuario={pessoa} tamanho="xxl" anel={false} />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">{pessoa.nome}</h3>
            <ul className="mt-3 w-full space-y-1.5 text-left text-sm text-gray-600">
              {papeis(pessoa).map((t) => (
                <li key={t} className="rounded-lg bg-gray-50 px-3 py-2">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal open={todos} onClose={() => setTodos(false)} title={`Colaboradores da versão ${v.numero}`} maxWidthClass="max-w-sm">
        <ul className="space-y-1">
          {v.colaboradores.map((c) => (
            <li key={c.id || c.nome}>
              <button
                type="button"
                onClick={() => {
                  setTodos(false);
                  setPessoa(c);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
              >
                <Avatar usuario={c} tamanho="md" anel={false} />
                <span className="flex-1 text-sm font-medium text-gray-800">{c.nome}</span>
                <span className="text-xs text-gray-400">{c.alteracoes === 1 ? '1 alteração' : `${c.alteracoes} alterações`}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
