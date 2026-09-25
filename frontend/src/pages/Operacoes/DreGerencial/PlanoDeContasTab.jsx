import { useCallback, useEffect, useState } from 'react';
import { ListTree } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { listContas, updateClassificacaoDre } from '../../../api/planosFinanceirosSienge.api';
import { listMascaras } from '../../../api/mascaras.api';

const LIMIT = 2000;

// Mesmo padrão de PlanoFinanceiroItemDetalhe.jsx (corCampo/corSelect): âmbar quando a Máscara
// DRE ainda não foi escolhida, azul quando já tem valor. A borda azul é primary-100/500 (não
// 200/400): o tema (styles/index.css) só define primary 50, 100, 500, 600 e 700.
const COR_MASCARA_VAZIA = 'border-amber-200 bg-amber-50 focus:border-amber-400';
const COR_MASCARA_PREENCHIDA = 'border-primary-100 bg-primary-50 focus:border-primary-500';

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara (duplicada aqui de
// propósito — módulos não importam um do outro nesse projeto).
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

// Lista plana do plano de contas Sienge (mesma fonte de PlanoFinanceiroDetalhe.jsx), mas sem
// navegar pra uma tela de cadastro ao clicar — aqui cada linha tem sua própria combobox de
// Máscara DRE, direto na grade (pedido do usuário). A geração/atualização (ícone "+"/refresh)
// mora no topo da página (DreGerencialPage.jsx), igual ao "Atualizar" de ContasTab.jsx.
export default function PlanoDeContasTab({ empresaId, search = '', refreshToken = 0, onTotal }) {
  const [contas, setContas] = useState([]);
  const [mascarasDre, setMascarasDre] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvandoId, setSalvandoId] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!empresaId) {
      setContas([]);
      setMascarasDre([]);
      onTotal?.(0);
      return;
    }
    setCarregando(true);
    Promise.all([listContas(empresaId, { page: 1, limit: LIMIT, search: '' }), listMascaras('DRE', empresaId)])
      .then(([result, mascaras]) => {
        setContas(result.data);
        setMascarasDre(mascaras);
        onTotal?.(result.pagination.total);
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  async function handleClassificar(siengeId, classificacaoDreId) {
    setErro('');
    setSalvandoId(siengeId);
    const valorAnterior = contas.find((c) => c.sienge_id === siengeId)?.classificacao_dre_id ?? null;
    setContas((atual) =>
      atual.map((c) => (c.sienge_id === siengeId ? { ...c, classificacao_dre_id: classificacaoDreId } : c))
    );
    try {
      await updateClassificacaoDre(empresaId, siengeId, classificacaoDreId);
    } catch (err) {
      setContas((atual) =>
        atual.map((c) => (c.sienge_id === siengeId ? { ...c, classificacao_dre_id: valorAnterior } : c))
      );
      setErro(err.response?.data?.message || 'Não foi possível salvar a Máscara DRE desta conta.');
    } finally {
      setSalvandoId(null);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <ListTree size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para gerar e classificar o plano de contas.
        </p>
      </div>
    );
  }

  const termo = search.trim().toLowerCase();
  const contasFiltradas = contas.filter(
    (c) => !termo || c.name.toLowerCase().includes(termo) || String(c.sienge_id).includes(termo)
  );
  const opcoesMascarasDre = mascarasDre.map((m) => ({ value: m.id, label: m.descricao }));

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {erro && <div className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : contas.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <ListTree size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta gerada ainda.</p>
          <p className="max-w-sm text-xs text-gray-400">
            Clique no ícone "+" acima para gerar o plano de contas a partir do Sienge.
          </p>
        </div>
      ) : contasFiltradas.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Nenhuma conta encontrada.</div>
      ) : (
        <div className="overflow-x-auto rounded-b-card">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">Código</th>
                <th className="border-b border-gray-200 bg-white px-3 py-2.5 font-medium">Descrição</th>
                <th className="w-72 border-b border-l border-gray-200 bg-white px-3 py-2.5 font-medium">Máscara DRE</th>
              </tr>
            </thead>
            <tbody>
              {contasFiltradas.map((conta) => {
                const travada = conta.tp_conta === 'T';
                return (
                  <tr key={conta.sienge_id} className={travada ? 'bg-gray-50' : ''}>
                    <td className="border-b border-gray-100 py-2.5 pl-4 text-gray-600">
                      {formatarCodigoMascara(conta.sienge_id, [
                        conta.mascara_nivel_1,
                        conta.mascara_nivel_2,
                        conta.mascara_nivel_3,
                        conta.mascara_nivel_4,
                        conta.mascara_nivel_5,
                        conta.mascara_nivel_6,
                        conta.mascara_nivel_7,
                      ])}
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2.5 text-gray-900">{conta.name}</td>
                    <td className="border-b border-l border-gray-100 px-3 py-1.5">
                      {travada ? (
                        <div className="h-9 rounded-lg border border-gray-200 bg-gray-100" />
                      ) : (
                        <SearchableSelect
                          value={conta.classificacao_dre_id || ''}
                          onChange={(value) => handleClassificar(conta.sienge_id, value || null)}
                          disabled={salvandoId === conta.sienge_id}
                          options={opcoesMascarasDre}
                          placeholder="Selecione a Máscara DRE..."
                          emptyMessage="Nenhuma máscara DRE cadastrada."
                          corClasses={conta.classificacao_dre_id ? COR_MASCARA_PREENCHIDA : COR_MASCARA_VAZIA}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {opcoesMascarasDre.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400">
              Nenhuma Máscara DRE cadastrada ainda. Cadastre em Cadastros → Máscaras antes de classificar as contas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
