import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Search,
  TriangleAlert,
  Undo2,
  User as UserIcon,
} from 'lucide-react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { getMapaAcessos, salvarAcessos } from '../../api/usuarios.api';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../confirm/ConfirmContext';
import { TELAS_SISTEMA, TODOS_CODIGOS_TELAS } from '../../config/telasSistema';
import { nomeExibicaoEmpresa } from '../../utils/empresa';

// Mapa de Acessos (aba de Cadastros › Usuários): matriz usuário Básico ×
// tela. Clicar numa célula libera ou tira a tela; as alterações ficam
// pendentes (em amarelo) até "Salvar", no canto do cabeçalho, que grava tudo
// de uma vez. Sem Comum × Administrador por enquanto: quem tem a tela acessa
// todo o conteúdo dela (ver utils/permissoes.js::ehAdministradorDaTela).
// Master não aparece (tem tudo). Valem as mesmas travas do cadastro
// (usuarios.controller.js): ninguém mexe nos próprios acessos e quem não é
// Master só libera telas que tem.
//
// Quem rola é a página (o <main> do AppShell, com p-6) ou, na tela cheia, o
// próprio painel (também p-6): cabeçalho e totais são sticky com -top-6 /
// -bottom-6 pra encostar na borda de verdade, não 24px pra dentro.

const LABEL_TELA = new Map(TELAS_SISTEMA.flatMap((g) => g.telas.map((t) => [t.codigo, t.label])));
const GRUPO_TELA = new Map(TELAS_SISTEMA.flatMap((g) => g.telas.map((t) => [t.codigo, g.grupo])));
const CODIGOS = new Set(TODOS_CODIGOS_TELAS);

// Larguras (rem): o nome é fixo e as telas dividem o resto da largura; o
// mínimo evita espremer demais em tela estreita (aí a página rola de lado).
const LARGURA_NOME = 16;
const LARGURA_MINIMA_TELA = 1.6;
const LARGURA_GRUPO_RECOLHIDO = 4.5;

const TH = 'border-b border-blue-200 bg-blue-50 text-blue-900';
const SEPARADOR_GRUPO = 'border-l-2 border-l-blue-200';

