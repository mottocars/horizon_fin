import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Search,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  User as UserIcon,
} from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { getMapaAcessos, salvarAcessos } from '../../api/usuarios.api';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../confirm/ConfirmContext';
import { TELAS_SISTEMA, TODOS_CODIGOS_TELAS } from '../../config/telasSistema';
import { nomeExibicaoEmpresa } from '../../utils/empresa';

// Mapa de Acessos (aba de Cadastros › Usuários): matriz usuário × tela, com
// o nível de cada um (Comum ou Administrador). Clicar numa célula alterna
// sem acesso → Comum → Administrador; as alterações ficam pendentes (em
// amarelo) até "Salvar", que grava tudo de uma vez. Valem as mesmas travas
// do cadastro (UsuarioForm.jsx / usuarios.controller.js): Master não entra
// (tem tudo), ninguém mexe nos próprios acessos e quem não é Master só
// concede o que tem.

const COMUM = 'COMUM';
const ADMIN = 'ADMINISTRADOR';
const CICLO = [null, COMUM, ADMIN];
const ROTULO_NIVEL = { [COMUM]: 'Comum', [ADMIN]: 'Administrador' };

const LABEL_TELA = new Map(TELAS_SISTEMA.flatMap((g) => g.telas.map((t) => [t.codigo, t.label])));
const GRUPO_TELA = new Map(TELAS_SISTEMA.flatMap((g) => g.telas.map((t) => [t.codigo, g.grupo])));
const CODIGOS = new Set(TODOS_CODIGOS_TELAS);

// Larguras (rem) — a tabela é table-fixed, então a soma vira a largura dela.
const LARGURA_NOME = 17;
const LARGURA_TELA = 2.25;
const LARGURA_GRUPO_RECOLHIDO = 4.5;

const TH = 'border-b border-blue-200 bg-blue-50 text-blue-900';
const SEPARADOR_GRUPO = 'border-l-2 border-l-blue-200';

