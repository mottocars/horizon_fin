import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Upload } from 'lucide-react';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import { importarPlanilhaProjecoesDre } from '../../../../api/dreProjecoes.api';
import { rotuloMesLongo } from './util';

function Numero({ rotulo, valor, cor }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${cor}`}>{Number(valor || 0).toLocaleString('pt-BR')}</p>
    </div>
  );
}

// Importação da planilha da Projeção da DRE — mesma mecânica da Planilha Orçamentária da DFC
// (ImportarPlanilhaOrcamentariaModal.jsx): escolhe o .xlsx, mostra a prévia (o que muda em cada centro e
// os erros por linha) e só grava ao confirmar. `recorte` ({ orcamentoId, etapa }): a planilha de uma
// etapa do assistente (ex.: Custos da POC) — grava só os valores daquele rascunho.
export default function ImportarPlanilhaModal({ open, onClose, empresaId, recorte = null, titulo = 'Importar planilha', onImportado }) {
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [concluir, setConcluir] = useState(true);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    if (!open) return;
    setArquivo(null);
    setPrevia(null);
    setErro('');
    setFeito(null);
  }, [open]);

  async function escolher(f) {
    if (!f) return;
    setArquivo(f);
    setPrevia(null);
    setFeito(null);
    setErro('');
    setCarregando(true);
    try {
      setPrevia(await importarPlanilhaProjecoesDre(empresaId, f, { recorte }));
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível ler a planilha.');
    } finally {
      setCarregando(false);
      if (input.current) input.current.value = '';
    }
  }

  async function aplicar() {
    setAplicando(true);
    setErro('');
    try {
      const r = await importarPlanilhaProjecoesDre(empresaId, arquivo, { aplicar: true, concluir: !recorte && concluir, recorte });
      if (r.aplicado) {
        setFeito(r);
        onImportado?.(r);
      } else {
        setPrevia(r);
        if (r.aviso) setErro(r.aviso);
      }
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível importar a planilha.');
    } finally {
      setAplicando(false);
    }
  }

  const temErros = previa?.erros?.length > 0;
  const comMudanca = previa ? previa.centros.filter((c) => c.muda) : [];

  return (
    <Modal open={open} onClose={aplicando ? () => {} : onClose} title={titulo} maxWidthClass="max-w-4xl">
      <div className="space-y-4">
        {feito ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-900">Planilha importada</p>
            <p className="max-w-md text-sm text-gray-500">
              {recorte
                ? `${feito.resumo.valores} valor(es) gravado(s) no rascunho.`
                : `${feito.resumo.centros} orçamento(s) gravado(s) no rascunho${feito.resumo.criados ? ` (${feito.resumo.criados} novo(s))` : ''}${
                    feito.concluidos ? `, ${feito.concluidos} concluído(s)` : ''
                  }. A versão só é gravada em "Salvar versão".`}
            </p>
            {feito.falhas?.length > 0 && (
              <ul className="mt-1 max-w-md text-left text-xs text-amber-700">
                {feito.falhas.map((f) => (
                  <li key={f.centro}>
                    <b>{f.centro}:</b> não concluído — {f.erro}
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" onClick={onClose} className="mt-2">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={carregando || aplicando}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 px-4 py-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <FileSpreadsheet size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{arquivo ? arquivo.name : 'Escolher a planilha (.xlsx)'}</span>
                <span className="block text-xs text-gray-500">
                  {carregando ? 'Lendo a planilha...' : 'Use o arquivo baixado no layout — só as células amarelas são lidas como alteração.'}
                </span>
              </span>
              <Upload size={18} className="shrink-0 text-gray-400" />
            </button>
            <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />

            {erro && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{erro}</div>}

            {previa && (
              <>
                {recorte ? (
                  <div className="grid grid-cols-3 gap-2">
                    <Numero rotulo="Incluídos" valor={previa.centros[0]?.incluidos} cor="text-emerald-600" />
                    <Numero rotulo="Alterados" valor={previa.centros[0]?.alterados} cor="text-primary-600" />
                    <Numero rotulo="Limpos" valor={previa.centros[0]?.limpos} cor="text-rose-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Numero rotulo="Centros com mudança" valor={previa.resumo.centros} cor="text-gray-900" />
                    <Numero rotulo="Orçamentos novos" valor={previa.resumo.criados} cor="text-emerald-600" />
                    <Numero rotulo="Valores alterados" valor={previa.resumo.valores} cor="text-primary-600" />
                    <Numero rotulo="Vendas alteradas" valor={previa.resumo.vendas} cor="text-primary-600" />
                  </div>
                )}

                {previa.avisos?.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {previa.avisos.map((a) => (
                      <li key={a} className="flex items-start gap-1.5">
                        <Info size={13} className="mt-0.5 shrink-0 text-gray-400" /> {a}
                      </li>
                    ))}
                  </ul>
                )}

                {temErros && (
                  <div className="rounded-lg border border-red-200 bg-red-50/60">
                    <p className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-700">
                      <AlertTriangle size={15} />
                      {previa.erros.length} erro(s) — corrija na planilha e escolha o arquivo de novo. Nada será gravado.
                    </p>
                    <ul className="max-h-44 overflow-y-auto border-t border-red-100 px-3 py-2 text-xs text-red-700">
                      {previa.erros.map((e, i) => (
                        <li key={i}>
                          <b>
                            {e.aba}
                            {e.linha ? `, linha ${e.linha}` : ''}:{' '}
                          </b>
                          {e.erro}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!temErros && !recorte && previa.centros.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Centro</th>
                            <th className="px-3 py-2 font-semibold">Ciclo</th>
                            <th className="px-3 py-2 text-right font-semibold">Valores</th>
                            <th className="px-3 py-2 text-right font-semibold">Vendas</th>
                            <th className="px-3 py-2 font-semibold">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previa.centros.map((c) => (
                            <tr key={c.centro_id} className={`border-t border-gray-100 ${c.muda ? '' : 'text-gray-400'}`}>
                              <td className="px-3 py-1.5 font-medium">{c.centro}</td>
                              <td className="px-3 py-1.5">
                                {rotuloMesLongo(c.ciclo_inicio)} a {rotuloMesLongo(c.ciclo_fim)}
                                <span className="block text-[11px] text-gray-400">
                                  realizado até {rotuloMesLongo(c.trava)}
                                  {c.ciclo_mudou && c.acao === 'ATUALIZA' ? ' · ciclo alterado' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {c.incluidos + c.alterados + c.limpos ? (
                                  <span title="incluídos / alterados / limpos">
                                    +{c.incluidos} · ~{c.alterados} · −{c.limpos}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {c.natureza === 'OBRA' ? `${c.com_venda} de ${c.unidades}${c.vendas_mudadas ? ` (${c.vendas_mudadas} alt.)` : ''}` : '—'}
                              </td>
                              <td className="px-3 py-1.5">
                                {!c.muda ? 'Sem mudança' : c.acao === 'CRIA' ? <span className="text-emerald-600">Cria rascunho</span> : 'Atualiza rascunho'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!temErros && !comMudanca.length && (
                  <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-sm text-gray-500">Nenhum valor mudou em relação ao orçamento atual.</p>
                )}
              </>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
              {!recorte && (
                <label className="mr-auto flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={concluir}
                    onChange={(e) => setConcluir(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600"
                  />
                  Concluir os orçamentos importados (calcula a POC e o fechamento)
                </label>
              )}
              <Button type="button" variant="secondary" onClick={onClose} disabled={aplicando}>
                Cancelar
              </Button>
              <Button type="button" onClick={aplicar} loading={aplicando} disabled={!previa || temErros || !comMudanca.length || aplicando}>
                <Upload size={16} />
                Importar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