const chave = (usuarioId, tela) => `${usuarioId}|${tela}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const temSalvo = (usuario, tela) => (usuario.telas_permitidas || []).includes(tela);

function Marca({ tem, removido }) {
  if (tem) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (removido) return <span className="h-5 w-5 rounded-full border-2 border-dashed border-amber-400" />;
  return null;
}

function Avatar({ usuario }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-primary-600">
      {usuario.avatar_url ? (
        <img src={usuario.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon size={12} />
      )}
    </div>
  );
}

export default function MapaAcessos() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const editorMaster = user?.permissao === 'MASTER';

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ativos');
  const [recolhidos, setRecolhidos] = useState(() => new Set());
  // chave(usuario, tela) → true (liberar) / false (tirar). Só o que difere
  // do que está gravado.
  const [pendentes, setPendentes] = useState(() => new Map());
  const [colunaRealce, setColunaRealce] = useState(null);
  const [telaDetalhe, setTelaDetalhe] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro('');
    getMapaAcessos()
      .then(setUsuarios)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar os acessos.'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .catch(() => setEmpresas([]));
  }, []);

  // Tela cheia (como no dashboard Cronogramas Obras): pede também a do
  // navegador; o Esc dele sai e o `fullscreenchange` fecha a nossa junto.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [telaCheia]);

  const telasEditor = useMemo(() => new Set(user?.telas_permitidas || []), [user]);

  const ehVoce = (usuario) => String(usuario.id) === String(user?.id);
  const editavel = (usuario) => usuario.permissao === 'BASICO' && !ehVoce(usuario);

  function temAtual(usuario, tela) {
    const k = chave(usuario.id, tela);
    return pendentes.has(k) ? pendentes.get(k) : temSalvo(usuario, tela);
  }

  // Tirar sempre pode; liberar, só tela que o editor também tem (ou que o
  // usuário já tinha — voltar atrás de uma retirada ainda não salva).
  const podeMudar = (usuario, tela) =>
    editavel(usuario) && (editorMaster || telasEditor.has(tela) || temSalvo(usuario, tela));

  function alternar(usuario, tela) {
    if (!podeMudar(usuario, tela)) return;
    const novo = !temAtual(usuario, tela);
    setPendentes((prev) => {
      const proximo = new Map(prev);
      const k = chave(usuario.id, tela);
      if (novo === temSalvo(usuario, tela)) proximo.delete(k);
      else proximo.set(k, novo);
      return proximo;
    });
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (status === 'ativos' && !u.ativo) return false;
      if (status === 'inativos' && u.ativo) return false;
      if (empresaId && !(u.empresa_ids || []).map(String).includes(empresaId)) return false;
      if (termo && ![u.nome, u.email, u.username].some((v) => (v || '').toLowerCase().includes(termo))) return false;
      return true;
    });
  }, [usuarios, status, empresaId, busca]);

  // Grupo recolhido vira uma coluna só, com a contagem de telas do usuário nele.
  const colunas = useMemo(
    () =>
      TELAS_SISTEMA.flatMap((g) => {
        if (recolhidos.has(g.grupo)) {
          return [{ id: `grupo:${g.grupo}`, grupo: g.grupo, telas: g.telas.map((t) => t.codigo), inicioGrupo: true }];
        }
        return g.telas.map((t, i) => ({ id: t.codigo, grupo: g.grupo, codigo: t.codigo, label: t.label, inicioGrupo: i === 0 }));
      }),
    [recolhidos]
  );
  const larguraMinima =
    LARGURA_NOME + colunas.reduce((soma, c) => soma + (c.telas ? LARGURA_GRUPO_RECOLHIDO : LARGURA_MINIMA_TELA), 0);

  // Códigos gravados que não existem mais no menu: não dão acesso a nada e
  // não aparecem no cadastro (ninguém consegue tirar pela tela).
  const telasAntigas = useMemo(() => {
    const codigos = new Set();
    let qtdUsuarios = 0;
    for (const u of usuarios) {
      const antigas = (u.telas_permitidas || []).filter((t) => !CODIGOS.has(t));
      antigas.forEach((t) => codigos.add(t));
      if (antigas.length) qtdUsuarios += 1;
    }
    return { codigos: [...codigos].sort(), usuarios: qtdUsuarios };
  }, [usuarios]);

  const usuariosAlterados = useMemo(() => new Set([...pendentes.keys()].map((k) => k.split('|')[0])), [pendentes]);

  const qtdTelas = (usuario) => TODOS_CODIGOS_TELAS.filter((codigo) => temAtual(usuario, codigo)).length;

  function toggleGrupo(grupo) {
    setRecolhidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(grupo)) novo.delete(grupo);
      else novo.add(grupo);
      return novo;
    });
  }

  const todosRecolhidos = recolhidos.size === TELAS_SISTEMA.length;

  async function abrirUsuario(usuario) {
    if (ehVoce(usuario)) return;
    if (pendentes.size > 0) {
      const ok = await confirm({
        title: 'Descartar alterações?',
        description: `Há ${plural(pendentes.size, 'alteração não salva', 'alterações não salvas')} no mapa. Abrir o cadastro descarta essas alterações.`,
        confirmLabel: 'Descartar e abrir',
        variant: 'warning',
      });
      if (!ok) return;
    }
    navigate(`/cadastros/usuarios/${usuario.id}`, { state: { voltarPara: '/cadastros/usuarios?aba=mapa' } });
  }

  async function descartar() {
    const ok = await confirm({
      title: 'Descartar alterações',
      description: `Desfazer ${plural(pendentes.size, 'alteração não salva', 'alterações não salvas')}?`,
      confirmLabel: 'Descartar',
      variant: 'warning',
    });
    if (ok) setPendentes(new Map());
  }

  function avisar(title, description) {
    return confirm({ title, description, onlyOk: true, variant: 'warning' });
  }

  async function salvar() {
    const porUsuario = new Map();
    for (const [k, acesso] of pendentes) {
      const [id, tela] = k.split('|');
      if (!porUsuario.has(id)) porUsuario.set(id, []);
      porUsuario.get(id).push({ tela, acesso });
    }
    const usuarioPorId = new Map(usuarios.map((u) => [String(u.id), u]));

    const semTela = [...porUsuario.keys()].map((id) => usuarioPorId.get(id)).filter((u) => qtdTelas(u) === 0);
    if (semTela.length) {
      await avisar(
        'Usuário sem nenhuma tela',
        `${semTela.map((u) => u.nome).join(', ')} ${semTela.length === 1 ? 'ficaria' : 'ficariam'} sem nenhuma tela. ` +
          'Para tirar todo o acesso, desative o usuário no cadastro.'
      );
      return;
    }

    const linhas = [...porUsuario].map(([id, lista]) => {
      const partes = lista
        .sort((a, b) => TODOS_CODIGOS_TELAS.indexOf(a.tela) - TODOS_CODIGOS_TELAS.indexOf(b.tela))
        .map(({ tela, acesso }) => `${acesso ? '+' : '−'} ${LABEL_TELA.get(tela)}`);
      return `${usuarioPorId.get(id).nome}: ${partes.join('; ')}`;
    });
    const MAX_LINHAS = 12;
    const descricao =
      linhas.slice(0, MAX_LINHAS).join('\n') +
      (linhas.length > MAX_LINHAS ? `\n… e mais ${plural(linhas.length - MAX_LINHAS, 'usuário', 'usuários')}` : '');

    const ok = await confirm({
      title: `Salvar ${plural(pendentes.size, 'alteração', 'alterações')} em ${plural(porUsuario.size, 'usuário', 'usuários')}?`,
      description: descricao,
      confirmLabel: 'Salvar',
    });
    if (!ok) return;

    setSalvando(true);
    try {
      const alteracoes = [...pendentes].map(([k, acesso]) => {
        const [id, tela] = k.split('|');
        return { usuario_id: Number(id), tela, acesso };
      });
      setUsuarios(await salvarAcessos(alteracoes));
      setPendentes(new Map());
    } catch (err) {
      await avisar('Não foi possível salvar', err.response?.data?.message || 'Não foi possível salvar os acessos.');
    } finally {
      setSalvando(false);
    }
  }

  const opcoesEmpresa = [
    { value: '', label: 'Todas as empresas' },
    ...empresas.map((e) => ({ value: String(e.id), label: nomeExibicaoEmpresa(e) })),
  ];

  return (
    <div
      className={
        telaCheia
          ? 'fixed inset-0 z-40 overflow-y-auto bg-white p-6'
          : 'rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        {telaCheia && <h2 className="shrink-0 text-base font-semibold text-gray-900">Mapa de Acessos</h2>}
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou usuário..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
        {empresas.length > 1 && (
          <div className="w-full sm:w-60">
            <SearchableSelect value={empresaId} onChange={(v) => setEmpresaId(v || '')} options={opcoesEmpresa} clearable={false} />
          </div>
        )}
        <div className="w-full sm:w-36">
          <SearchableSelect
            value={status}
            onChange={setStatus}
            options={[
              { value: 'ativos', label: 'Ativos' },
              { value: 'inativos', label: 'Inativos' },
              { value: 'todos', label: 'Todos' },
            ]}
            clearable={false}
          />
        </div>
        <button
          type="button"
          onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(TELAS_SISTEMA.map((g) => g.grupo)))}
          className="shrink-0 text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          {todosRecolhidos ? 'Expandir grupos' : 'Recolher grupos'}
        </button>
        <button
          type="button"
          onClick={() => setTelaCheia((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 lg:ml-auto"
        >
          {telaCheia ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>

      {telasAntigas.codigos.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {plural(telasAntigas.usuarios, 'usuário tem', 'usuários têm')} acesso gravado a telas que não existem mais no
            menu ({telasAntigas.codigos.join(', ')}). Não liberam nada e não aparecem aqui nem no cadastro.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <Marca tem /> Com acesso
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-5 w-5 rounded bg-amber-50 ring-2 ring-inset ring-amber-400" /> Alteração não salva
        </span>
        <span className="flex items-center gap-1.5">
          <Marca removido /> Acesso que será tirado
        </span>
        <span className="text-gray-400">
          Clique na célula para liberar ou tirar a tela, e no nome da tela para ver quem acessa.
        </span>
      </div>

      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>
      ) : (
        <table
          className="w-full table-fixed border-separate border-spacing-0 rounded-lg border border-gray-200 text-sm"
          style={{ minWidth: `${larguraMinima}rem` }}
          onMouseLeave={() => setColunaRealce(null)}
        >
          <colgroup>
            <col style={{ width: `${LARGURA_NOME}rem` }} />
            {colunas.map((c) => (
              <col key={c.id} style={c.telas ? { width: `${LARGURA_GRUPO_RECOLHIDO}rem` } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`${TH} sticky -top-6 z-30 border-r px-3 text-left align-bottom text-xs font-medium`}>
                {telaCheia && (
                  <button
                    type="button"
                    onClick={() => setTelaCheia(false)}
                    title="Sair da tela cheia (Esc)"
                    className="absolute right-2 top-2 rounded p-1 text-blue-700/70 hover:bg-blue-100 hover:text-blue-900"
                  >
                    <Minimize2 size={14} />
                  </button>
                )}
                <div className="flex flex-col gap-2 pb-2">
                  {pendentes.size > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                      <p className="mb-1.5 text-amber-800">
                        {plural(pendentes.size, 'alteração', 'alterações')} em{' '}
                        {plural(usuariosAlterados.size, 'usuário', 'usuários')}
                      </p>
                      <div className="flex gap-1.5">
                        <Button variant="secondary" onClick={descartar} disabled={salvando} className="px-2.5 py-1 text-xs">
                          <Undo2 size={13} />
                          Descartar
                        </Button>
                        <Button onClick={salvar} loading={salvando} className="px-2.5 py-1 text-xs">
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}
                  <div>
                    {plural(visiveis.length, 'usuário', 'usuários')}
                    <span className="block font-normal text-blue-700/70">Clique no nome para abrir o cadastro</span>
                  </div>
                </div>
              </th>
              {TELAS_SISTEMA.map((g) => {
                const recolhido = recolhidos.has(g.grupo);
                return (
                  <th
                    key={g.grupo}
                    colSpan={recolhido ? 1 : g.telas.length}
                    className={`${TH} ${SEPARADOR_GRUPO} sticky -top-6 z-20 h-8 px-1`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGrupo(g.grupo)}
                      title={recolhido ? `Expandir ${g.grupo}` : `Recolher ${g.grupo}`}
                      className="flex w-full items-center justify-center gap-1 truncate text-xs font-semibold hover:text-blue-700"
                    >
                      {recolhido ? <ChevronRight size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
                      <span className="truncate">{g.grupo}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr>
              {colunas.map((c) => {
                const liberavel = editorMaster || c.telas || telasEditor.has(c.codigo);
                return (
                  <th
                    key={c.id}
                    className={`${TH} ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-blue-100'} sticky top-2 z-20 h-36 p-0 font-medium ${
                      colunaRealce === c.id ? 'bg-blue-100' : ''
                    }`}
                    onMouseEnter={() => setColunaRealce(c.id)}
                  >
                    <button
                      type="button"
                      onClick={() => (c.telas ? toggleGrupo(c.grupo) : setTelaDetalhe(c.codigo))}
                      title={
                        c.telas
                          ? `Expandir ${c.grupo}`
                          : `${c.grupo} › ${c.label} — ver quem acessa${liberavel ? '' : ' (você não tem esta tela para liberar)'}`
                      }
                      className={`flex h-full w-full items-end justify-center pb-2 hover:text-blue-700 ${
                        liberavel ? '' : 'text-blue-900/40'
                      }`}
                    >
                      <span className="rotate-180 whitespace-nowrap text-[11px] [writing-mode:vertical-rl]">
                        {c.telas ? `${plural(c.telas.length, 'tela', 'telas')} (recolhido)` : c.label}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 1} className="py-10 text-center text-sm text-gray-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
            {visiveis.map((u) => {
              const voce = ehVoce(u);
              const alterado = usuariosAlterados.has(String(u.id));
              const empresasTexto = (u.empresa_nomes || []).join(', ') || 'Sem empresa';
              return (
                <tr key={u.id} className={`group ${u.ativo ? '' : 'opacity-60'}`}>
                  <td
                    className={`border-b border-r border-gray-100 px-3 ${
                      alterado ? 'bg-amber-50' : 'bg-white group-hover:bg-gray-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => abrirUsuario(u)}
                      disabled={voce}
                      title={voce ? 'Você não pode alterar os seus próprios acessos.' : 'Abrir cadastro'}
                      className="flex w-full min-w-0 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <Avatar usuario={u} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`truncate text-[13px] leading-4 text-gray-900 ${voce ? '' : 'group-hover:text-primary-700'}`}
                          >
                            {u.nome}
                          </span>
                          {voce && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-500">
                              Você
                            </span>
                          )}
                          {!u.ativo && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-500">
                              Inativo
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[10px] leading-3 text-gray-400" title={empresasTexto}>
                          {plural(qtdTelas(u), 'tela', 'telas')} · {empresasTexto}
                        </div>
                      </div>
                    </button>
                  </td>

                  {colunas.map((c) => {
                    const realce = colunaRealce === c.id;
                    const base = `border-b border-gray-100 ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-gray-100'}`;

                    if (c.telas) {
                      const qtd = c.telas.filter((t) => temAtual(u, t)).length;
                      const temPendente = c.telas.some((t) => pendentes.has(chave(u.id, t)));
                      return (
                        <td
                          key={c.id}
                          onMouseEnter={() => setColunaRealce(c.id)}
                          className={`${base} h-9 text-center text-xs tabular-nums ${
                            temPendente ? 'bg-amber-50' : realce ? 'bg-blue-50/60' : 'group-hover:bg-gray-50'
                          }`}
                        >
                          {qtd === 0 ? (
                            <span className="text-gray-300">–</span>
                          ) : (
                            <span className="text-gray-700">
                              {qtd}/{c.telas.length}
                            </span>
                          )}
                        </td>
                      );
                    }

                    const tem = temAtual(u, c.codigo);
                    const pendente = pendentes.has(chave(u.id, c.codigo));
                    const pode = podeMudar(u, c.codigo);
                    const motivo = voce ? 'Você não pode alterar os seus próprios acessos.' : 'Você não tem esta tela para liberar.';
                    const dica = `${u.nome} · ${c.label}: ${tem ? 'com acesso' : 'sem acesso'}${
                      pendente ? ' (alteração não salva)' : ''
                    }${pode ? '' : ` — ${motivo}`}`;
                    return (
                      <td
                        key={c.id}
                        onMouseEnter={() => setColunaRealce(c.id)}
                        className={`${base} h-9 p-0 ${pendente ? '' : realce ? 'bg-blue-50/60' : 'group-hover:bg-gray-50'}`}
                      >
                        <button
                          type="button"
                          onClick={() => alternar(u, c.codigo)}
                          disabled={!pode}
                          title={dica}
                          className={`flex h-full w-full items-center justify-center ${
                            pendente ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : ''
                          } ${pode ? 'cursor-pointer hover:bg-primary-50' : 'cursor-not-allowed'}`}
                        >
                          <Marca tem={tem} removido={pendente && !tem} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {visiveis.length > 0 && (
            <tfoot>
              <tr>
                <td className={`${TH} sticky -bottom-6 z-30 border-r border-t px-3 py-2 text-xs font-medium`}>
                  Usuários com acesso
                </td>
                {colunas.map((c) => {
                  const telas = c.telas || [c.codigo];
                  const qtd = visiveis.filter((u) => telas.some((t) => temAtual(u, t))).length;
                  return (
                    <td
                      key={c.id}
                      className={`${TH} ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-blue-100'} sticky -bottom-6 z-20 border-t py-2 text-center text-xs font-semibold tabular-nums ${
                        colunaRealce === c.id ? 'bg-blue-100' : ''
                      }`}
                    >
                      {qtd || <span className="font-normal text-blue-300">0</span>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      )}

      <QuemAcessaModal
        tela={telaDetalhe}
        usuarios={visiveis}
        temAtual={temAtual}
        pendentes={pendentes}
        filtrado={Boolean(empresaId || busca.trim() || status !== 'todos')}
        onClose={() => setTelaDetalhe(null)}
      />
    </div>
  );
}

// "Quem acessa" uma tela: os usuários da matriz (com os filtros dela).
// Alteração ainda não salva já conta, marcada.
function QuemAcessaModal({ tela, usuarios, temAtual, pendentes, filtrado, onClose }) {
  if (!tela) return null;
  const lista = usuarios.filter((u) => temAtual(u, tela));

  return (
    <Modal open title={`${GRUPO_TELA.get(tela)} › ${LABEL_TELA.get(tela)}`} onClose={onClose} maxWidthClass="max-w-lg">
      <p className="mb-4 text-sm text-gray-500">
        {lista.length === 0 ? 'Ninguém acessa esta tela' : `${plural(lista.length, 'usuário acessa', 'usuários acessam')} esta tela`}
        {filtrado ? ' (considerando os filtros do mapa).' : '.'} Usuários Master acessam todas.
      </p>
      {lista.length > 0 && (
        <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
          {lista.map((u) => (
            <li key={u.id} className="flex items-center gap-2.5 px-3 py-2">
              <Avatar usuario={u} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-900">
                  {u.nome}
                  {!u.ativo && <span className="ml-1.5 text-xs text-gray-400">(inativo)</span>}
                </p>
                <p className="truncate text-[11px] text-gray-400">{(u.empresa_nomes || []).join(', ')}</p>
              </div>
              {pendentes.has(chave(u.id, tela)) && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  não salvo
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-gray-400">Para mudar, clique na célula do usuário no mapa.</p>
    </Modal>
  );
}
