import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Ban, ListChecks, ExternalLink, Copy, Check, TriangleAlert, RefreshCw } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import Modal from '../../../components/Modal';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getMinhaChave,
  gerarMinhaChave,
  alterarAcessosMinhaChave,
  revogarMinhaChave,
  listMinhasChamadas,
  listChavesUsuarios,
  revogarChaveUsuario,
  listChamadasChave,
} from '../../../api/apiHorizon.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { useAuth } from '../../../auth/AuthContext';

// Chave da API Horizon (api.horizonhub.com.br). Cada usuário tem a sua: escolhe a empresa, a
// validade e o que a chave acessa — só aparecem os grupos de endpoints das telas que ele tem.
// O backend guarda só o hash: a chave aparece uma única vez, logo depois de gerada.

const DOCS_URL =
  import.meta.env.VITE_API_DOCS_URL || (import.meta.env.DEV ? 'http://localhost:5182' : 'https://api.horizonhub.com.br');

const VALIDADES = [
  { value: 90, label: '90 dias' },
  { value: 180, label: '180 dias' },
  { value: 365, label: '1 ano' },
];

const SITUACOES = {
  ativa: { label: 'Ativa', classe: 'bg-emerald-50 text-emerald-600' },
  expirada: { label: 'Expirada', classe: 'bg-amber-50 text-amber-700' },
};

const CORES_METODO = {
  GET: 'bg-emerald-50 text-emerald-700',
  POST: 'bg-primary-50 text-primary-700',
  PATCH: 'bg-amber-50 text-amber-700',
};

const inputClasse =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100';

function formatarData(data) {
  return data ? new Date(data).toLocaleDateString('pt-BR') : '—';
}

