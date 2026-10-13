import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListTree, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listContas } from '../../../api/planosFinanceirosSienge.api';

const LIMIT = 2000;

const GRADE = 'grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3';

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara (duplicada aqui de
// propósito — telas não importam umas das outras nesse projeto).
function formatarCodigoMascara(codigo, larguras) {
  const digitos = String(codigo);
  const segmentos = [];
  let pos = 0;

  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }

  if (pos < digitos.length && segmentos.length > 0) {
    segmentos[segmentos.length - 1] += digitos.slice(pos);
  }

  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

function codigoFormatado(conta) {
  return formatarCodigoMascara(conta.sienge_id, [
    conta.mascara_nivel_1,
    conta.mascara_nivel_2,
    conta.mascara_nivel_3,
    conta.mascara_nivel_4,
    conta.mascara_nivel_5,
    conta.mascara_nivel_6,
    conta.mascara_nivel_7,
  ]);
}

// Monta a árvore pelo próprio código: a mãe de uma conta é a conta totalizadora (tp_conta 'T')
// mais próxima cujo código é prefixo do dela (1 → 101 → 10101 → 1010101).
function montarArvore(contas) {
  const ordenadas = [...contas].sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
  const raizes = [];
  const pilha = [];
  ordenadas.forEach((conta) => {
    const codigo = String(conta.sienge_id);
    while (pilha.length && !codigo.startsWith(String(pilha[pilha.length - 1].sienge_id))) pilha.pop();
    const no = { ...conta, filhos: [] };
    if (pilha.length) pilha[pilha.length - 1].filhos.push(no);
    else raizes.push(no);
    if (conta.tp_conta === 'T') pilha.push(no);
  });
  return raizes;
}

// Operações > DFC Construtoras > Plano Contas: espelho do cadastro Cadastros > Planos Financeiros
// da empresa (mesma fonte, mesmas colunas — código, descrição e status), no drilldown da aba
// Máscaras (pedido do usuário): as contas totalizadoras são as linhas cinza com +/- e contador, e
// cada nível abaixo vem mais recuado. Tudo começa fechado; com busca, mostra as contas que batem
// junto com as totalizadoras acima delas, já abertas. A atualização a partir do Sienge mora no
// topo da página (DfcConstrutorasPage.jsx).
export default function DfcPlanoContasTab({ empresaId, search = '', refreshToken = 0, onTotal }) {
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setContas([]);
      onTotal?.(0);
      return;
    }
    setCarregando(true);
    setErroCarga('');
    listContas(empresaId, { page: 1, limit: LIMIT, search: '' })
      .then((result) => {
        setContas(result.data);
        onTotal?.(result.pagination.total);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o plano de contas.'))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    setAbertos([]);
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const arvore = useMemo(() => montarArvore(contas), [contas]);

  // Com busca: só os ramos com alguma conta que bate (pelo código, com ou sem pontos, ou pela
  // descrição), e tudo aberto.
  const termo = search.trim().toLowerCase();
  const visivel = useMemo(() => {
    if (!termo) return null;
    const ids = new Set();
    const bate = (c) =>
      String(c.sienge_id).includes(termo.replace(/\./g, '')) ||
      codigoFormatado(c).includes(termo) ||
      (c.name || '').toLowerCase().includes(termo);
    const marcar = (no) => {
      const algumFilho = no.filhos.map(marcar).some(Boolean);
      if (algumFilho || bate(no)) {
        ids.add(no.sienge_id);
        return true;
      }
      return false;
    };
    arvore.forEach(marcar);
    return ids;
  }, [arvore, termo]);

  function alternar(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  // Lista achatada das linhas visíveis, com a profundidade de cada uma (pro recuo).
  const linhas = [];
  const percorrer = (nos, nivel) => {
    nos.forEach((no) => {
      if (visivel && !visivel.has(no.sienge_id)) return;
      linhas.push({ conta: no, nivel });
      const aberto = visivel ? true : abertos.includes(no.sienge_id);
      if (aberto && no.filhos.length) percorrer(no.filhos, nivel + 1);
    });
  };
  percorrer(arvore, 0);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <ListTree size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o plano de contas.</p>
      </div>
    );
  }

  return (
    // Tabela dentro do quadro branco, com margem em volta (p-5) e cabeçalho de cantos de cima
    // arredondados — mesmo padrão das abas Máscaras e Centros Custos.
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
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
      ) : contas.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <ListTree size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta no plano de contas desta empresa.</p>
          <p className="max-w-sm text-xs text-gray-400">Use o ícone no canto direito, acima, para gerar a partir do Sienge.</p>
        </div>
      ) : linhas.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Nenhuma conta encontrada para essa busca.</div>
      ) : (
        <div>
          <div
            className={`${GRADE} rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Conta</span>
            <span>Status</span>
          </div>

          {linhas.map(({ conta, nivel }) => {
            const totalizadora = conta.tp_conta === 'T';
            const temFilhos = conta.filhos.length > 0;
            const aberto = visivel ? true : abertos.includes(conta.sienge_id);
            const recuo = { paddingLeft: 16 + nivel * 28 };
            const conteudo = (
              <>
                <span className="flex min-w-0 items-center gap-2" style={recuo}>
                  {totalizadora ? (
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                        temFilhos ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
                      }`}
                    >
                      {aberto && temFilhos ? <Minus size={10} /> : <Plus size={10} />}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">{codigoFormatado(conta)}</span>
                  <span
                    className={`min-w-0 truncate text-xs ${totalizadora ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}
                    title={conta.name}
                  >
                    {conta.name}
                  </span>
                  {totalizadora && temFilhos && (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                      {conta.filhos.length}
                    </span>
                  )}
                </span>
                <span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      conta.fl_ativa === 'S' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa'}
                  </span>
                </span>
              </>
            );

            return totalizadora ? (
              <div
                key={conta.sienge_id}
                role="button"
                tabIndex={0}
                onClick={() => temFilhos && !visivel && alternar(conta.sienge_id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && temFilhos && !visivel) alternar(conta.sienge_id);
                }}
                className={`${GRADE} border-b border-gray-200 bg-gray-50 py-2.5 pr-4 ${
                  temFilhos && !visivel ? 'cursor-pointer hover:bg-gray-100' : ''
                }`}
              >
                {conteudo}
              </div>
            ) : (
              <div key={conta.sienge_id} className={`${GRADE} border-b border-gray-100 bg-white py-1.5 pr-4 hover:bg-gray-50`}>
                {conteudo}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
