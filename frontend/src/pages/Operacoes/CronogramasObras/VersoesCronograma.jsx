import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, History, TriangleAlert } from 'lucide-react';
import { baixarPlanilhaVersaoCronograma, listVersoesCronograma } from '../../../api/cronogramaCentros.api';
import { linhasDaObra } from './cronogramaObras';
import LinhaAlteracao from './LinhaAlteracao';
import ResultadoComunicado from './ResultadoComunicado';

const quando = (ts) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts));

// Aba Versões de Operações > Cronogramas Obras (versionamento do cronograma — pedido do usuário): as
// versões gravadas, da mais nova para a mais antiga — quem gravou e quando, as obras alteradas (o
// detalhe abre na linha), a observação, o resultado do comunicado de WhatsApp e a planilha da versão
// (o mesmo anexo do comunicado, montado do retrato guardado na versão).
export default function VersoesCronograma({ empresaId }) {
  const [versoes, setVersoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(null);
  const [baixando, setBaixando] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    listVersoesCronograma(empresaId)
      .then(setVersoes)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar as versões.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setVersoes([]);
    setAberta(null);
    carregar();
  }, [carregar]);

  async function baixar(v) {
    setBaixando(v.id);
    try {
      const blob = await baixarPlanilhaVersaoCronograma(empresaId, v.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Cronograma de Obras - Versão ${v.numero}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível baixar a planilha.');
    } finally {
      setBaixando(null);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <History size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as versões do cronograma.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {erro && (
        <p className="mb-3 flex items-center gap-1.5 text-sm text-red-600">
          <TriangleAlert size={15} /> {erro}
        </p>
      )}
      {carregando && !versoes.length ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : !versoes.length ? (
        <div className="flex flex-col items-center py-14 text-center">
          <History size={28} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">Nenhuma versão gravada ainda</p>
          <p className="mt-1 max-w-md text-xs text-gray-500">
            Altere as datas das etapas das obras na aba Centros de Custos e grave a versão por lá: ela entra no cronograma e o
            comunicado vai por WhatsApp para os destinatários da aba Configurações.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
                <th className="w-8 py-2.5 pl-3" />
                <th className="py-2.5 pr-3 font-medium">Versão</th>
                <th className="py-2.5 pr-3 font-medium">Gravada</th>
                <th className="py-2.5 pr-3 font-medium">Obras alteradas</th>
                <th className="py-2.5 pr-3 font-medium">Comunicado</th>
                <th className="py-2.5 pr-3 text-right font-medium">Planilha</th>
              </tr>
            </thead>
            <tbody>
              {versoes.map((v) => {
                const expandida = aberta === v.id;
                const nomes = v.alteracoes.map((a) => a.nome);
                return (
                  <Fragment key={v.id}>
                    <tr
                      className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50"
                      onClick={() => setAberta(expandida ? null : v.id)}
                      title={expandida ? 'Esconder o detalhe' : 'Ver o que mudou'}
                    >
                      <td className="py-3 pl-3 text-gray-400">{expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="py-3 pr-3 font-semibold text-gray-900">{v.numero}</td>
                      <td className="py-3 pr-3 text-xs text-gray-600">
                        <span className="block tabular-nums text-gray-800">{quando(v.criado_em)}</span>
                        {v.criado_por_nome && <span className="text-gray-400">por {v.criado_por_nome}</span>}
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-700">
                        <span className="font-medium">{nomes.length === 1 ? '1 obra' : `${nomes.length} obras`}</span>
                        <span className="text-gray-500"> · {nomes.slice(0, 4).join(', ')}{nomes.length > 4 ? '…' : ''}</span>
                        {v.observacao && <span className="mt-0.5 block italic text-gray-500">“{v.observacao}”</span>}
                      </td>
                      <td className="py-3 pr-3 text-xs">
                        <ResultadoComunicado comunicado={v.comunicado} compacto />
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            baixar(v);
                          }}
                          disabled={baixando === v.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Download size={13} />
                          {baixando === v.id ? 'Baixando…' : 'Excel'}
                        </button>
                      </td>
                    </tr>
                    {expandida && (
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <td />
                        <td colSpan={5} className="py-3 pr-3">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {v.alteracoes.map((obra) => (
                              <div key={obra.sienge_id}>
                                <p className="text-[13px] font-semibold text-gray-900">{obra.nome}</p>
                                <ul className="mt-0.5 space-y-0.5">
                                  {linhasDaObra(obra).map((l) => (
                                    <LinhaAlteracao key={l.chave} linha={l} />
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                          {v.comunicado?.enviados?.length > 0 && (
                            <p className="mt-3 text-xs text-gray-500">Receberam: {v.comunicado.enviados.map((e) => e.nome).join(', ')}</p>
                          )}
                        </td>
                      </tr>
                    )}
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
