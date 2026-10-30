import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Demonstração (nível 1 + nível 2) da DRE, em formato de tabela — mesma mecânica visual de
// SaldosContasTab.jsx (primeira coluna com a hierarquia, valor alinhado à direita). A hierarquia é a
// árvore cadastrada na aba Máscaras (dre_mascaras), na mesma ordem de lá. Valor = período do filtro
// (de/até) somando os centros escolhidos (vazio = todos com "Realiza DRE") — cálculo em
// dre-demonstrativo/demonstrativo.service.js. Por enquanto só a RECEITA BRUTA, o RET (Imposto Fixo) e
// o CIV têm valor; o resto fica com traço.
export default function DreTab({ empresaId, de, ate, centros = [] }) {
  const [arvore, setArvore] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');
  const chaveCentros = centros.join(',');

  const carregar = useCallback(() => {
    if (!empresaId) {
      setArvore([]);
      return;
    }
    setCarregando(true);
    listDreMascaras(empresaId)
      .then(setArvore)
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setErro('');
    if (!empresaId) {
      setResultado(null);
      return undefined;
    }
    if (de > ate) {
      setErro('A data início não pode ser depois da data fim.');
      return undefined;
    }
    let ativo = true;
    setCalculando(true);
    calcularDre(empresaId, { de, ate, centros: chaveCentros ? chaveCentros.split(',') : [] })
      .then((r) => ativo && setResultado(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível calcular a DRE.'))
      .finally(() => ativo && setCalculando(false));
    return () => {
      ativo = false;
    };
  }, [empresaId, de, ate, chaveCentros]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <BarChart3 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver a DRE.
        </p>
      </div>
    );
  }

  const valores = resultado?.valores || {};
  const semMascaraPoc = resultado && !resultado.poc_receita.mascara;

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {(erro || semMascaraPoc) && (
        <div className="space-y-2 px-4 pt-3">
          {erro && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <TriangleAlert size={15} className="shrink-0" /> {erro}
            </div>
          )}
          {semMascaraPoc && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0" />
              POC de Receita não gerada: escolha a Máscara DRE Nível 2 na aba Configurações.
            </div>
          )}
        </div>
      )}
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : arvore.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <BarChart3 size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma máscara da DRE cadastrada ainda.</p>
          <p className="max-w-sm text-xs text-gray-400">Monte a estrutura da DRE (nível 1 e nível 2) na aba Máscaras.</p>
        </div>
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
            <tbody className={calculando ? 'opacity-50 transition-opacity' : ''}>
              {comAcumulado(arvore, valores).map(({ grupo, acumulado }) => (
                <LinhaGrupo key={grupo.id} grupo={grupo} valores={valores} acumulado={acumulado} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Totaliza = soma de todas as linhas de nível 2 acima dela na DRE (Receita Líquida = Receita Bruta +
// impostos…), só quando todas já têm valor; senão, traço.
function comAcumulado(arvore, valores) {
  let soma = 0;
  let completo = true;
  return arvore.map((grupo) => {
    if (grupo.totalizadora) return { grupo, acumulado: completo ? soma : null };
    grupo.filhos.forEach((f) => {
      const v = valores[f.id];
      if (v === null || v === undefined) completo = false;
      else soma += v;
    });
    return { grupo, acumulado: null };
  });
}

const ROTULO_TIPO_POC = { RECEITA: 'POC Receita', DESPESA: 'POC Despesa' };

// Selo da marcação "% POC" (nível 2, aba Máscaras), com o Tipo POC quando informado.
function SeloPoc({ tipo }) {
  return (
    <span
      title="% POC"
      className="rounded bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-600 ring-1 ring-primary-100"
    >
      {ROTULO_TIPO_POC[tipo] || 'POC'}
    </span>
  );
}

const SIMBOLO_ICONE = { IGUAL: '=', MAIS: '+', MENOS: '-', MAIS_MENOS: '+/-' };

// Ícone (sinal) da linha de nível 1, escolhido na aba Máscaras (o = vem com Totaliza), à frente da
// descrição. Largura fixa, mesmo sem ícone, pra as descrições ficarem alinhadas.
function IconeLinha({ icone, className }) {
  return (
    <span className={`inline-block w-9 shrink-0 text-xs font-bold tabular-nums ${className}`}>
      {SIMBOLO_ICONE[icone] ? `(${SIMBOLO_ICONE[icone]})` : ''}
    </span>
  );
}

// Valor ou traço (cálculo ainda não feito); negativo em vermelho.
function Valor({ valor, vazio = 'text-gray-300', cor = 'text-gray-700' }) {
  if (valor === null || valor === undefined) return <span className={vazio}>—</span>;
  return <span className={valor < 0 ? 'text-red-600' : cor}>{moeda(valor)}</span>;
}

// Totaliza (aba Máscaras) é linha de subtotal: escura, fechando a seção, sem nível 2 — valor =
// `acumulado` (tudo acima). Linha de nível 1 = soma das de nível 2, só quando todas já têm valor.
function LinhaGrupo({ grupo, valores, acumulado }) {
  if (grupo.totalizadora) {
    return (
      <tr className="bg-gray-900">
        <td className="border-b border-gray-900 py-1 pl-4">
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-white" />
            <span className="text-xs font-bold uppercase tracking-wide text-white">{grupo.descricao}</span>
          </span>
        </td>
        <td className="border-b border-l border-gray-900 px-4 py-1 text-right text-xs font-bold tabular-nums">
          {acumulado === null ? (
            <span className="text-white/50">—</span>
          ) : (
            <span className={acumulado < 0 ? 'text-red-300' : 'text-white'}>{moeda(acumulado)}</span>
          )}
        </td>
      </tr>
    );
  }

  const doGrupo = grupo.filhos.map((f) => valores[f.id]);
  const total = doGrupo.length && doGrupo.every((v) => v !== null && v !== undefined) ? doGrupo.reduce((s, v) => s + v, 0) : null;

  return (
    <Fragment>
      <tr className="bg-gray-50">
        <td className="border-b border-gray-200 py-1 pl-4">
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-gray-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-gray-900">{grupo.descricao}</span>
          </span>
        </td>
        <td className="border-b border-l border-gray-200 px-4 py-1 text-right text-xs font-bold tabular-nums">
          <Valor valor={total} cor="text-gray-900" />
        </td>
      </tr>

      {grupo.filhos.length === 0 ? (
        <tr>
          <td colSpan={2} className="border-b border-gray-100 py-1 pl-20 text-xs italic text-gray-300">
            Nenhum item cadastrado nesta linha ainda.
          </td>
        </tr>
      ) : (
        grupo.filhos.map((item) => (
          <tr key={item.id} className="hover:bg-gray-50">
            <td className="border-b border-gray-100 py-0.5 pl-20 text-xs text-gray-700">
              {/* Descrição com largura mínima fixa: os selos de POC ficam alinhados, como numa coluna. */}
              <span className="flex items-center gap-2">
                <span className="min-w-64">{item.descricao}</span>
                {item.realiza_poc && <SeloPoc tipo={item.tipo_poc} />}
              </span>
            </td>
            <td className="border-b border-l border-gray-100 px-4 py-0.5 text-right text-xs tabular-nums">
              <Valor valor={valores[item.id]} />
            </td>
          </tr>
        ))
      )}
    </Fragment>
  );
}
