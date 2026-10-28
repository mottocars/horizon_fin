import { useCallback, useEffect, useState } from 'react';
import { Plus, KeyRound, Ban, ListChecks, ExternalLink, Copy, Check, ShieldCheck, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import Modal from '../../../components/Modal';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  listChavesApiHorizon,
  criarChaveApiHorizon,
  revogarChaveApiHorizon,
  listChamadasApiHorizon,
} from '../../../api/apiHorizon.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { useAuth } from '../../../auth/AuthContext';

// Chaves da API Horizon (api.horizonhub.com.br): um sistema externo troca a chave por um token
// temporário e consulta certificados e notas do Espião NF-e / NFS-e. A chave age com as
// permissões de quem a gerou (precisa da tela Espião NFe / NFSe) e só enxerga a empresa escolhida.
// O backend guarda só o hash — a chave aparece uma única vez, logo depois de gerada.

const DOCS_URL =
  import.meta.env.VITE_API_DOCS_URL || (import.meta.env.DEV ? 'http://localhost:5182' : 'https://api.horizonhub.com.br');
const TELA_ESPIAO = '/operacoes/espiao-nfe-nfse';

const VALIDADES = [
  { value: 90, label: '90 dias' },
  { value: 180, label: '180 dias' },
  { value: 365, label: '1 ano' },
];

const SITUACOES = {
  ativa: { label: 'Ativa', classe: 'bg-emerald-50 text-emerald-600' },
  expirada: { label: 'Expirada', classe: 'bg-amber-50 text-amber-700' },
  revogada: { label: 'Revogada', classe: 'bg-gray-100 text-gray-500' },
};

const inputClasse =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100';

function formatarData(data) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function mensagemErro(err, padrao) {
  return err?.response?.data?.message || padrao;
}