const chave = (usuarioId, tela) => `${usuarioId}|${tela}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function nivelSalvo(usuario, tela) {
  if (usuario.permissao === 'MASTER') return ADMIN;
  if (!(usuario.telas_permitidas || []).includes(tela)) return null;
  return (usuario.telas_administrador || []).includes(tela) ? ADMIN : COMUM;
}

function Marca({ nivel, removido }) {
  if (nivel === ADMIN) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
        <ShieldCheck size={12} />
      </span>
    );
  }
  if (nivel === COMUM) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-700">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  }
  if (removido) return <span className="h-5 w-5 rounded-full border-2 border-dashed border-amber-400" />;
  return null;
}

function Avatar({ usuario, tamanho = 'h-7 w-7' }) {
  return (
    <div
      className={`flex ${tamanho} shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-primary-600`}
    >
      {usuario.avatar_url ? (
        <img src={usuario.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon size={13} />
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
  // chave(usuario, tela) → nível novo (null = tirar o acesso). Só o que
  // difere do que está gravado.
  const [pendentes, setPendentes] = useState(() => new Map());
  const [colunaRealce, setColunaRealce] = useState(null);
  const [telaDetalhe, setTelaDetalhe] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

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

  const telasEditor = useMemo(() => new Set(user?.telas_permitidas || []), [user]);
  const adminEditor = useMemo(() => new Set(user?.telas_administrador || []), [user]);

  const ehVoce = (usuario) => String(usuario.id) === String(user?.id);
  const editavel = (usuario) => usuario.permissao === 'BASICO' && !ehVoce(usuario);

  function nivelAtual(usuario, tela) {
    const k = chave(usuario.id, tela);
    return pendentes.has(k) ? pendentes.get(k) : nivelSalvo(usuario, tela);
  }

  // Níveis que quem está editando pode deixar nesta célula — o que o usuário
  // já tinha pode ficar; acrescentar, só o que o editor também tem.
  function niveisPossiveis(usuario, tela) {
    if (editorMaster) return CICLO;
    const salvo = nivelSalvo(usuario, tela);
    const niveis = [null];
    if (salvo || telasEditor.has(tela)) niveis.push(COMUM);
    if (salvo === ADMIN || adminEditor.has(tela)) niveis.push(ADMIN);
    return niveis;
  }

  function alternar(usuario, tela) {
    const possiveis = niveisPossiveis(usuario, tela);
    if (!editavel(usuario) || possiveis.length < 2) return;
    const atual = nivelAtual(usuario, tela);
    const proximo = possiveis[(possiveis.indexOf(atual) + 1) % possiveis.length];
    setPendentes((prev) => {
      const novo = new Map(prev);
      const k = chave(usuario.id, tela);
      if (proximo === nivelSalvo(usuario, tela)) novo.delete(k);
      else novo.set(k, proximo);
      return novo;
    });
    setErroSalvar('');
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios
      .filter((u) => {
        if (status === 'ativos' && !u.ativo) return false;
        if (status === 'inativos' && u.ativo) return false;
        if (empresaId && u.permissao !== 'MASTER' && !(u.empresa_ids || []).map(String).includes(empresaId)) {
          return false;
        }
        if (termo && ![u.nome, u.email, u.username].some((v) => (v || '').toLowerCase().includes(termo))) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.permissao === 'MASTER' ? 0 : 1) - (b.permissao === 'MASTER' ? 0 : 1));
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
  const larguraTabela =
    LARGURA_NOME + colunas.reduce((soma, c) => soma + (c.telas ? LARGURA_GRUPO_RECOLHIDO : LARGURA_TELA), 0);

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

  function resumoUsuario(usuario) {
    let telas = 0;
    let admin = 0;
    for (const codigo of TODOS_CODIGOS_TELAS) {
      const nivel = nivelAtual(usuario, codigo);
      if (nivel) telas += 1;
      if (nivel === ADMIN) admin += 1;
    }
    return { telas, admin };
  }

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
    if (!ok) return;
    setPendentes(new Map());
    setErroSalvar('');
  }

  async function salvar() {
    const porUsuario = new Map();
    for (const [k, nivel] of pendentes) {
      const [id, tela] = k.split('|');
      if (!porUsuario.has(id)) porUsuario.set(id, []);
      porUsuario.get(id).push({ tela, nivel });
    }
    const usuarioPorId = new Map(usuarios.map((u) => [String(u.id), u]));

    const semTela = [...porUsuario.keys()].map((id) => usuarioPorId.get(id)).filter((u) => resumoUsuario(u).telas === 0);
    if (semTela.length) {
      setErroSalvar(
        `${semTela.map((u) => u.nome).join(', ')} ${semTela.length === 1 ? 'ficaria' : 'ficariam'} sem nenhuma tela. ` +
          'Para tirar todo o acesso, desative o usuário no cadastro.'
      );
      return;
    }

    const linhas = [...porUsuario].map(([id, lista]) => {
      const u = usuarioPorId.get(id);
      const partes = lista
        .sort((a, b) => TODOS_CODIGOS_TELAS.indexOf(a.tela) - TODOS_CODIGOS_TELAS.indexOf(b.tela))
        .map(({ tela, nivel }) => {
          const antes = nivelSalvo(u, tela);
          const label = LABEL_TELA.get(tela);
          if (!antes) return `+ ${label} (${ROTULO_NIVEL[nivel]})`;
          if (!nivel) return `− ${label}`;
          return `${label}: ${ROTULO_NIVEL[antes]} → ${ROTULO_NIVEL[nivel]}`;
        });
      return `${u.nome}: ${partes.join('; ')}`;
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
    setErroSalvar('');
    try {
      const alteracoes = [...pendentes].map(([k, nivel]) => {
        const [id, tela] = k.split('|');
        return { usuario_id: Number(id), tela, nivel };
      });
      const atualizados = await salvarAcessos(alteracoes);
      setUsuarios(atualizados);
      setPendentes(new Map());
    } catch (err) {
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar os acessos.');
    } finally {
      setSalvando(false);
    }
  }

  const opcoesEmpresa = [
    { value: '', label: 'Todas as empresas' },
    ...empresas.map((e) => ({ value: String(e.id), label: nomeExibicaoEmpresa(e) })),
  ];

  return (
    <Card className="rounded-tl-none">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
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
        </div>

        {pendentes.size > 0 && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 py-1.5 pl-3 pr-1.5">
            <span className="text-xs font-medium text-amber-800">
              {plural(pendentes.size, 'alteração', 'alterações')} em {plural(usuariosAlterados.size, 'usuário', 'usuários')}
            </span>
            <Button type="button" variant="secondary" onClick={descartar} disabled={salvando} className="px-3 py-1.5 text-xs">
              <Undo2 size={14} />
              Descartar
            </Button>
            <Button type="button" onClick={salvar} loading={salvando} className="px-3 py-1.5 text-xs">
              Salvar
            </Button>
          </div>
        )}
      </div>

      {erroSalvar && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroSalvar}</div>}

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
          <Marca nivel={COMUM} /> Comum
        </span>
        <span className="flex items-center gap-1.5">
          <Marca nivel={ADMIN} /> Administrador
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-5 w-5 rounded bg-amber-50 ring-2 ring-inset ring-amber-400" /> Alteração não salva
        </span>
        <span className="flex items-center gap-1.5">
          <Marca removido /> Acesso que será tirado
        </span>
        <span className="text-gray-400">
          Clique na célula para alternar (sem acesso → Comum → Administrador) e no nome da tela para ver quem acessa.
        </span>
      </div>

      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>
      ) : (
        <div
          className="max-h-[calc(100vh-19rem)] overflow-auto rounded-lg border border-gray-200"
          onMouseLeave={() => setColunaRealce(null)}
        >
          <table
            className="table-fixed border-separate border-spacing-0 text-sm"
            style={{ width: `${larguraTabela}rem` }}
          >
            <colgroup>
              <col style={{ width: `${LARGURA_NOME}rem` }} />
              {colunas.map((c) => (
                <col key={c.id} style={{ width: `${c.telas ? LARGURA_GRUPO_RECOLHIDO : LARGURA_TELA}rem` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className={`${TH} sticky left-0 top-0 z-30 border-r px-3 text-left align-bottom text-xs font-medium`}
                >
                  <div className="pb-2">
                    {plural(visiveis.length, 'usuário', 'usuários')}
                    <span className="block font-normal text-blue-700/70">Clique no nome para abrir o cadastro</span>
                  </div>
                </th>
                {TELAS_SISTEMA.map((g) => {
                  const recolhido = recolhidos.has(g.grupo);
                  return (
                    <th
                      key={g.grupo}
                      colSpan={recolhido ? 1 : g.telas.length}
                      className={`${TH} ${SEPARADOR_GRUPO} sticky top-0 z-20 h-8 px-1`}
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
                {colunas.map((c) => (
                  <th
                    key={c.id}
                    className={`${TH} ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-blue-100'} sticky top-8 z-20 h-40 p-0 font-medium ${
                      colunaRealce === c.id ? 'bg-blue-100' : ''
                    }`}
                    onMouseEnter={() => setColunaRealce(c.id)}
                  >
                    {c.telas ? (
                      <button
                        type="button"
                        onClick={() => toggleGrupo(c.grupo)}
                        title={`Expandir ${c.grupo}`}
                        className="flex h-full w-full items-end justify-center pb-2 hover:text-blue-700"
                      >
                        <span className="rotate-180 whitespace-nowrap text-[11px] [writing-mode:vertical-rl]">
                          {plural(c.telas.length, 'tela', 'telas')} (recolhido)
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTelaDetalhe(c.codigo)}
                        title={`${c.grupo} › ${c.label} — ver quem acessa${
                          editorMaster || telasEditor.has(c.codigo) ? '' : ' (você não tem esta tela para liberar)'
                        }`}
                        className={`flex h-full w-full items-end justify-center pb-2 hover:text-blue-700 ${
                          editorMaster || telasEditor.has(c.codigo) ? '' : 'text-blue-900/40'
                        }`}
                      >
                        <span className="rotate-180 whitespace-nowrap text-[11px] [writing-mode:vertical-rl]">{c.label}</span>
                      </button>
                    )}
                  </th>
                ))}
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
                const master = u.permissao === 'MASTER';
                const voce = ehVoce(u);
                const alterado = usuariosAlterados.has(String(u.id));
                const resumo = master ? null : resumoUsuario(u);
                const empresasTexto = master ? 'Todas as empresas' : (u.empresa_nomes || []).join(', ') || 'Sem empresa';
                return (
                  <tr key={u.id} className={`group ${u.ativo ? '' : 'opacity-60'}`}>
                    <td
                      className={`sticky left-0 z-10 border-b border-r border-gray-100 px-3 py-1.5 ${
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
                            <span className={`truncate text-sm text-gray-900 ${voce ? '' : 'group-hover:text-primary-700'}`}>
                              {u.nome}
                            </span>
                            {voce && (
                              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                Você
                              </span>
                            )}
                            {!u.ativo && (
                              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                Inativo
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-gray-400" title={empresasTexto}>
                            {master ? (
                              <span className="font-medium text-purple-600">Master</span>
                            ) : (
                              <>
                                {plural(resumo.telas, 'tela', 'telas')}
                                {resumo.admin > 0 && <span className="text-blue-600"> · {resumo.admin} Adm</span>}
                              </>
                            )}
                            {' · '}
                            {empresasTexto}
                          </div>
                        </div>
                      </button>
                    </td>

                    {master ? (
                      <td
                        colSpan={colunas.length}
                        className="border-b border-gray-100 bg-purple-50/40 px-4 text-xs text-purple-700 group-hover:bg-purple-50"
                      >
                        <span className="flex items-center gap-1.5">
                          <Crown size={13} />
                          Acesso total: todas as telas, como Administrador, em todas as empresas.
                        </span>
                      </td>
                    ) : (
                      colunas.map((c) => {
                        const realce = colunaRealce === c.id;
                        const base = `border-b border-gray-100 ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-gray-100'}`;

                        if (c.telas) {
                          const niveis = c.telas.map((t) => nivelAtual(u, t));
                          const qtd = niveis.filter(Boolean).length;
                          const adm = niveis.filter((n) => n === ADMIN).length;
                          const temPendente = c.telas.some((t) => pendentes.has(chave(u.id, t)));
                          return (
                            <td
                              key={c.id}
                              onMouseEnter={() => setColunaRealce(c.id)}
                              className={`${base} h-11 text-center text-xs tabular-nums ${
                                temPendente ? 'bg-amber-50' : realce ? 'bg-blue-50/60' : 'group-hover:bg-gray-50'
                              }`}
                            >
                              {qtd === 0 ? (
                                <span className="text-gray-300">–</span>
                              ) : (
                                <span className="text-gray-700">
                                  {qtd}/{c.telas.length}
                                  {adm > 0 && <span className="text-blue-600"> ·{adm}</span>}
                                </span>
                              )}
                            </td>
                          );
                        }

                        const salvo = nivelSalvo(u, c.codigo);
                        const nivel = nivelAtual(u, c.codigo);
                        const pendente = pendentes.has(chave(u.id, c.codigo));
                        const podeMudar = editavel(u) && niveisPossiveis(u, c.codigo).length > 1;
                        const motivo = voce
                          ? 'Você não pode alterar os seus próprios acessos.'
                          : 'Você não tem esta tela para liberar.';
                        const rotulo = nivel ? ROTULO_NIVEL[nivel] : 'sem acesso';
                        const dica = `${u.nome} · ${c.label}: ${rotulo}${
                          pendente ? ` (era ${salvo ? ROTULO_NIVEL[salvo] : 'sem acesso'})` : ''
                        }${podeMudar ? '' : ` — ${motivo}`}`;
                        return (
                          <td
                            key={c.id}
                            onMouseEnter={() => setColunaRealce(c.id)}
                            className={`${base} h-11 p-0 ${realce && !pendente ? 'bg-blue-50/60' : ''} ${
                              pendente ? '' : 'group-hover:bg-gray-50'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => alternar(u, c.codigo)}
                              disabled={!podeMudar}
                              title={dica}
                              className={`flex h-full w-full items-center justify-center ${
                                pendente ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : ''
                              } ${podeMudar ? 'cursor-pointer hover:bg-primary-50' : 'cursor-not-allowed'}`}
                            >
                              <Marca nivel={nivel} removido={pendente && !nivel} />
                            </button>
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              })}
            </tbody>

            {visiveis.length > 0 && (
              <tfoot>
                <tr>
                  <td className={`${TH} sticky bottom-0 left-0 z-30 border-r border-t px-3 py-2 text-xs font-medium`}>
                    Usuários com acesso
                  </td>
                  {colunas.map((c) => {
                    const telas = c.telas || [c.codigo];
                    const qtd = visiveis.filter((u) => telas.some((t) => nivelAtual(u, t))).length;
                    return (
                      <td
                        key={c.id}
                        className={`${TH} ${c.inicioGrupo ? SEPARADOR_GRUPO : 'border-l border-l-blue-100'} sticky bottom-0 z-20 border-t py-2 text-center text-xs font-semibold tabular-nums ${
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
        </div>
      )}

      <QuemAcessaModal
        tela={telaDetalhe}
        usuarios={visiveis}
        nivelAtual={nivelAtual}
        pendentes={pendentes}
        filtrado={Boolean(empresaId || busca.trim() || status !== 'todos')}
        onClose={() => setTelaDetalhe(null)}
      />
    </Card>
  );
}

// "Quem acessa" uma tela: os usuários da matriz (com os filtros dela)
// separados por nível. Alteração ainda não salva já conta, marcada.
function QuemAcessaModal({ tela, usuarios, nivelAtual, pendentes, filtrado, onClose }) {
  if (!tela) return null;
  const masters = usuarios.filter((u) => u.permissao === 'MASTER');
  const basicos = usuarios.filter((u) => u.permissao !== 'MASTER');
  const admins = basicos.filter((u) => nivelAtual(u, tela) === ADMIN);
  const comuns = basicos.filter((u) => nivelAtual(u, tela) === COMUM);
  const total = masters.length + admins.length + comuns.length;

  const secoes = [
    { titulo: 'Administrador', lista: admins, Icon: ShieldCheck, cor: 'text-blue-600' },
    { titulo: 'Comum', lista: comuns, Icon: Check, cor: 'text-gray-600' },
    { titulo: 'Master (acesso total)', lista: masters, Icon: Crown, cor: 'text-purple-600' },
  ];

  return (
    <Modal open title={`${GRUPO_TELA.get(tela)} › ${LABEL_TELA.get(tela)}`} onClose={onClose} maxWidthClass="max-w-lg">
      <p className="mb-4 text-sm text-gray-500">
        {total === 0 ? 'Ninguém acessa esta tela' : `${plural(total, 'usuário acessa', 'usuários acessam')} esta tela`}
        {filtrado ? ' (considerando os filtros do mapa).' : '.'}
      </p>
      <div className="space-y-4">
        {secoes
          .filter((s) => s.lista.length > 0)
          .map(({ titulo, lista, Icon, cor }) => (
            <div key={titulo}>
              <p className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${cor}`}>
                <Icon size={13} />
                {titulo} ({lista.length})
              </p>
              <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
                {lista.map((u) => (
                  <li key={u.id} className="flex items-center gap-2.5 px-3 py-2">
                    <Avatar usuario={u} tamanho="h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-900">
                        {u.nome}
                        {!u.ativo && <span className="ml-1.5 text-xs text-gray-400">(inativo)</span>}
                      </p>
                      {u.permissao !== 'MASTER' && (
                        <p className="truncate text-[11px] text-gray-400">{(u.empresa_nomes || []).join(', ')}</p>
                      )}
                    </div>
                    {pendentes.has(chave(u.id, tela)) && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        não salvo
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      <p className="mt-4 text-xs text-gray-400">Para mudar, clique na célula do usuário no mapa.</p>
    </Modal>
  );
}
