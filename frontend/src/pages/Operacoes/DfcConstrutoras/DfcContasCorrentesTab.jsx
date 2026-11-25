import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, Landmark, Loader2, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listContasCorrentesDfc, sincronizarContasCorrentesDfc, updateContaCorrenteDfc } from '../../../api/dfcContas.api';
import { useAlert } from '../../../confirm/ConfirmContext';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';

// Mesma grade no cabeçalho e nas linhas.
const GRADE = 'grid grid-cols-[minmax(0,1fr)_130px_220px_90px_minmax(0,0.8fr)_110px_100px] items-center gap-3';

const chave = (c) => `${c.company_id}|${c.numero_conta}`;
const SEM_TIPO = '__sem_tipo__';
// Nível 1 do drilldown: a classificação da conta no cadastro (Saldo Contas Bancárias › Contas
// Bancárias), mesmos grupos de lá — "Sem classificação" por último.
const SEM_CLASSIFICACAO = '__sem_classificacao__';
const tipoDe = (c) => c.tipo_descricao || SEM_TIPO;
// Filtro com nada marcado vale como sem filtro — mostra tudo (mesma regra da aba Plano Contas).
const efetivo = (f) => (f && f.length === 0 ? null : f);

// Operações > DFC Construtoras > Contas Correntes: as contas bancárias da empresa no Sienge
// (endpoint v1/checking-accounts — mesma tabela e mesma sincronização da tela Saldo de Contas
// Bancárias), com a flag "Projeta DFC" (pedido do usuário). Mesmo modelo e estética da aba Centros
// Custos: cabeçalho azul, cada mudança salva na hora. As contas ficam no drilldown da classificação do
// cadastro de contas bancárias (linha cinza com +/- e contador, igual ao cadastro — pedido do usuário);
// os grupos começam fechados e abrem sozinhos com busca ou filtro. O ícone de buscar no Sienge fica no
// topo da página e chama `ref.sincronizar()`.
const DfcContasCorrentesTab = forwardRef(function DfcContasCorrentesTab({ empresaId, search = '', onSincronizando }, ref) {
  const alert = useAlert();
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  // Filtros de coluna (FiltroColuna): null = sem filtro.
  const [filtroConta, setFiltroConta] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const colunaContaRef = useRef(null);
  const colunaTipoRef = useRef(null);
  const [abertos, setAbertos] = useState([]);

  const carregar = useCallback(() => {
    if (!empresaId) return Promise.resolve();
    setCarregando(true);
    setErroCarga('');
    return listContasCorrentesDfc(empresaId)
      .then(setContas)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as contas.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setContas([]);
    setFiltroConta(null);
    setFiltroTipo(null);
    setAbertos([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    carregar();
  }, [carregar]);

  async function sincronizar() {
    onSincronizando?.(true);
    try {
      const r = await sincronizarContasCorrentesDfc(empresaId);
      await carregar();
      await alert({
        title: 'Contas atualizadas',
        description: `${r.total_importado} conta(s) buscada(s) no Sienge. O "Projeta DFC" das contas que já existiam foi mantido.`,
      });
    } catch (err) {
      await alert({
        title: 'Não foi possível buscar as contas',
        description: err.response?.data?.message || 'Erro ao buscar as contas no Sienge.',
        variant: 'warning',
      });
    } finally {
      onSincronizando?.(false);
    }
  }

  useImperativeHandle(ref, () => ({ sincronizar }));

  const opcoesConta = useMemo(
    () => contas.map((c) => ({ value: chave(c), label: `${c.numero_conta} · ${c.nome || '—'} · ${c.company_name || ''}` })),
    [contas]
  );
  const opcoesTipo = useMemo(() => {
    const tipos = [...new Set(contas.map(tipoDe))].sort((a, b) => (a === SEM_TIPO ? 1 : b === SEM_TIPO ? -1 : a.localeCompare(b, 'pt-BR')));
    return tipos.map((t) => ({ value: t, label: t === SEM_TIPO ? 'SEM TIPO' : t.toUpperCase() }));
  }, [contas]);

  const filtradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const fConta = efetivo(filtroConta);
    const fTipo = efetivo(filtroTipo);
    return contas.filter(
      (c) =>
        passaNoFiltro(fConta, chave(c)) &&
        passaNoFiltro(fTipo, tipoDe(c)) &&
        (!termo ||
          [c.numero_conta, c.nome, c.agencia, c.banco_nome, c.banco_numero, c.company_name, c.tipo_descricao]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(termo)))
    );
  }, [contas, search, filtroConta, filtroTipo]);

  // Busca ou filtro de coluna ativo: todos os grupos que sobraram abertos.
  const buscando = Boolean(search.trim()) || efetivo(filtroConta) != null || efetivo(filtroTipo) != null;
  const grupos = useMemo(() => {
    const nomes = [...new Set(filtradas.map((c) => c.classificacao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...nomes.map((nome) => ({ value: nome, label: nome })), { value: SEM_CLASSIFICACAO, label: 'Sem classificação' }]
      .map((g) => ({ ...g, contas: filtradas.filter((c) => (c.classificacao || SEM_CLASSIFICACAO) === g.value) }))
      .filter((g) => g.contas.length > 0);
  }, [filtradas]);

  function alternarGrupo(valor) {
    setAbertos((atual) => (atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]));
  }

  // Atualiza a linha na hora e grava; se falhar, volta o que estava.
  async function alterar(conta, projetaDfc) {
    const k = chave(conta);
    setContas((atual) => atual.map((c) => (chave(c) === k ? { ...c, projeta_dfc: projetaDfc } : c)));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const salvo = await updateContaCorrenteDfc(empresaId, conta.company_id, conta.numero_conta, { projeta_dfc: projetaDfc });
      setContas((atual) => atual.map((c) => (chave(c) === k ? salvo : c)));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setContas((atual) => atual.map((c) => (chave(c) === k ? conta : c)));
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Landmark size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as contas correntes.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const marcadas = contas.filter((c) => c.projeta_dfc).length;

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <div className="-mt-1 mb-3 flex items-center justify-between gap-3 text-xs">
        <span className="text-gray-500">
          {contas.length > 0 && `${contas.length} conta(s) · ${marcadas} com Projeta DFC`}
        </span>
        {statusSalvamento && (
          <span aria-live="polite">
            {statusSalvamento === 'salvando' ? (
              <span className="flex items-center gap-1.5 text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Salvando...
              </span>
            ) : statusSalvamento === 'erro' ? (
              <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
                <TriangleAlert size={14} /> Erro ao salvar
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <Check size={14} /> Alterações salvas
              </span>
            )}
          </span>
        )}
      </div>

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {carregando && contas.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div>
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span ref={colunaContaRef} className="flex items-center gap-1.5">
              Conta
              <FiltroColuna
                filtro={filtroConta}
                onChange={setFiltroConta}
                opcoes={opcoesConta}
                label="Conta"
                colunaRef={colunaContaRef}
                larguraPainel={420}
              />
            </span>
            <span ref={colunaTipoRef} className="flex items-center gap-1.5">
              Tipo
              <FiltroColuna
                filtro={filtroTipo}
                onChange={setFiltroTipo}
                opcoes={opcoesTipo}
                label="Tipo"
                colunaRef={colunaTipoRef}
                larguraPainel={220}
              />
            </span>
            <span>Banco</span>
            <span>Agência</span>
            <span>Empresa</span>
            <span className="text-center">Projeta DFC</span>
            <span>Status</span>
          </div>

          {filtradas.length === 0 ? (
            <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
              {contas.length === 0
                ? 'Nenhuma conta bancária desta empresa. Use o ícone no canto direito, acima, para buscar no Sienge.'
                : 'Nenhuma conta encontrada para essa busca/filtro.'}
            </div>
          ) : (
            grupos.map((grupo) => {
              const aberto = buscando || abertos.includes(grupo.value);
              const comProjeta = grupo.contas.filter((c) => c.projeta_dfc).length;
              return (
                <Fragment key={grupo.value}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !buscando && alternarGrupo(grupo.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !buscando) alternarGrupo(grupo.value);
                    }}
                    className={`${GRADE} border-b border-gray-200 bg-gray-50 py-2.5 pl-3 pr-4 ${buscando ? '' : 'cursor-pointer hover:bg-gray-100'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                        {aberto ? <Minus size={10} /> : <Plus size={10} />}
                      </span>
                      <span className="truncate text-xs font-semibold text-gray-900">{grupo.label}</span>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                        {grupo.contas.length}
                      </span>
                    </span>
                    <span />
                    <span />
                    <span />
                    <span />
                    <span className="text-center text-[11px] tabular-nums text-gray-400" title="Contas com Projeta DFC no grupo">
                      {comProjeta}/{grupo.contas.length}
                    </span>
                    <span />
                  </div>
                  {aberto &&
                    grupo.contas.map((conta) => {
                      const ativa = conta.status === 'ENABLED';
                      return (
                        <div key={chave(conta)} className={`${GRADE} border-b border-gray-100 bg-white py-2 pl-9 pr-4 hover:bg-gray-50`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-xs tabular-nums text-gray-400">{conta.numero_conta}</span>
                            <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={conta.nome}>
                              {conta.nome || '—'}
                            </span>
                          </div>
                          <span className="min-w-0 truncate text-xs text-gray-700">{conta.tipo_descricao || '—'}</span>
                          <span className="min-w-0 truncate text-xs text-gray-700" title={conta.banco_nome}>
                            {conta.banco_numero && <span className="tabular-nums text-gray-400">{conta.banco_numero} · </span>}
                            {conta.banco_nome || '—'}
                          </span>
                          <span className="text-xs tabular-nums text-gray-700">{conta.agencia || '—'}</span>
                          <span className="min-w-0 truncate text-xs text-gray-600" title={conta.company_name}>
                            {conta.company_name || '—'}
                          </span>
                          <span className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={Boolean(conta.projeta_dfc)}
                              onChange={(e) => alterar(conta, e.target.checked)}
                              title="Projeta DFC"
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                            />
                          </span>
                          <span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                ativa ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {ativa ? 'Ativa' : 'Inativa'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                </Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

export default DfcContasCorrentesTab;
