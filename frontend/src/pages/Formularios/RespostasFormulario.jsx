import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, Inbox, RefreshCw, Star, Trash2, User } from 'lucide-react';
import '../Dashboards/EconomicoFinanceiro/fluxo/painel.css';
import '../Dashboards/CronogramasObras/cronogramas.css';
import { useConfirm } from '../../confirm/ConfirmContext';
import { excluirRespostaFormulario, resultadosFormulario } from '../../api/formularios.api';
import FormularioResponder from './FormularioResponder';
import { TIPO, dataBr, dataHoraBr, mensagemErro, textoResposta } from './tipos';
import { useAviso } from './Aviso';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const num = (n, casas = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

// Cartões de indicadores no estilo do painel do CFO (os mesmos de Cronogramas Obras).
function Indicadores({ itens }) {
  return (
    <div className="painel-cfo embutido">
      <section className="tiles cronograma" style={{ '--colunas': itens.length }}>
        {itens.map((i) => (
          <div key={i.rotulo} className="tile">
            <span className="k">
              {i.cor && <i className="marca" style={{ backgroundColor: i.cor }} />}
              {i.rotulo}
            </span>
            <span className="v">
              {i.valor}
              {i.unidade && <small>{i.unidade}</small>}
            </span>
            {i.detalhe && <span className="d">{i.detalhe}</span>}
            {i.cor && i.fatia !== undefined && (
              <span className="medidor" style={{ backgroundColor: `${i.cor}26` }}>
                <i style={{ width: `${Math.min(1, i.fatia || 0) * 100}%`, backgroundColor: i.cor }} />
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

// Aba Respostas do construtor: Resumo (um bloco por pergunta), Individual (cada resposta como foi enviada) e,
// nos privados, Pessoas (quem do público-alvo já respondeu e quem falta). Exporta tudo para Excel.
export default function RespostasFormulario({ form, versao }) {
  const confirm = useConfirm();
  const aviso = useAviso();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState('resumo');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setErro('');
    resultadosFormulario(form.id)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(mensagemErro(e, 'Não foi possível carregar as respostas.')));
    return () => {
      vivo = false;
    };
  }, [form.id, versao, recarga]);

  // As perguntas da tela (com as edições ainda não recarregadas) valem para mostrar os textos atuais.
  const perguntas = form.perguntas || [];
  const respostas = useMemo(() => dados?.respostas || [], [dados]);
  const destinatarios = dados?.destinatarios || null;
  const cor = form.cor_tema || '#2563eb';

  async function exportar() {
    const XLSX = await import('xlsx');
    const colunas = perguntas.filter((p) => p.tipo !== 'SECAO');
    const anonimo = form.anonimo && form.modalidade !== 'PUBLICO';
    const linhas = respostas.map((r) => {
      const linha = { 'Enviado em': anonimo ? dataBr(String(r.enviado_dia).slice(0, 10)) : dataHoraBr(r.enviado_em) };
      if (form.modalidade !== 'PUBLICO' && !anonimo) linha['Usuário'] = r.usuario_nome || '';
      colunas.forEach((p, i) => {
        const v = r.respostas?.[p.id];
        const chave = `${i + 1}. ${p.titulo || 'Pergunta sem título'}`.slice(0, 250);
        linha[chave] = ['ESCALA_LINEAR', 'AVALIACAO', 'NUMERO'].includes(p.tipo) && v !== undefined ? Number(v) : textoResposta(p, v);
      });
      return linha;
    });
    const planilha = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ 'Enviado em': '' }]);
    planilha['!cols'] = Object.keys(linhas[0] || { a: 1 }).map((k, i) => ({ wch: i === 0 ? 18 : Math.min(50, Math.max(14, k.length)) }));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Respostas');
    if (destinatarios) {
      const pessoas = XLSX.utils.json_to_sheet(
        destinatarios.map((d) => ({ Usuário: d.nome, Empresas: d.empresas, Situação: d.respondeu ? 'Respondeu' : 'Pendente', 'Respondido em': dataHoraBr(d.respondido_em) }))
      );
      XLSX.utils.book_append_sheet(livro, pessoas, 'Público-alvo');
    }
    const nome = (form.titulo || 'formulario').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 60);
    XLSX.writeFile(livro, `${nome}-respostas.xlsx`);
  }

  async function excluirResposta(r) {
    const ok = await confirm({
      title: 'Excluir resposta',
      description:
        form.modalidade !== 'PUBLICO'
          ? 'A resposta some dos resultados e a pesquisa volta a aparecer para essa pessoa. Não dá para desfazer.'
          : 'A resposta some dos resultados. Não dá para desfazer.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirRespostaFormulario(form.id, r.id);
      aviso('Resposta excluída.');
      setRecarga((n) => n + 1);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível excluir a resposta.'));
    }
  }

  if (!dados && !erro) {
    return <div className="rounded-card rounded-tl-none bg-white p-5 py-16 text-center text-sm text-gray-400 shadow-card">Carregando...</div>;
  }

  const total = respostas.length;
  const ultima = respostas[0];
  const respondidos = destinatarios ? destinatarios.filter((d) => d.respondeu).length : 0;
    const seteDias = respostas.filter((r) => (Date.now() - new Date(r.enviado_dia).getTime()) / 864e5 <= 7).length;
  const hojeLocal = new Date().toLocaleDateString('sv-SE');

  const indicadores = destinatarios
    ? [
        { rotulo: 'Público-alvo', valor: destinatarios.length, unidade: destinatarios.length === 1 ? 'pessoa' : 'pessoas' },
        { rotulo: 'Responderam', valor: respondidos, cor, fatia: destinatarios.length ? respondidos / destinatarios.length : 0, detalhe: `${pct(respondidos, destinatarios.length)}% de adesão` },
        { rotulo: 'Pendentes', valor: destinatarios.length - respondidos, detalhe: form.modalidade === 'PRIVADO_OBRIGATORIO' ? 'Bloqueados até responder' : 'Veem a janela ao entrar' },
        { rotulo: 'Última resposta', valor: ultima ? dataBr(String(ultima.enviado_dia).slice(0, 10)) : '—' },
      ]
    : [
        { rotulo: 'Respostas', valor: total },
        { rotulo: 'Últimos 7 dias', valor: seteDias },
        { rotulo: 'Hoje', valor: respostas.filter((r) => new Date(r.enviado_dia).toLocaleDateString('sv-SE') === hojeLocal).length },
        { rotulo: 'Última resposta', valor: ultima ? dataHoraBr(ultima.enviado_dia) : '—' },
      ];

  const visoes = [
    { id: 'resumo', rotulo: 'Resumo' },
    { id: 'individual', rotulo: `Individual${total ? ` (${total})` : ''}` },
    ...(destinatarios ? [{ id: 'pessoas', rotulo: 'Pessoas' }] : []),
  ];

  return (
    <div className="space-y-5 rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <Indicadores itens={indicadores} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {visoes.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVisao(v.id)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${visao === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRecarga((n) => n + 1)} title="Atualizar" className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={18} />
          </button>
          <button type="button" onClick={exportar} disabled={!total && !destinatarios} title="Exportar para Excel" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={17} className="text-emerald-600" />
            Excel
          </button>
        </div>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}

      {visao === 'pessoas' && destinatarios ? (
        <Pessoas destinatarios={destinatarios} anonimo={form.anonimo} />
      ) : total === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-gray-200 px-6 py-14 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Inbox size={22} />
          </span>
          <p className="text-sm font-medium text-gray-800">Nenhuma resposta ainda.</p>
          <p className="mt-1 max-w-md text-xs text-gray-500">
            {form.status === 'RASCUNHO'
              ? 'Publique o formulário para começar a receber respostas.'
              : form.modalidade === 'PUBLICO'
                ? 'Compartilhe o link público (aba Configurações) para começar a receber respostas.'
                : 'As respostas aparecem aqui assim que os usuários do público-alvo responderem.'}
          </p>
        </div>
      ) : visao === 'individual' ? (
        <Individual perguntas={perguntas} form={form} respostas={respostas} onExcluir={excluirResposta} />
      ) : (
        <Resumo perguntas={perguntas} respostas={respostas} cor={cor} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------------------------

function Bloco({ titulo, subtitulo, children, direita }) {
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
        </div>
        {direita}
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

// Barras horizontais de uma série (contagem por opção). Rótulo com quantidade e %; dica ao passar o mouse.
function Barras({ itens, total, cor }) {
  const maior = Math.max(1, ...itens.map((i) => i.n));
  return (
    <div className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.chave} className="group grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,18rem)_1fr_auto]" title={`${i.rotulo}: ${i.n} resposta(s) — ${pct(i.n, total)}%`}>
          <span className="truncate text-gray-700">{i.rotulo}</span>
          <span className="h-6 rounded bg-gray-100">
            <span className="block h-full rounded transition-all duration-500 group-hover:brightness-110" style={{ width: `${(i.n / maior) * 100}%`, minWidth: i.n ? 4 : 0, backgroundColor: cor }} />
          </span>
          <span className="w-24 text-right tabular-nums text-gray-600">
            <span className="font-medium text-gray-900">{i.n}</span> · {pct(i.n, total)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function Resumo({ perguntas, respostas, cor }) {
  let numero = 0;
  return (
    <div className="space-y-4">
      {perguntas.map((p) => {
        if (p.tipo === 'SECAO') {
          return (
            <div key={p.id} className="flex items-center gap-3 pt-2">
              <span className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{p.titulo || 'Seção'}</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>
          );
        }
        numero += 1;
        const valores = respostas.map((r) => r.respostas?.[p.id]).filter((v) => v !== undefined && v !== null && v !== '');
        const Icone = TIPO[p.tipo]?.icone;
        return (
          <Bloco
            key={p.id}
            titulo={`${numero}. ${p.titulo || 'Pergunta sem título'}`}
            subtitulo={`${valores.length} de ${respostas.length} responderam${p.obrigatoria ? ' · obrigatória' : ''}`}
            direita={Icone && <Icone size={16} className="mt-0.5 shrink-0 text-gray-300" />}
          >
            {valores.length === 0 ? <p className="text-sm text-gray-400">Ninguém respondeu esta pergunta.</p> : <ResumoPergunta p={p} valores={valores} cor={cor} />}
          </Bloco>
        );
      })}
    </div>
  );
}

function ResumoPergunta({ p, valores, cor }) {
  const total = valores.length;
  if (['MULTIPLA_ESCOLHA', 'LISTA', 'CAIXAS_SELECAO'].includes(p.tipo)) {
    const contagem = new Map((p.opcoes || []).map((o) => [o.id, 0]));
    const outros = [];
    valores.forEach((v) => {
      const ids = p.tipo === 'CAIXAS_SELECAO' ? v.opcoes || [] : v.opcao ? [v.opcao] : [];
      ids.forEach((id) => contagem.set(id, (contagem.get(id) || 0) + 1));
      if (v.outro) outros.push(v.outro);
    });
    const itens = [...contagem.entries()].map(([id, n]) => ({
      chave: id,
      rotulo: (p.opcoes || []).find((o) => o.id === id)?.texto || '(opção removida)',
      n,
    }));
    if (outros.length || p.outro) itens.push({ chave: '__outro', rotulo: 'Outro', n: outros.length });
    return (
      <div className="space-y-4">
        {p.tipo === 'CAIXAS_SELECAO' && <p className="text-xs text-gray-500">Cada pessoa pode marcar mais de uma opção — o % é sobre quem respondeu.</p>}
        <Barras itens={itens} total={total} cor={cor} />
        {outros.length > 0 && <ListaTextos titulo="Respostas em “Outro”" textos={outros} />}
      </div>
    );
  }
  if (p.tipo === 'ESCALA_LINEAR' || p.tipo === 'AVALIACAO') {
    const { min = 1, max = 5, rotulo_min: a, rotulo_max: b } = p.escala || {};
    const media = valores.reduce((s, v) => s + Number(v), 0) / total;
    const itens = [];
    for (let n = p.tipo === 'AVALIACAO' ? max : min; p.tipo === 'AVALIACAO' ? n >= 1 : n <= max; p.tipo === 'AVALIACAO' ? n-- : n++) {
      const rot = n === min && a ? `${n} — ${a}` : n === max && b ? `${n} — ${b}` : p.tipo === 'AVALIACAO' ? `${n} estrela${n > 1 ? 's' : ''}` : String(n);
      itens.push({ chave: String(n), rotulo: rot, n: valores.filter((v) => Number(v) === n).length });
    }
    const nps = p.tipo === 'ESCALA_LINEAR' && min === 0 && max === 10;
    const promotores = valores.filter((v) => v >= 9).length;
    const detratores = valores.filter((v) => v <= 6).length;
    return (
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <div className="flex flex-col justify-center rounded-xl bg-gray-50 px-5 py-4">
          {nps ? (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">NPS</span>
              <span className="mt-1 text-4xl font-semibold tabular-nums text-gray-900">{Math.round(((promotores - detratores) / total) * 100)}</span>
              <span className="mt-2 space-y-0.5 text-xs text-gray-600">
                <span className="block">Promotores (9–10): {promotores} · {pct(promotores, total)}%</span>
                <span className="block">Neutros (7–8): {total - promotores - detratores} · {pct(total - promotores - detratores, total)}%</span>
                <span className="block">Detratores (0–6): {detratores} · {pct(detratores, total)}%</span>
              </span>
              <span className="mt-2 text-xs text-gray-500">Média {num(media)}</span>
            </>
          ) : (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Média</span>
              <span className="mt-1 text-4xl font-semibold tabular-nums text-gray-900">
                {num(media)}
                <span className="ml-1 text-base font-normal text-gray-400">/ {max}</span>
              </span>
              {p.tipo === 'AVALIACAO' && (
                <span className="mt-2 flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: max }, (_, i) => (
                    <Star key={i} size={16} strokeWidth={1.6} className={i + 0.5 <= media ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
                  ))}
                </span>
              )}
            </>
          )}
        </div>
        <Barras itens={itens} total={total} cor={cor} />
      </div>
    );
  }
  if (p.tipo === 'NUMERO') {
    const ns = valores.map(Number);
    const soma = ns.reduce((s, n) => s + n, 0);
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Média', soma / ns.length],
          ['Mínimo', Math.min(...ns)],
          ['Máximo', Math.max(...ns)],
          ['Soma', soma],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl bg-gray-50 px-4 py-3">
            <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">{r}</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums text-gray-900">{num(v, 2)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (p.tipo === 'DATA') {
    const cont = new Map();
    valores.forEach((v) => cont.set(v, (cont.get(v) || 0) + 1));
    const itens = [...cont.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, n]) => ({ chave: d, rotulo: dataBr(d), n }));
    return <Barras itens={itens} total={total} cor={cor} />;
  }
  return <ListaTextos textos={valores.map(String)} />;
}

function ListaTextos({ titulo, textos }) {
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? textos : textos.slice(0, 8);
  return (
    <div>
      {titulo && <p className="mb-2 text-xs font-medium text-gray-500">{titulo}</p>}
      <ul className="space-y-1.5">
        {visiveis.map((t, i) => (
          <li key={i} className="whitespace-pre-line rounded-lg bg-gray-50 px-3.5 py-2.5 text-sm text-gray-800">
            {t}
          </li>
        ))}
      </ul>
      {textos.length > 8 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-2 text-xs font-medium text-primary-600 hover:underline">
          {todos ? 'Mostrar menos' : `Ver todas as ${textos.length} respostas`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Individual
// ---------------------------------------------------------------------------------------------

function Individual({ perguntas, form, respostas, onExcluir }) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, respostas.length - 1);
  const r = respostas[idx];
  if (!r) return null;
  const anonimo = form.anonimo && form.modalidade !== 'PUBLICO';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setI(idx - 1)} disabled={idx === 0} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm tabular-nums text-gray-700">
            <span className="font-semibold text-gray-900">{idx + 1}</span> de {respostas.length}
          </span>
          <button type="button" onClick={() => setI(idx + 1)} disabled={idx === respostas.length - 1} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40" aria-label="Próxima">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="flex items-center gap-1.5">
            <User size={15} className="text-gray-400" />
            {anonimo ? 'Anônima' : r.usuario_nome || (r.origem === 'PUBLICO' ? 'Link público' : 'Usuário removido')}
          </span>
          <span className="text-gray-300">·</span>
          <span className="tabular-nums">{anonimo ? dataBr(String(r.enviado_dia).slice(0, 10)) : dataHoraBr(r.enviado_em)}</span>
          <button type="button" onClick={() => onExcluir(r)} title="Excluir esta resposta" className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="rounded-xl bg-gray-50 px-3 py-5 sm:px-6">
        <FormularioResponder key={r.id} formulario={{ ...form, perguntas }} valores={r.respostas || {}} compacto />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Pessoas (privados)
// ---------------------------------------------------------------------------------------------

function Pessoas({ destinatarios, anonimo }) {
  const [filtro, setFiltro] = useState('TODOS');
  const lista = destinatarios.filter((d) => (filtro === 'TODOS' ? true : filtro === 'OK' ? d.respondeu : !d.respondeu));
  const ok = destinatarios.filter((d) => d.respondeu).length;
  return (
    <div className="overflow-clip rounded-xl border border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Público-alvo</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {ok} de {destinatarios.length} responderam
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
          {[
            ['TODOS', 'Todos'],
            ['OK', 'Responderam'],
            ['PENDENTE', 'Pendentes'],
          ].map(([id, rot]) => (
            <button key={id} type="button" onClick={() => setFiltro(id)} className={`rounded-md px-2.5 py-1 font-medium ${filtro === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {rot}
            </button>
          ))}
        </div>
      </div>
      {destinatarios.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-400">Nenhum usuário ativo no público-alvo. Confira a aba Configurações.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className={CABECALHO}>
                <th className="py-2.5 pl-4 pr-3 font-medium">Usuário</th>
                <th className="py-2.5 pr-3 font-medium">Empresas</th>
                <th className="py-2.5 pr-4 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-primary-600">
                        {d.avatar_url ? <img src={d.avatar_url} alt="" className="h-full w-full object-cover" /> : <User size={13} />}
                      </span>
                      <span className="text-sm text-gray-900">{d.nome}</span>
                    </div>
                  </td>
                  <td className="max-w-[320px] truncate py-3 pr-3 text-gray-600" title={d.empresas}>
                    {d.empresas || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {d.respondeu ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {anonimo || !d.respondido_em ? 'Respondeu' : `Respondeu em ${dataHoraBr(d.respondido_em)}`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Pendente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
