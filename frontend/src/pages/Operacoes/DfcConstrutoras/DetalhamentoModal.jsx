import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileSearch, Info, Search, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import { getDetalhamentoDfc } from '../../../api/dfcDetalhamento.api';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Formatos que o backend manda em cada valor (dfc-detalhamento).
function formatar(v, formato) {
  if (v === null || v === undefined || v === '') return '—';
  switch (formato) {
    case 'moeda':
      return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'pct':
      return `${(Number(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    case 'pct4':
      return `${(Number(v) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
    case 'int':
      return Number(v).toLocaleString('pt-BR');
    case 'data':
      return String(v).slice(0, 10).split('-').reverse().join('/');
    case 'datahora':
      return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'mes':
      return `${MESES[Number(String(v).slice(5, 7)) - 1]}/${String(v).slice(0, 4)}`;
    default:
      return String(v);
  }
}

const numerico = (formato) => ['moeda', 'pct', 'pct4', 'int'].includes(formato);
const corDinheiro = (v, formato) => (formato === 'moeda' && Number(v) < 0 ? 'text-rose-600' : '');

function Campos({ bloco }) {
  return (
    <div>
      {bloco.titulo && <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{bloco.titulo}</h4>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-gray-50 px-4 py-3 sm:grid-cols-4">
        {bloco.itens.map((c) => (
          <div key={c.rotulo} className="min-w-0">
            <dt className="truncate text-[11px] text-gray-500" title={c.rotulo}>
              {c.rotulo}
            </dt>
            <dd className={`mt-0.5 truncate text-sm font-medium tabular-nums text-gray-900 ${corDinheiro(c.valor, c.formato)}`}>
              {formatar(c.valor, c.formato)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// A conta passo a passo: operador | descrição (e de onde veio) | valor; o resultado em destaque.
function Passos({ bloco }) {
  return (
    <div>
      {bloco.titulo && <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{bloco.titulo}</h4>}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        {bloco.itens.map((p, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 text-sm ${i > 0 ? 'border-t border-gray-100' : ''} ${
              p.destaque ? 'bg-primary-50 font-semibold text-gray-900' : 'text-gray-700'
            }`}
          >
            <span className="w-4 shrink-0 text-center font-mono text-base leading-none text-gray-400">{p.op || ''}</span>
            <span className="min-w-0 flex-1">
              <span className="block">{p.rotulo}</span>
              {p.nota && <span className="block text-[11px] font-normal text-gray-400">{p.nota}</span>}
            </span>
            <span className={`shrink-0 tabular-nums ${corDinheiro(p.valor, p.formato)}`}>{formatar(p.valor, p.formato)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tabela({ bloco }) {
  const [busca, setBusca] = useState('');
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return bloco.linhas;
    return bloco.linhas.filter((l) => bloco.colunas.some((c) => String(formatar(l[c.chave], c.formato)).toLowerCase().includes(termo)));
  }, [busca, bloco]);

  // Curva de desembolso e afins: poucas colunas, mostradas lado a lado.
  if (bloco.horizontal) {
    const [rotulo, valor] = bloco.colunas;
    return (
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{bloco.titulo}</h4>
        <div className="flex flex-wrap gap-2">
          {bloco.linhas.map((l) => (
            <div key={l[rotulo.chave]} className="min-w-20 rounded-lg border border-gray-200 px-3 py-2 text-center">
              <div className="text-[11px] text-gray-500">{l[rotulo.chave]}</div>
              <div className={`text-sm font-medium tabular-nums ${Number(l[valor.chave]) ? 'text-gray-900' : 'text-gray-300'}`}>
                {formatar(l[valor.chave], valor.formato)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const filtrado = linhas.length !== bloco.linhas.length;
  // Tabela larga: a última coluna (o valor que soma no DFC) fica presa à direita ao rolar.
  const SOMBRA = 'shadow-[-6px_0_8px_-6px_rgba(16,24,40,0.15)]';
  const fixa = (i) => (bloco.colunas.length > 4 && i === bloco.colunas.length - 1 ? `sticky right-0 ${SOMBRA}` : '');
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{bloco.titulo}</h4>
        <span className="text-[11px] text-gray-400">
          {filtrado ? `${linhas.length} de ${bloco.linhas.length}` : bloco.linhas.length} {bloco.linhas.length === 1 ? 'linha' : 'linhas'}
        </span>
        {bloco.busca && bloco.linhas.length > 0 && (
          <label className="relative ml-auto">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar"
              className="w-52 rounded-lg border border-gray-200 py-1 pl-7 pr-2 text-xs focus:border-primary-500 focus:outline-none"
            />
          </label>
        )}
      </div>
      {bloco.linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">{bloco.vazio || 'Nada.'}</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {bloco.colunas.map((c, i) => (
                  <th
                    key={c.chave}
                    className={`${fixa(i) ? `${fixa(i)} z-20` : 'z-10'} sticky top-0 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-500 ${
                      numerico(c.formato) ? 'text-right' : 'text-left'
                    }`}
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="group">
                  {bloco.colunas.map((c, j) => (
                    <td
                      key={c.chave}
                      className={`border-b border-gray-100 bg-white px-3 py-1.5 text-gray-700 group-hover:bg-gray-50 ${fixa(j)} ${
                        numerico(c.formato) ? 'whitespace-nowrap text-right tabular-nums' : c.formato === 'texto' ? 'max-w-56 truncate' : 'whitespace-nowrap'
                      } ${corDinheiro(l[c.chave], c.formato)}`}
                      title={c.formato === 'texto' ? String(l[c.chave] ?? '') : undefined}
                    >
                      {formatar(l[c.chave], c.formato)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {bloco.total && !filtrado && (
              <tfoot>
                <tr>
                  {bloco.colunas.map((c, i) => (
                    <td
                      key={c.chave}
                      className={`${fixa(i) ? `${fixa(i)} z-20` : ''} sticky bottom-0 whitespace-nowrap border-t border-gray-200 bg-gray-50 px-3 py-2 font-semibold tabular-nums text-gray-900 ${
                        numerico(c.formato) ? 'text-right' : ''
                      } ${corDinheiro(bloco.total[c.chave], c.formato)}`}
                    >
                      {i === 0 ? 'Total' : c.chave in bloco.total ? formatar(bloco.total[c.chave], c.formato) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function Bloco({ bloco }) {
  if (bloco.tipo === 'campos') return <Campos bloco={bloco} />;
  if (bloco.tipo === 'passos') return <Passos bloco={bloco} />;
  if (bloco.tipo === 'tabela') return <Tabela bloco={bloco} />;
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-gray-500">
      <Info size={14} className="mt-0.5 shrink-0 text-gray-400" />
      {bloco.texto}
    </p>
  );
}

// Um centro × origem (Projetado) ou o extrato (Realizado), recolhível.
// Sempre começa fechado (pedido do usuário).
function Grupo({ grupo }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${aberto ? 'rounded-t-xl border-b border-gray-100' : 'rounded-xl'}`}
      >
        <ChevronRight size={16} className={`shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{grupo.titulo}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{grupo.subtitulo}</span>
            {grupo.avisos?.length > 0 && <TriangleAlert size={14} className="text-amber-500" />}
          </span>
          {grupo.resumo && <span className="mt-0.5 block truncate text-xs text-gray-500">{grupo.resumo}</span>}
        </span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${grupo.valor < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
          {formatar(grupo.valor, 'moeda')}
        </span>
      </button>
      {aberto && (
        <div className="space-y-4 px-4 py-4">
          {grupo.avisos?.map((a) => (
            <div key={a} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {a}
            </div>
          ))}
          {grupo.blocos.map((b, i) => (
            <Bloco key={i} bloco={b} />
          ))}
        </div>
      )}
    </section>
  );
}

// Aba DFC > clique num valor de uma conta: tudo que compõe aquele valor (pedido do usuário).
// `pedido`: { tipo 'R'|'P', mes 'AAAA-MM', lado 'E'|'S', natureza, centros, codigo, contaNome }.
export default function DetalhamentoModal({ empresaId, pedido, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!pedido) return;
    setDados(null);
    setErro('');
    getDetalhamentoDfc(empresaId, pedido)
      .then(setDados)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o detalhamento.'));
  }, [empresaId, pedido]);

  useEffect(() => {
    if (!pedido) return undefined;
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    // Captura: o Esc fecha só a janela, não a tela cheia do fluxo de caixa por baixo.
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [pedido, onClose]);

  if (!pedido) return null;
  const realizado = pedido.tipo === 'R';
  const total = dados ? dados.total : null;

  return (
    <Modal open onClose={onClose} title="Detalhamento" maxWidthClass="max-w-6xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <FileSearch size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {pedido.codigo && <span className="mr-2 font-mono text-xs font-normal text-gray-400">{pedido.codigo}</span>}
                {pedido.contaNome}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 uppercase tracking-wide text-gray-700">{formatar(pedido.mes, 'mes')}</span>
                <span className={`rounded-full px-2 py-0.5 ${realizado ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'}`}>
                  {realizado ? 'Realizado' : 'Projetado'}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{pedido.lado === 'E' ? 'Entradas' : 'Saídas'}</span>
                {dados?.versao && (
                  <span className="text-gray-400">
                    Versão {dados.versao.numero} do Orçamento · salva em {formatar(dados.versao.criado_em, 'datahora')}
                    {dados.versao.usuario ? ` por ${dados.versao.usuario}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-gray-500">Total</div>
            <div className={`text-xl font-semibold tabular-nums ${total < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
              {total === null ? '—' : formatar(total, 'moeda')}
            </div>
          </div>
        </div>

        {erro ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert size={15} className="shrink-0" />
            {erro}
          </div>
        ) : !dados ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : dados.grupos.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Nada compõe este valor.</div>
        ) : (
          <div className="space-y-3">
            {dados.grupos.length > 1 && (
              <p className="text-xs text-gray-500">
                {dados.grupos.length} {realizado ? 'centros de custo' : 'composições (centro de custo × origem)'} somam o total — clique para abrir.
              </p>
            )}
            {dados.grupos.map((g) => (
              <Grupo key={g.chave} grupo={g} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
