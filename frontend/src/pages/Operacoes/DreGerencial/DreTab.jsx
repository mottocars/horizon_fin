import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { listMascaras } from '../../../api/mascaras.api';
import { ESTRUTURA_DRE } from '../../../config/estruturaDre';
import OperadorBadge from './OperadorBadge';

const GRUPOS_COM_ITENS = ESTRUTURA_DRE.filter((g) => !g.calculado);

// Wash de fundo por tipo de operador — segmenta visualmente a demonstração em blocos (receita
// em verde, deduções em vermelho, mistas em âmbar), com as barras escuras de subtotal
// (RECEITA LÍQUIDA, LUCRO BRUTO, EBITDA, LUCRO LÍQUIDO) fechando cada seção — mesma leitura em
// cascata de um DRE de verdade.
const FUNDO_OPERADOR = {
  '+': 'border-emerald-200 bg-emerald-50/60',
  '-': 'border-rose-200 bg-rose-50/60',
  '+/-': 'border-amber-200 bg-amber-50/60',
};

// Demonstração estrutural (nível 1 + nível 2) da DRE — busca os itens de Máscara DRE
// cadastrados em cada grupo (aba Máscaras) e monta a mesma hierarquia num layout de
// demonstrativo contábil, com os subtotais calculados fechando cada seção. Só estrutura por
// enquanto (pedido do usuário foi o layout) — os valores reais (realizado/orçamento) ficam pra
// quando essa integração existir.
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
        <div className="mx-auto max-w-2xl px-6 py-8">
          <div className="mb-6 text-center">
            <h1 className="text-sm font-bold uppercase tracking-wide text-gray-900">
              Demonstração do Resultado do Exercício
            </h1>
            <p className="mt-1 text-xs text-gray-400">Estrutura por linha — valores em breve</p>
          </div>

          <div className="space-y-3">
            {ESTRUTURA_DRE.map((grupo) => (
              <LinhaGrupo key={grupo.value} grupo={grupo} itens={itensPorGrupo[grupo.value]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaGrupo({ grupo, itens }) {
  if (grupo.calculado) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-5 py-3.5 shadow-sm">
        <OperadorBadge operador={grupo.operador} escuro />
        <p className="flex-1 text-sm font-bold uppercase tracking-wide text-white">{grupo.label}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border-l-4 px-5 py-4 ${FUNDO_OPERADOR[grupo.operador]}`}>
      <div className="flex items-center gap-3">
        <OperadorBadge operador={grupo.operador} />
        <p className="text-sm font-bold uppercase tracking-wide text-gray-900">{grupo.label}</p>
      </div>
      <div className="mt-2.5 space-y-1 pl-10">
        {!itens ? null : itens.length === 0 ? (
          <p className="text-xs italic text-gray-400">Nenhum item cadastrado nesta linha ainda.</p>
        ) : (
          itens.map((item) => (
            <p key={item.id} className="text-sm text-gray-700">
              {item.descricao}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
