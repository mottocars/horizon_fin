import { useMemo, useState } from 'react';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import { useConfirm } from '../../../../confirm/ConfirmContext';
import { FILTROS_VAZIOS, titulo } from './modelo';

// Filtros do Aging List além da barra: o painel retrátil (botão "Filtros" ao lado do Exportar) com tipo
// de documento, plano de contas, cliente, fornecedor e previsão financeira, o "Gravar filtro" e o resumo dos
// filtros valendo quando o painel está fechado. Os filtros salvos ficam no servidor, por usuário e
// empresa (rotas /dashboards/:dashboard/:tela/filtros); a lista "Filtros salvos" fica na barra.

const MAX_ITENS = 250; // itens desenhados por lista — o plano de contas cabe inteiro; clientes e fornecedores, pela busca
const sem = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

// Opções de cada lista: tudo o que existe (B.catalogos — tenha ou não parcela em aberto no período),
// mais o que só aparece nas parcelas. `valor` já marcado que não está em nenhuma continua aparecendo,
// para poder desmarcar.
function opcoesFiltro(B) {
  const ord = (a, b) => a.label.localeCompare(b.label, 'pt-BR');
  const cat = B.catalogos || {};
  const pessoas = (catalogo, daBase) =>
    Object.entries({ ...daBase, ...catalogo })
      .map(([id, nome]) => ({ value: Number(id), label: titulo(nome || `Código ${id}`) }))
      .sort(ord);
  // Plano de contas: só as contas de resultado (o backend já tira as totalizadoras), com o código ao lado.
  const planos = cat.planos || [];
  const doPlano = new Set(planos.map((p) => p.id));
  const naturezas = [
    ...planos.map((p) => ({ value: p.id, label: titulo(p.nome || p.id), extra: p.ativa === 'N' ? `${p.id} · inativa` : p.id })),
    ...Object.entries(B.naturezas)
      .filter(([id]) => !doPlano.has(id))
      .map(([id, nome]) => ({ value: id, label: titulo(nome || id), extra: id })),
  ].sort(ord);
  return {
    documentos: Object.entries({ ...B.documentos, ...cat.documentos })
      .map(([id, nome]) => ({ value: id, label: titulo(nome || id), extra: id }))
      .sort(ord),
    naturezas,
    clientes: pessoas(cat.clientes, B.pessoas.r),
    fornecedores: pessoas(cat.fornecedores, B.pessoas.p),
  };
}

