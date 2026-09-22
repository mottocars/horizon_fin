import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, Minus, Plus, TriangleAlert } from 'lucide-react';
import LogoBanco from './LogoBanco';
import { listBancos, listContas } from '../../../api/contasBancariasSienge.api';
import { OPCOES_CLASSIFICACAO } from './constantes';

const LIMIT = 2000; // mesma estratégia de sempre carregar tudo e agrupar no navegador (ver SaldosContasTab.jsx)

// "Sem classificação" precisa aparecer AQUI (diferente da matriz de Saldos das Contas, que
// esconde essas contas de propósito): este é o cadastro, o lugar onde justamente se
// classifica uma conta — escondê-las tornaria impossível achá-las pra classificar.
const SEM_CLASSIFICACAO = 'SEM_CLASSIFICACAO';
const GRUPOS_CADASTRO = [...OPCOES_CLASSIFICACAO, { value: SEM_CLASSIFICACAO, label: 'Sem classificação' }];

// Cadastro das contas bancárias — antes uma tela própria em Cadastros → Contas Bancárias,
// agora uma aba aqui (a Empresa já vem selecionada no topo da página, então não precisa mais
// da lista intermediária "qual empresa tem contas geradas"). Mesmo layout de tabela da aba
// Saldos das Contas (nível 1 = classificação, nível 2 = conta, cabeçalho e coluna de nomes
// grudados rolando a página), sem as colunas de dia — aqui a linha é a própria conta, e
// clicar nela abre a edição (banco, classificação, agência/conta/dígito, saldo inicial).
//
// Busca, status, empresas e o botão "Atualizar" (sincronizar com o Sienge) moram no card do
// topo da página, junto do filtro de Empresa — aqui embaixo só os registros (pedido do
// usuário), exatamente como as outras abas desta tela.
export default function ContasTab({ empresaId, search = '', status = [], companyIds = [], refreshToken = 0, erroAtualizar = '' }) {
  const navigate = useNavigate();

  const [contas, setContas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  // Lista completa de bancos (oficiais + customizados) só pra desenhar a logomarca de cada
  // conta — independente do empresaId (ver bancos-api.client.js), diferente do endpoint de
  // filtros da aba Saldos das Contas (que só traz os bancos EM USO por uma empresa).
  const [infoBancos, setInfoBancos] = useState(new Map());
  useEffect(() => {
    listBancos()
      .then((lista) => setInfoBancos(new Map(lista.map((b) => [b.codigo, b]))))
      .catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setContas(null);
      return;
    }
    setCarregando(true);
    setErroCarga('');
    listContas(empresaId, { page: 1, limit: LIMIT, search, status, companyIds })
      .then((result) => setContas(result.data))
      .catch((err) => {
        setContas(null);
        setErroCarga(err.response?.data?.message || 'Não foi possível carregar as contas bancárias.');
      })
      .finally(() => setCarregando(false));
  }, [empresaId, search, status, companyIds]);

  // Debounce pra busca digitada; `refreshToken` (botão Atualizar) também passa por aqui —
  // não precisa reagir na hora, um leve atraso não faz diferença pra uma sincronização.
  useEffect(() => {
    const timeout = setTimeout(carregar, 300);
    return () => clearTimeout(timeout);
  }, [carregar, refreshToken]);

  // Trocar de empresa não é possível dentro desta aba (é o seletor do topo da página) — só
  // reseta o drilldown quando os FILTROS mudam, senão a conta aberta pode sumir da lista nova
  // com o acordeão ainda "aberto" apontando pra nada.
  useEffect(() => {
    setAbertos([]);
  }, [empresaId, search, status, companyIds]);

  const grupos = useMemo(() => {
    if (!contas) return [];
    return GRUPOS_CADASTRO.map((grupo) => ({
      ...grupo,
      contas: contas.filter((c) => (c.classificacao || SEM_CLASSIFICACAO) === grupo.value),
    })).filter((grupo) => grupo.contas.length > 0);
  }, [contas]);

  function alternarGrupo(valor) {
    setAbertos((atual) => (atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]));
  }

  function abrirConta(conta) {
    navigate(`/cadastros/contas-bancarias/${empresaId}/${conta.company_id}/${encodeURIComponent(conta.numero_conta)}`);
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Landmark size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e editar as contas bancárias.
        </p>
      </div>
    );
  }

  const semContas = !carregando && !erroCarga && contas && contas.length === 0;

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {erroAtualizar && (
        <div className="mx-5 mt-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroAtualizar}</div>
      )}

      {carregando ? (
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
      ) : semContas ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Landmark size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta bancária encontrada.</p>
          <p className="max-w-sm text-xs text-gray-400">
            Ajuste os filtros ou clique em "Atualizar" para importar as contas do Sienge.
          </p>
        </div>
      ) : (
        // Mesmo motivo de SaldosContasTab.jsx: sem overflow próprio aqui — quem rola é o
        // <main> da página, e o cabeçalho/coluna de nomes ficam grudados nele.
        <div className="rounded-b-card">
          <table className="w-full border-separate border-spacing-0 text-left text-xs" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">
                  Classificação / Conta bancária
                </th>
                <th className="sticky top-0 z-10 border-b border-l border-gray-200 bg-white px-3 py-2.5 font-medium">Empresa</th>
                <th className="sticky top-0 z-10 border-b border-l border-gray-200 bg-white px-3 py-2.5 font-medium">Tipo</th>
                <th className="sticky top-0 z-10 border-b border-l border-gray-200 bg-white px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => {
                const aberto = abertos.includes(grupo.value);
                return (
                  <Fragment key={grupo.value}>
                    <tr onClick={() => alternarGrupo(grupo.value)} className="group/grupo cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-gray-200 bg-gray-50 py-2.5 pl-3 pr-2 group-hover/grupo:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="truncate text-xs font-semibold text-gray-900">{grupo.label}</span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                            {grupo.contas.length}
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-l border-gray-200 bg-gray-50 group-hover/grupo:bg-gray-100" />
                      <td className="border-b border-l border-gray-200 bg-gray-50 group-hover/grupo:bg-gray-100" />
                      <td className="border-b border-l border-gray-200 bg-gray-50 group-hover/grupo:bg-gray-100" />
                    </tr>

                    {aberto &&
                      grupo.contas.map((conta) => (
                        // `group` (não `group/grupo`, que já está em uso pela linha de
                        // classificação) + `group-hover:` em CADA célula, inclusive a fixa —
                        // ela tem bg-white próprio (precisa, pra não deixar o conteúdo de trás
                        // transparecer ao rolar), e um bg PRÓPRIO de uma célula sempre vence o
                        // hover do <tr>, então só :hover na linha não pintaria essa coluna.
                        <tr
                          key={`${conta.company_id}|${conta.numero_conta}`}
                          onClick={() => abrirConta(conta)}
                          className="group cursor-pointer"
                        >
                          <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-2 pl-9 pr-3 group-hover:bg-gray-50">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <LogoBanco codigo={conta.banco_codigo} info={infoBancos.get(conta.banco_codigo)} />
                              <div className="min-w-0">
                                <div className="truncate font-medium text-gray-900" title={conta.nome || conta.numero_conta}>
                                  {conta.nome || '—'}
                                </div>
                                <div className="truncate text-[11px] text-gray-400">{conta.numero_conta}</div>
                              </div>
                            </div>
                          </td>
                          <td className="truncate border-b border-l border-gray-100 px-3 py-2 text-gray-600 group-hover:bg-gray-50">
                            {conta.company_name || '—'}
                          </td>
                          <td className="border-b border-l border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {conta.tipo_descricao || '—'}
                            </span>
                          </td>
                          <td className="border-b border-l border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                conta.status === 'ENABLED' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {conta.status === 'ENABLED' ? 'Ativa' : 'Inativa'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
