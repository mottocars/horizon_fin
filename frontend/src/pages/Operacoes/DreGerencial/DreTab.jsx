import { Fragment, useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { listMascaras } from '../../../api/mascaras.api';
import { ESTRUTURA_DRE } from '../../../config/estruturaDre';
import OperadorBadge from './OperadorBadge';

const GRUPOS_COM_ITENS = ESTRUTURA_DRE.filter((g) => !g.calculado);

// Wash de fundo por tipo de operador na linha de nível 1 — mesma leitura em cascata da versão
// anterior (receita em verde, deduções em vermelho, mista em âmbar), só que agora como linha de
// tabela em vez de bloco de cartão (pedido do usuário: "segue como tabela, tipo Saldo das
// Contas — vai ter valores à direita, pensa numa matriz").
const FUNDO_OPERADOR = {
  '+': 'bg-emerald-50/60',
  '-': 'bg-rose-50/60',
  '+/-': 'bg-amber-50/60',
};

// Demonstração estrutural (nível 1 + nível 2) da DRE, em formato de tabela — mesma mecânica
// visual de SaldosContasTab.jsx (primeira coluna com a hierarquia, valor alinhado à direita nas
// colunas seguintes), só que aqui só existe 1 coluna de valor por enquanto (sem período — o
// cálculo real por mês fica pra outra rodada). Busca os itens de Máscara DRE cadastrados em
// cada grupo (aba Máscaras) e monta a hierarquia; os 4 subtotais calculados (RECEITA LÍQUIDA,
// LUCRO BRUTO, EBITDA, LUCRO LÍQUIDO) aparecem como uma linha escura fechando cada seção.
export default function DreTab({ empresaId }) {
  const [itensPorGrupo, setItensPorGrupo] = useState({});
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setItensPorGrupo({});
      return;
    }
    setCarregando(true);
    Promise.all(GRUPOS_COM_ITENS.map((g) => listMascaras('DRE', empresaId, g.value)))
      .then((listas) => {
        const mapa = {};
        GRUPOS_COM_ITENS.forEach((g, i) => {
          mapa[g.value] = listas[i];
        });
        setItensPorGrupo(mapa);
      })
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <BarChart3 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver a estrutura da DRE.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="overflow-x-auto rounded-b-card">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="border-b border-gray-200 bg-white py-1.5 pl-4 font-medium">Descrição</th>
                <th className="w-44 border-b border-l border-gray-200 bg-white px-4 py-1.5 text-right font-medium">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {ESTRUTURA_DRE.map((grupo) => (
                <LinhaGrupo key={grupo.value} grupo={grupo} itens={itensPorGrupo[grupo.value]} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinhaGrupo({ grupo, itens }) {
  if (grupo.calculado) {
    return (
      <tr className="bg-gray-900">
        <td className="border-b border-gray-900 py-1 pl-4">
          <span className="flex items-center gap-2">
            <OperadorBadge operador={grupo.operador} escuro />
            <span className="text-xs font-bold uppercase tracking-wide text-white">{grupo.label}</span>
          </span>
        </td>
        <td className="border-b border-l border-gray-900 px-4 py-1 text-right text-xs font-bold tabular-nums text-white/50">
          —
        </td>
      </tr>
    );
  }

  return (
    <Fragment>
      <tr className={FUNDO_OPERADOR[grupo.operador]}>
        <td className="border-b border-gray-200 py-1 pl-4">
          <span className="flex items-center gap-2">
            <OperadorBadge operador={grupo.operador} />
            <span className="text-xs font-bold uppercase tracking-wide text-gray-900">{grupo.label}</span>
          </span>
        </td>
        <td className="border-b border-l border-gray-200 px-4 py-1 text-right text-xs font-bold tabular-nums text-gray-300">
          —
        </td>
      </tr>

      {!itens ? null : itens.length === 0 ? (
        <tr>
          <td colSpan={2} className="border-b border-gray-100 py-1 pl-11 text-xs italic text-gray-300">
            Nenhum item cadastrado nesta linha ainda.
          </td>
        </tr>
      ) : (
        itens.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50">
            <td className="border-b border-gray-100 py-0.5 pl-11 text-xs text-gray-700">{item.descricao}</td>
            <td className="border-b border-l border-gray-100 px-4 py-0.5 text-right text-xs tabular-nums text-gray-300">
              —
            </td>
          </tr>
        ))
      )}
    </Fragment>
  );
}