function formatarDataHora(data) {
  return data ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

function mensagemErro(err, padrao) {
  return err?.response?.data?.message || padrao;
}

const mesmoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Lista dos grupos de endpoints que o usuário pode liberar, cada um com seus endpoints e as
// permissões de escrita (só ativáveis com o grupo marcado).
function Acessos({ grupos, valor, onChange, desabilitado }) {
  function alternarGrupo(grupo, marcado) {
    const g = marcado ? [...valor.grupos, grupo.id] : valor.grupos.filter((x) => x !== grupo.id);
    const doGrupo = grupo.escopos.map((e) => e.id);
    const e = marcado ? valor.escopos : valor.escopos.filter((x) => !doGrupo.includes(x));
    onChange({ grupos: g, escopos: e });
  }
  function alternarEscopo(id, marcado) {
    onChange({ ...valor, escopos: marcado ? [...valor.escopos, id] : valor.escopos.filter((x) => x !== id) });
  }

  if (!grupos.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
        Nenhum acesso disponível para o seu usuário. Os acessos da API dependem das telas liberadas no seu cadastro.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {grupos.map((grupo) => {
        const marcado = valor.grupos.includes(grupo.id);
        return (
          <div
            key={grupo.id}
            className={`rounded-lg border p-4 transition-colors ${marcado ? 'border-primary-500 bg-primary-50/40' : 'border-gray-200'}`}
          >
            <label className={`flex items-start gap-3 ${desabilitado ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={marcado}
                disabled={desabilitado}
                onChange={(e) => alternarGrupo(grupo, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{grupo.titulo}</span>
                <span className="block text-xs text-gray-500">{grupo.descricao}</span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {grupo.endpoints.map(([metodo, caminho]) => (
                    <span key={`${metodo} ${caminho}`} className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-gray-600">
                      <span className={`rounded px-1 py-px text-[10px] font-semibold ${CORES_METODO[metodo]}`}>{metodo}</span>
                      {caminho}
                    </span>
                  ))}
                </span>
              </span>
            </label>
            {grupo.escopos.length > 0 && (
              <div className="ml-7 mt-3 space-y-2 border-t border-gray-100 pt-3">
                {grupo.escopos.map((escopo) => (
                  <label
                    key={escopo.id}
                    className={`flex items-start gap-2.5 ${!marcado || desabilitado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={valor.escopos.includes(escopo.id)}
                      disabled={!marcado || desabilitado}
                      onChange={(e) => alternarEscopo(escopo.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>
                      <span className="block text-[13px] font-medium text-gray-900">{escopo.titulo}</span>
                      <span className="block text-xs text-gray-500">{escopo.descricao}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChaveRevelada({ chave, onFechar }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão de área de transferência: o usuário seleciona e copia */
    }
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2 text-sm text-amber-800">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />
        <span>
          Copie sua chave agora e guarde num cofre de senhas. Por segurança, ela <strong>não aparece de novo</strong>.
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={chave} onFocus={(e) => e.target.select()} className={`${inputClasse} bg-white font-mono text-[13px]`} />
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={copiar}>
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? 'Copiada' : 'Copiar'}
          </Button>
          <Button onClick={onFechar}>Já guardei</Button>
        </div>
      </div>
    </div>
  );
}

function ChamadasModal({ aberto, titulo, carregar, onClose }) {
  const [itens, setItens] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    setItens(null);
    carregar()
      .then((r) => setItens(r.data))
      .catch(() => setItens([]));
  }, [aberto, carregar]);

  return (
    <Modal open={aberto} title={titulo} onClose={onClose} maxWidthClass="max-w-4xl">
      {itens === null ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Nenhuma chamada feita.</div>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400">Últimas 100 chamadas.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Chamada</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">IP</th>
                  <th className="py-2 text-right font-medium">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 align-top last:border-0">
                    <td className="whitespace-nowrap py-2 pr-3 text-gray-500">{formatarDataHora(c.criado_em)}</td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-[12px] font-semibold text-gray-900">{c.metodo}</span>{' '}
                      <span className="font-mono text-[12px] text-gray-700">{c.rota.replace(/^\/api/, '')}</span>
                      {c.consulta && <div className="break-all font-mono text-[11px] text-gray-400">?{c.consulta}</div>}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.status < 300 ? 'bg-emerald-50 text-emerald-600' : c.status < 500 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[12px] text-gray-500">{c.ip}</td>
                    <td className="py-2 text-right text-gray-500">{c.duracao_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function Dado({ rotulo, children }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{rotulo}</p>
      <div className="mt-1 text-sm text-gray-900">{children}</div>
    </div>
  );
}

// Formulário de geração: empresa, validade e acessos. Também usado para gerar uma chave nova
// no lugar da atual (já vem preenchido com o que ela tinha).
function FormGerar({ grupos, inicial, substituindo, onGerada, onCancelar }) {
  const [empresas, setEmpresas] = useState([]);
  const [form, setForm] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 }).then((r) => {
      setEmpresas(r.data);
      if (r.data.length === 1) setForm((f) => (f.empresaId ? f : { ...f, empresaId: String(r.data[0].id) }));
    });
  }, []);

  async function gerar(e) {
    e.preventDefault();
    if (!form.empresaId) return setErro('Escolha a empresa.');
    if (!form.grupos.length) return setErro('Escolha pelo menos um acesso.');
    setSalvando(true);
    setErro('');
    try {
      onGerada(await gerarMinhaChave({ ...form, empresaId: Number(form.empresaId) }));
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível gerar a chave.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={gerar} className="space-y-5">
      {substituindo && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          A chave atual deixa de funcionar assim que a nova for gerada. Atualize os sistemas que a usam.
        </div>
      )}
      {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:max-w-3xl">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
          <SearchableSelect
            value={form.empresaId}
            onChange={(v) => setForm((f) => ({ ...f, empresaId: v }))}
            options={empresas.map((e) => ({ value: String(e.id), label: nomeExibicaoEmpresa(e) }))}
            placeholder="Selecione"
            emptyMessage="Nenhuma empresa encontrada."
          />
          <p className="mt-1 text-xs text-gray-400">A chave só enxerga os dados desta empresa.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Validade</label>
          <select
            value={form.validadeDias}
            onChange={(e) => setForm((f) => ({ ...f, validadeDias: Number(e.target.value) }))}
            className={inputClasse}
          >
            {VALIDADES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">O que a chave acessa</p>
        <p className="mb-3 text-xs text-gray-400">Aparecem só os acessos das telas que você tem no sistema.</p>
        <Acessos grupos={grupos} valor={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={salvando} disabled={!grupos.length}>
          <KeyRound size={16} />
          {substituindo ? 'Gerar nova chave' : 'Gerar chave'}
        </Button>
      </div>
    </form>
  );
}

function ChavesUsuarios({ onChamadas }) {
  const confirm = useConfirm();
  const [itens, setItens] = useState(null);

  const carregar = useCallback(() => {
    listChavesUsuarios()
      .then((r) => setItens(r.data))
      .catch(() => setItens([]));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function revogar(item) {
    const ok = await confirm({
      title: 'Revogar chave',
      description: `A chave de ${item.usuario_nome} para de funcionar imediatamente, inclusive os tokens já gerados com ela.`,
      confirmLabel: 'Revogar',
      variant: 'warning',
    });
    if (!ok) return;
    await revogarChaveUsuario(item.id);
    carregar();
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-gray-900">Chaves dos usuários</h2>
      <p className="mt-0.5 text-sm text-gray-500">Visível só para Master: acompanhe o uso e revogue se precisar.</p>
      {itens === null ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Nenhum usuário tem chave em uso.</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 pr-3 font-medium">Usuário</th>
                <th className="py-3 pr-3 font-medium">Empresa</th>
                <th className="py-3 pr-3 font-medium">Acessos</th>
                <th className="py-3 pr-3 font-medium">Expira em</th>
                <th className="py-3 pr-3 font-medium">Último uso</th>
                <th className="py-3 pr-3 font-medium">Status</th>
                <th className="py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-3 text-gray-900">{item.usuario_nome}</td>
                  <td className="py-3 pr-3 text-gray-600">{item.empresa_nome}</td>
                  <td className="py-3 pr-3 text-gray-600">
                    {item.grupos_titulos.join(', ')}
                    {item.escopos_titulos.length > 0 && <div className="text-xs text-amber-700">+ {item.escopos_titulos.join(', ')}</div>}
                  </td>
                  <td className="py-3 pr-3 text-gray-500">{formatarData(item.expira_em)}</td>
                  <td className="py-3 pr-3 text-gray-500">{formatarDataHora(item.ultimo_uso_em)}</td>
                  <td className="py-3 pr-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${SITUACOES[item.situacao].classe}`}>
                      {SITUACOES[item.situacao].label}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton title="Chamadas" onClick={() => onChamadas(item)}>
                        <ListChecks size={16} />
                      </IconButton>
                      <IconButton title="Revogar" onClick={() => revogar(item)} className="hover:bg-red-50 hover:text-red-600">
                        <Ban size={16} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ApiHorizonPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [revelada, setRevelada] = useState(null);
  const [acessos, setAcessos] = useState({ grupos: [], escopos: [] });
  const [salvandoAcessos, setSalvandoAcessos] = useState(false);
  const [chamadas, setChamadas] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await getMinhaChave();
      setDados(r);
      setAcessos({ grupos: r.chave?.grupos || [], escopos: r.chave?.escopos || [] });
      setErro('');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível carregar sua chave.'));
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const chave = dados?.chave;
  const grupos = useMemo(() => dados?.grupos || [], [dados]);
  // Grupos liberados na chave que o usuário não pode mais usar (perdeu a tela).
  const semAcesso = useMemo(() => (chave?.grupos || []).filter((g) => !grupos.some((x) => x.id === g)), [chave, grupos]);
  const acessosMudaram = chave && !(mesmoConjunto(acessos.grupos, chave.grupos) && mesmoConjunto(acessos.escopos, chave.escopos));

  async function salvarAcessos() {
    if (!acessos.grupos.length) return setErro('Deixe pelo menos um acesso marcado (ou revogue a chave).');
    setSalvandoAcessos(true);
    try {
      await alterarAcessosMinhaChave({ grupos: acessos.grupos.filter((g) => !semAcesso.includes(g)), escopos: acessos.escopos });
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar os acessos.'));
    } finally {
      setSalvandoAcessos(false);
    }
  }

  async function revogar() {
    const ok = await confirm({
      title: 'Revogar sua chave',
      description: 'A chave para de funcionar imediatamente, inclusive os tokens já gerados com ela. Não dá para desfazer.',
      confirmLabel: 'Revogar',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      await revogarMinhaChave();
      setRevelada(null);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível revogar a chave.'));
    }
  }

  function aoGerar(resultado) {
    setRevelada(resultado.chave);
    setGerando(false);
    carregar();
  }

  const carregarMinhasChamadas = useCallback(() => listMinhasChamadas(), []);
  const carregarChamadasUsuario = useCallback(() => listChamadasChave(chamadas?.id), [chamadas]);

  const documentacao = (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      <ExternalLink size={16} />
      Documentação
    </a>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Sua chave de API</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
              Para integrar outros sistemas ao Horizon. Cada usuário tem uma chave, que age com as suas permissões e só
              acessa o que você liberar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {documentacao}
            {chave && !gerando && (
              <>
                <Button variant="secondary" onClick={() => setChamadas({ minha: true })}>
                  <ListChecks size={16} />
                  Chamadas
                </Button>
                <Button variant="secondary" onClick={() => setGerando(true)}>
                  <RefreshCw size={16} />
                  Gerar nova
                </Button>
                <Button variant="danger" onClick={revogar}>
                  <Ban size={16} />
                  Revogar
                </Button>
              </>
            )}
          </div>
        </div>

        {erro && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
        {revelada && (
          <div className="mb-5">
            <ChaveRevelada chave={revelada} onFechar={() => setRevelada(null)} />
          </div>
        )}

        {!dados ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : !chave || gerando ? (
          <FormGerar
            grupos={grupos}
            substituindo={!!chave}
            inicial={{
              empresaId: chave ? String(chave.empresa_id) : '',
              validadeDias: 365,
              grupos: chave ? chave.grupos.filter((g) => !semAcesso.includes(g)) : [],
              escopos: chave?.escopos || [],
            }}
            onGerada={aoGerar}
            onCancelar={chave ? () => setGerando(false) : null}
          />
        ) : (
          <div className="space-y-5">
            {chave.situacao === 'expirada' && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                Sua chave expirou em {formatarData(chave.expira_em)}. Gere uma nova para voltar a usar a API.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Dado rotulo="Chave">
                <span className="font-mono text-[13px]">{chave.prefixo}…</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${SITUACOES[chave.situacao].classe}`}>
                  {SITUACOES[chave.situacao].label}
                </span>
              </Dado>
              <Dado rotulo="Empresa">{chave.empresa_nome}</Dado>
              <Dado rotulo="Validade">
                até {formatarData(chave.expira_em)}
                <span className="block text-xs text-gray-400">gerada em {formatarData(chave.criado_em)}</span>
              </Dado>
              <Dado rotulo="Último uso">
                {formatarDataHora(chave.ultimo_uso_em)}
                <span className="block text-xs text-gray-400">{chave.chamadas_30_dias} chamadas em 30 dias</span>
              </Dado>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">O que a chave acessa</p>
              <p className="mb-3 text-xs text-gray-400">Mude quando quiser — vale na hora, sem trocar a chave.</p>
              {semAcesso.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  Você perdeu o acesso à tela de:{' '}
                  {semAcesso.map((g) => chave.grupos_titulos[chave.grupos.indexOf(g)]).join(', ')}. A chave não acessa mais esses
                  endpoints.
                </div>
              )}
              <Acessos grupos={grupos} valor={acessos} onChange={setAcessos} />
              {acessosMudaram && (
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAcessos({ grupos: chave.grupos, escopos: chave.escopos })}>
                    Desfazer
                  </Button>
                  <Button onClick={salvarAcessos} loading={salvandoAcessos}>
                    Salvar acessos
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {user?.permissao === 'MASTER' && <ChavesUsuarios onChamadas={(item) => setChamadas(item)} />}

      <ChamadasModal
        aberto={!!chamadas}
        titulo={chamadas?.minha ? 'Chamadas da sua chave' : `Chamadas — ${chamadas?.usuario_nome || ''}`}
        carregar={chamadas?.minha ? carregarMinhasChamadas : carregarChamadasUsuario}
        onClose={() => setChamadas(null)}
      />
    </div>
  );
}