function ListaBusca({ id, rotulo, opcoes, valor, onChange, nota }) {
  const [busca, setBusca] = useState('');
  const marcados = useMemo(() => new Set(valor), [valor]);
  const todas = useMemo(() => {
    const conhecidos = new Set(opcoes.map((o) => o.value));
    return [...valor.filter((v) => !conhecidos.has(v)).map((v) => ({ value: v, label: `Código ${v}`, extra: 'fora do cadastro' })), ...opcoes];
  }, [opcoes, valor]);
  const q = sem(busca.trim());
  const achadas = q ? todas.filter((o) => sem(`${o.label} ${o.extra || ''}`).includes(q)) : todas;
  // Marcadas primeiro.
  const lista = [...achadas.filter((o) => marcados.has(o.value)), ...achadas.filter((o) => !marcados.has(o.value))];
  const alternar = (v) => onChange(marcados.has(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  return (
    <div className="lb">
      <div className="lb-cab">
        <label htmlFor={id}>{rotulo}</label>
        {valor.length > 0 ? (
          <button type="button" onClick={() => onChange([])}>
            {valor.length} marcado{valor.length > 1 ? 's' : ''} · limpar
          </button>
        ) : (
          <span>Todos</span>
        )}
      </div>
      <input id={id} type="search" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="lb-lista" role="listbox" aria-multiselectable="true" aria-label={rotulo}>
        {lista.slice(0, MAX_ITENS).map((o) => (
          <label key={o.value} className="lb-item" title={o.extra ? `${o.label} (${o.extra})` : o.label}>
            <input type="checkbox" checked={marcados.has(o.value)} onChange={() => alternar(o.value)} />
            <span>{o.label}</span>
            {o.extra && <small>{o.extra}</small>}
          </label>
        ))}
        {!lista.length && <div className="empty">Nada encontrado.</div>}
        {lista.length > MAX_ITENS && <div className="lb-mais">+ {lista.length - MAX_ITENS} — refine a busca</div>}
      </div>
      {nota && <span className="nota">{nota}</span>}
    </div>
  );
}

// `salvoAtual`: o filtro salvo igual aos filtros de agora (ou null); `onGravar(nome)` e `onExcluir(salvo)`
// devolvem promessas.
export function PainelFiltros({ B, filtros, onFiltros, salvos, salvoAtual, onGravar, onExcluir, onFechar }) {
  const confirm = useConfirm();
  const opcoes = useMemo(() => opcoesFiltro(B), [B]);
  const [gravando, setGravando] = useState(false);
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const mudar = (patch) => onFiltros({ ...filtros, ...patch });
  const existente = salvos.find((s) => s.nome.trim().toLowerCase() === nome.trim().toLowerCase());

  async function gravar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setOcupado(true);
    setErro('');
    try {
      await onGravar(nome.trim());
      setGravando(false);
      setNome('');
    } catch (err) {
      setErro(err?.response?.data?.message || 'Não foi possível gravar o filtro.');
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    const ok = await confirm({ title: 'Excluir filtro salvo', description: `Excluir o filtro "${salvoAtual.nome}"?`, confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    setErro('');
    try {
      await onExcluir(salvoAtual);
    } catch (err) {
      setErro(err?.response?.data?.message || 'Não foi possível excluir o filtro.');
    }
  }

  return (
    <section className="panel filtros-painel" aria-label="Filtros do aging">
      <div className="fp-topo">
        <h2>Filtros</h2>
        <button type="button" className="btn ghost icone" onClick={onFechar} title="Fechar os filtros" aria-label="Fechar os filtros">
          <X size={16} />
        </button>
      </div>
      <div className="fp-grade">
        <ListaBusca id="f-doc" rotulo="Tipo de documento" opcoes={opcoes.documentos} valor={filtros.documentos} onChange={(v) => mudar({ documentos: v })} />
        <ListaBusca
          id="f-nat"
          rotulo="Plano de contas"
          opcoes={opcoes.naturezas}
          valor={filtros.naturezas}
          onChange={(v) => mudar({ naturezas: v })}
        />
        <ListaBusca
          id="f-cli"
          rotulo="Cliente"
          opcoes={opcoes.clientes}
          valor={filtros.clientes}
          onChange={(v) => mudar({ clientes: v })}
          nota="Filtra o a receber."
        />
        <ListaBusca
          id="f-for"
          rotulo="Fornecedor"
          opcoes={opcoes.fornecedores}
          valor={filtros.fornecedores}
          onChange={(v) => mudar({ fornecedores: v })}
          nota="Filtra o a pagar."
        />
      </div>
      <div className="fp-rodape">
        <div className="ctl">
          <span className="rot">Previsão financeira</span>
          <div className="seg" role="group" aria-label="Previsão financeira">
            {[
              ['nao', 'Não', 'Sem as previsões (o documento real que as substitui também está no Sienge)'],
              ['sim', 'Sim', 'Só as previsões financeiras'],
              ['todos', 'Todas', 'Documentos e previsões juntos'],
            ].map(([v, r, dica]) => (
              <button key={v} type="button" aria-pressed={filtros.previsao === v} title={dica} onClick={() => mudar({ previsao: v })}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="fp-acoes">
          {erro && <span className="erro">{erro}</span>}
          {gravando ? (
            <form className="fp-gravar" onSubmit={gravar}>
              <input
                type="text"
                placeholder="Nome do filtro"
                maxLength={80}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
                aria-label="Nome do filtro"
              />
              <button type="submit" className="btn" disabled={!nome.trim() || ocupado}>
                {ocupado ? <Loader2 size={14} className="animate-spin" /> : existente ? 'Substituir' : 'Salvar'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setGravando(false);
                  setNome('');
                }}
              >
                Cancelar
              </button>
            </form>
          ) : (
            <>
              {salvoAtual && (
                <button type="button" className="btn ghost icone com-texto" onClick={excluir} title="Excluir este filtro salvo">
                  <Trash2 size={15} />
                  Excluir "{salvoAtual.nome}"
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => onFiltros({ ...FILTROS_VAZIOS, centros: filtros.centros })}>
                Limpar filtros
              </button>
              <button
                type="button"
                className="btn icone com-texto escuro"
                onClick={() => {
                  setNome(salvoAtual?.nome || '');
                  setGravando(true);
                }}
              >
                <Save size={15} />
                Gravar filtro
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// Filtros valendo, em etiquetas que tiram cada grupo — com o painel fechado.
export function ResumoFiltros({ B, filtros, onFiltros }) {
  const opcoes = useMemo(() => opcoesFiltro(B), [B]);
  const nomes = (k, lista) => {
    const mapa = new Map(opcoes[k].map((o) => [o.value, o.label]));
    const n = lista.map((v) => mapa.get(v) || `Código ${v}`);
    return n.length > 2 ? `${n.slice(0, 2).join(', ')} e mais ${n.length - 2}` : n.join(', ');
  };
  const grupos = [
    ['documentos', 'Tipo de documento'],
    ['naturezas', 'Plano de contas'],
    ['clientes', 'Cliente'],
    ['fornecedores', 'Fornecedor'],
  ].filter(([k]) => filtros[k].length);
  if (!grupos.length && filtros.previsao === 'nao') return null;
  return (
    <div className="filtros-ativos" aria-label="Filtros valendo">
      {grupos.map(([k, rotulo]) => (
        <span key={k} className="chip">
          {rotulo}: {nomes(k, filtros[k])}
          <button type="button" onClick={() => onFiltros({ ...filtros, [k]: [] })} aria-label={`Tirar o filtro de ${rotulo.toLowerCase()}`}>
            <X size={14} />
          </button>
        </span>
      ))}
      {filtros.previsao !== 'nao' && (
        <span className="chip">
          Previsão financeira: {filtros.previsao === 'sim' ? 'só as previsões' : 'todas'}
          <button type="button" onClick={() => onFiltros({ ...filtros, previsao: 'nao' })} aria-label="Voltar a deixar as previsões de fora">
            <X size={14} />
          </button>
        </span>
      )}
    </div>
  );
}
