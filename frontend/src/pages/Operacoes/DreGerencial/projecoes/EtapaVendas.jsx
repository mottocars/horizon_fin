import { useMemo, useState } from 'react';
import { CalendarRange, Eraser, Home, Repeat } from 'lucide-react';
import CelulaValor from './CelulaValor';
import { mesesEntre, moeda, pct, rotuloMes, vendaDaUnidade } from './util';

const CAMPO_MES =
  'h-7 rounded-md border px-1.5 text-xs tabular-nums outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

function Placar({ rotulo, valor, detalhe }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{valor}</p>
      {detalhe && <p className="text-[11px] tabular-nums text-gray-400">{detalhe}</p>}
    </div>
  );
}

// Etapa 3 (obra): as unidades disponíveis na trava — mês e valor de venda de cada uma (do primeiro mês
// projetado até o fim do ciclo; valor vazio = ticket médio do tipo). Ferramentas: ritmo fixo (N por mês
// a partir de um mês) e distribuição igual até um mês, nas selecionadas ou, sem seleção, nas sem mês;
// limpar o mês das selecionadas.
export default function EtapaVendas({ unidades, meses, dados, onDados }) {
  const [selecao, setSelecao] = useState(() => new Set());
  const [tipo, setTipo] = useState('');
  const [ritmo, setRitmo] = useState({ n: '1', de: meses[0] || '' });
  const [ate, setAte] = useState(meses[meses.length - 1] || '');
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];

  const tipos = useMemo(() => [...new Set(unidades.map((u) => u.tipo || '—'))].sort(), [unidades]);
  const linhas = useMemo(
    () => unidades.filter((u) => !tipo || (u.tipo || '—') === tipo).map((u) => ({ u, ...vendaDaUnidade(u, dados) })),
    [unidades, tipo, dados]
  );
  const todas = useMemo(() => unidades.map((u) => ({ u, ...vendaDaUnidade(u, dados) })), [unidades, dados]);
  const noPeriodo = (mes) => mes && mes >= primeiro && mes <= ultimo;
  const vendidas = todas.filter((x) => noPeriodo(x.mes));
  const foraDoPeriodo = todas.filter((x) => x.mes && !noPeriodo(x.mes)).length;
  const vgv = vendidas.reduce((t, x) => t + x.valor, 0);
  const fracao = vendidas.reduce((t, x) => t + Number(x.u.fracao_ideal || 0), 0);
  const fracaoEstoque = todas.reduce((t, x) => t + Number(x.u.fracao_ideal || 0), 0);

  function gravar(alteracoes) {
    const novo = { ...(dados.unidades || {}) };
    alteracoes.forEach(({ chave, ...campos }) => {
      const atual = novo[chave] || {};
      const u = unidades.find((x) => x.chave === chave);
      // Primeira mudança numa unidade com venda registrada: guarda a venda registrada junto.
      const base = novo[chave] ? atual : { mes: u?.venda_registrada?.mes || null, valor: null };
      novo[chave] = { ...base, ...campos };
    });
    onDados({ ...dados, unidades: novo });
  }

  // Alvo das ferramentas: as selecionadas (na ordem da tabela) ou, sem seleção, as sem mês.
  const alvo = () => (selecao.size ? linhas.filter((x) => selecao.has(x.u.chave)) : linhas.filter((x) => !x.mes));

  function aplicarRitmo() {
    const n = Math.max(1, Math.floor(Number(ritmo.n) || 0));
    if (!ritmo.de) return;
    const lista = mesesEntre(ritmo.de < primeiro ? primeiro : ritmo.de, ultimo);
    gravar(alvo().map((x, i) => ({ chave: x.u.chave, mes: lista[Math.floor(i / n)] || null })));
  }

  function distribuir() {
    const lista = mesesEntre(primeiro, ate > ultimo ? ultimo : ate);
    const a = alvo();
    if (!lista.length || !a.length) return;
    gravar(a.map((x, i) => ({ chave: x.u.chave, mes: lista[Math.floor((i * lista.length) / a.length)] })));
  }

  function limpar() {
    gravar(linhas.filter((x) => selecao.has(x.u.chave)).map((x) => ({ chave: x.u.chave, mes: null })));
    setSelecao(new Set());
  }

  const todasMarcadas = linhas.length > 0 && linhas.every((x) => selecao.has(x.u.chave));
  const alternarTodas = () => setSelecao(todasMarcadas ? new Set() : new Set(linhas.map((x) => x.u.chave)));
  const alternar = (chave) =>
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  if (!unidades.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <Home size={26} className="text-gray-300" />
        <p className="text-sm text-gray-600">Nenhuma unidade disponível na trava.</p>
        <p className="text-xs text-gray-400">A POC de Despesa segue com as vendas já realizadas.</p>
      </div>
    );
  }

  const alvoTexto = selecao.size ? `${selecao.size} selecionada(s)` : 'unidades sem mês';
  return (
    <div className="space-y-4 p-6">
      <div className="flex gap-3">
        <Placar rotulo="Unidades com venda" valor={`${vendidas.length} de ${unidades.length}`} detalhe={foraDoPeriodo ? `${foraDoPeriodo} fora do período` : null} />
        <Placar rotulo="VGV projetado" valor={`R$ ${moeda(vgv)}`} />
        <Placar rotulo="Fração ideal vendida" valor={pct(fracao, 4)} detalhe={`de ${pct(fracaoEstoque, 4)} em estoque`} />
      </div>

      {/* Ferramentas de distribuição */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <Repeat size={14} className="text-primary-600" />
          <input
            type="number"
            min="1"
            value={ritmo.n}
            onChange={(e) => setRitmo({ ...ritmo, n: e.target.value })}
            className={`${CAMPO_MES} w-14 border-gray-200 bg-white text-right`}
          />
          por mês a partir de
          <input
            type="month"
            value={ritmo.de}
            min={primeiro}
            max={ultimo}
            onChange={(e) => setRitmo({ ...ritmo, de: e.target.value })}
            className={`${CAMPO_MES} border-gray-200 bg-white`}
          />
          <button type="button" onClick={aplicarRitmo} className="rounded-md bg-primary-600 px-2.5 py-1 font-medium text-white hover:bg-primary-700">
            Ritmo fixo
          </button>
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarRange size={14} className="text-primary-600" />
          igual até
          <input
            type="month"
            value={ate}
            min={primeiro}
            max={ultimo}
            onChange={(e) => setAte(e.target.value)}
            className={`${CAMPO_MES} border-gray-200 bg-white`}
          />
          <button type="button" onClick={distribuir} className="rounded-md bg-primary-600 px-2.5 py-1 font-medium text-white hover:bg-primary-700">
            Distribuir
          </button>
        </span>
        <span className="text-gray-400">em {alvoTexto}</span>
        {tipos.length > 1 && (
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setSelecao(new Set());
            }}
            className={`${CAMPO_MES} ml-auto border-gray-200 bg-white pr-7`}
            title="Mostrar só um tipo de unidade"
          >
            <option value="">Todos os tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={limpar}
          disabled={!selecao.size}
          className={`${tipos.length > 1 ? '' : 'ml-auto'} flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50`}
        >
          <Eraser size={13} /> Limpar mês
        </button>
      </div>

      <div className="rounded-lg border border-gray-200">
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-blue-700">
              <th className="sticky top-0 z-10 w-10 rounded-tl-lg border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5">
                <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600" />
              </th>
              <th className="sticky top-0 z-10 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Unidade</th>
              <th className="sticky top-0 z-10 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Tipo</th>
              <th className="sticky top-0 z-10 w-28 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium">Fração ideal</th>
              <th className="sticky top-0 z-10 w-36 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium">Ticket médio</th>
              <th className="sticky top-0 z-10 w-40 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium">Valor de venda</th>
              <th className="sticky top-0 z-10 w-36 rounded-tr-lg border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Mês de venda</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ u, mes, informado }) => {
              const fora = mes && !noPeriodo(mes);
              return (
                <tr key={u.chave} className={`${selecao.has(u.chave) ? 'bg-primary-50/50' : 'bg-white'} hover:bg-gray-50`}>
                  <td className="border-b border-gray-100 px-3 py-1">
                    <input
                      type="checkbox"
                      checked={selecao.has(u.chave)}
                      onChange={() => alternar(u.chave)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600"
                    />
                  </td>
                  <td className="border-b border-gray-100 px-3 py-1 font-medium text-gray-800">
                    {u.unidade}
                    {u.venda_registrada && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        vendida em {rotuloMes(u.venda_registrada.mes)}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-1 text-gray-600">{u.tipo || '—'}</td>
                  <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-700">
                    {u.fracao_ideal === null || u.fracao_ideal === undefined ? (
                      <span className="text-amber-600" title="Sem fração ideal no Sienge: não entra na POC de Despesa">
                        —
                      </span>
                    ) : (
                      pct(Number(u.fracao_ideal), 4)
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-500">
                    {u.ticket === null ? '—' : moeda(u.ticket)}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-1">
                    <CelulaValor
                      sugestao
                      title="Vazio = ticket médio do tipo (ou o valor da venda registrada)"
                      valor={informado}
                      placeholder={u.venda_registrada?.valor ? moeda(u.venda_registrada.valor) : u.ticket ? moeda(u.ticket) : '—'}
                      onCommit={(v) => gravar([{ chave: u.chave, valor: v }])}
                    />
                  </td>
                  <td className="border-b border-gray-100 px-3 py-1">
                    <input
                      type="month"
                      value={mes || ''}
                      min={primeiro}
                      max={ultimo}
                      onChange={(e) => gravar([{ chave: u.chave, mes: e.target.value || null }])}
                      className={`${CAMPO_MES} w-full ${
                        fora ? 'border-red-300 bg-red-50 text-red-700' : mes ? 'border-primary-100 bg-primary-50' : 'border-amber-200 bg-amber-50'
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