function NovaChaveModal({ open, onClose, onCriada }) {
  const [empresas, setEmpresas] = useState([]);
  const [form, setForm] = useState({ nome: '', empresaId: '', validadeDias: 365, podeInativar: false });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [criada, setCriada] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ nome: '', empresaId: '', validadeDias: 365, podeInativar: false });
    setErro('');
    setCriada(null);
    setCopiado(false);
    listEmpresas({ ativo: true, limit: 100 }).then((r) => {
      setEmpresas(r.data);
      if (r.data.length === 1) setForm((f) => ({ ...f, empresaId: String(r.data[0].id) }));
    });
  }, [open]);

  async function gerar(e) {
    e.preventDefault();
    if (form.nome.trim().length < 3) return setErro('Dê um nome para a chave (ex.: "Integração GI").');
    if (!form.empresaId) return setErro('Escolha a empresa.');
    setSalvando(true);
    setErro('');
    try {
      const r = await criarChaveApiHorizon({ ...form, empresaId: Number(form.empresaId) });
      setCriada(r);
      onCriada();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível gerar a chave.'));
    } finally {
      setSalvando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(criada.chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não foi possível copiar — selecione a chave e copie manualmente.');
    }
  }

  if (criada) {
    return (
      <Modal open={open} title="Chave gerada" onClose={onClose} maxWidthClass="max-w-xl">
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            Copie agora e guarde num cofre de senhas. Por segurança, esta chave não aparece de novo.
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{criada.item.nome}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={criada.chave}
                onFocus={(e) => e.target.select()}
                className={`${inputClasse} font-mono text-[13px]`}
              />
              <Button variant="secondary" onClick={copiar} className="shrink-0">
                {copiado ? <Check size={16} /> : <Copy size={16} />}
                {copiado ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
          </div>
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
            <p className="mb-2 font-medium text-gray-900">Como usar</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Troque a chave por um token: <code className="font-mono text-[12px] text-gray-900">POST /v1/auth/token</code> com o
                cabeçalho <code className="font-mono text-[12px] text-gray-900">X-Api-Key</code>.
              </li>
              <li>
                Use o token (vale 15 minutos) em{' '}
                <code className="font-mono text-[12px] text-gray-900">Authorization: Bearer &lt;token&gt;</code>.
              </li>
            </ol>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-primary-600 hover:text-primary-700"
            >
              Abrir a documentação e testar <ExternalLink size={14} />
            </a>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Concluir</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Nova chave de API" onClose={onClose} maxWidthClass="max-w-xl">
      <form onSubmit={gerar} className="space-y-4">
        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            value={form.nome}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            placeholder="ex.: Integração Gerando Impulso"
            className={inputClasse}
          />
          <p className="mt-1 text-xs text-gray-400">Quem vai usar esta chave — aparece na lista e no registro de chamadas.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={form.empresaId}
              onChange={(v) => setForm((f) => ({ ...f, empresaId: v }))}
              options={empresas.map((e) => ({ value: String(e.id), label: nomeExibicaoEmpresa(e) }))}
              placeholder="Selecione"
              emptyMessage="Nenhuma empresa encontrada."
            />
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
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-4">
          <input
            type="checkbox"
            checked={form.podeInativar}
            onChange={(e) => setForm((f) => ({ ...f, podeInativar: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900">Permitir inativar notas</span>
            <span className="block text-xs text-gray-500">
              Sem isso a chave só lê. Com isso, o sistema externo também marca notas como &quot;não lançar&quot;, com
              motivo — registrado no seu nome, como se você tivesse clicado em Inativar.
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvando}>
            <KeyRound size={16} />
            Gerar chave
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ChamadasModal({ chave, onClose }) {
  const [itens, setItens] = useState(null);

  useEffect(() => {
    if (!chave) return;
    setItens(null);
    listChamadasApiHorizon(chave.id)
      .then((r) => setItens(r.data))
      .catch(() => setItens([]));
  }, [chave]);

  return (
    <Modal open={!!chave} title={`Chamadas — ${chave?.nome || ''}`} onClose={onClose} maxWidthClass="max-w-4xl">
      {itens === null ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">Nenhuma chamada feita com esta chave.</div>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-400">Últimas 100 chamadas.</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 font-medium">Quando</th>
                <th className="py-2 font-medium">Chamada</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">IP</th>
                <th className="py-2 text-right font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 align-top">
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
        </>
      )}
    </Modal>
  );
}

export default function ApiHorizonPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [chamadasDe, setChamadasDe] = useState(null);
  const [revogandoId, setRevogandoId] = useState(null);

  const master = user?.permissao === 'MASTER';
  const temEspiao = master || (user?.telas_permitidas || []).includes(TELA_ESPIAO);

  const carregar = useCallback(async () => {
    try {
      const r = await listChavesApiHorizon();
      setItens(r.data);
      setErro('');
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível carregar as chaves.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function revogar(item) {
    const ok = await confirm({
      title: 'Revogar chave',
      description: `A chave "${item.nome}" para de funcionar imediatamente, inclusive os tokens já gerados com ela. Não dá para desfazer.`,
      confirmLabel: 'Revogar',
      variant: 'warning',
    });
    if (!ok) return;
    setRevogandoId(item.id);
    try {
      await revogarChaveApiHorizon(item.id);
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível revogar a chave.'));
    } finally {
      setRevogandoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-3xl text-sm text-gray-500">
            Chaves para sistemas externos consultarem, pela API Horizon, os certificados digitais e as notas fiscais do
            Espião NF-e / NFS-e. Cada chave age com as suas permissões e só enxerga a empresa escolhida.
          </p>
          <div className="flex shrink-0 gap-2">
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ExternalLink size={16} />
              Documentação
            </a>
            <Button onClick={() => setNovaAberta(true)} disabled={!temEspiao}>
              <Plus size={16} />
              Nova chave
            </Button>
          </div>
        </div>

        {!temEspiao && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            A API Horizon serve os dados do Espião NFe / NFSe. Para gerar uma chave, peça acesso a essa tela.
          </div>
        )}
        {erro && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <KeyRound size={28} className="text-gray-300" />
            Nenhuma chave gerada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-3 font-medium">Nome</th>
                  {master && <th className="py-3 pr-3 font-medium">Usuário</th>}
                  <th className="py-3 pr-3 font-medium">Empresa</th>
                  <th className="py-3 pr-3 font-medium">Chave</th>
                  <th className="py-3 pr-3 font-medium">Permissões</th>
                  <th className="py-3 pr-3 font-medium">Expira em</th>
                  <th className="py-3 pr-3 font-medium">Último uso</th>
                  <th className="py-3 pr-3 font-medium">Status</th>
                  <th className="py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const situacao = SITUACOES[item.situacao];
                  return (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-3 text-gray-900">{item.nome}</td>
                      {master && <td className="py-3 pr-3 text-gray-600">{item.usuario_nome}</td>}
                      <td className="py-3 pr-3 text-gray-600">{item.empresa_nome}</td>
                      <td className="py-3 pr-3 font-mono text-[12px] text-gray-500">{item.prefixo}…</td>
                      <td className="py-3 pr-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                          <ShieldCheck size={12} />
                          {item.pode_inativar ? 'Leitura + inativar' : 'Leitura'}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-gray-500">{formatarData(item.expira_em)}</td>
                      <td className="py-3 pr-3 text-gray-500">
                        {formatarDataHora(item.ultimo_uso_em)}
                        {item.chamadas_30_dias > 0 && (
                          <div className="text-xs text-gray-400">{item.chamadas_30_dias} chamadas em 30 dias</div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${situacao.classe}`}>
                          {situacao.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <IconButton title="Chamadas" onClick={() => setChamadasDe(item)}>
                            <ListChecks size={16} />
                          </IconButton>
                          {item.situacao !== 'revogada' && (
                            <IconButton
                              title="Revogar"
                              onClick={() => revogar(item)}
                              disabled={revogandoId === item.id}
                              className="hover:bg-red-50 hover:text-red-600"
                            >
                              <Ban size={16} />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NovaChaveModal open={novaAberta} onClose={() => setNovaAberta(false)} onCriada={carregar} />
      <ChamadasModal chave={chamadasDe} onClose={() => setChamadasDe(null)} />
    </div>
  );
}
