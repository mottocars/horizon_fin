import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { importarPlanilhaOrcamentaria } from '../../../api/dfcPlanilhaOrcamentaria.api';

// Importação da Planilha Orçamentária (Nova versão › Planilha Orçamentária): escolhe o .xlsx baixado em
// "Layout do orçamento", mostra a prévia (o que muda, o que fica igual e os erros por linha) e só grava
// ao confirmar. Os valores entram como HORIZON - INFORMADO (como se digitados) e valem no Orçamento depois
// de "Salvar versão".

const moeda = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

function Numero({ rotulo, valor, cor }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className={`text-lg font-semibold ${cor}`}>{valor.toLocaleString('pt-BR')}</p>
    </div>
  );
}

export default function ImportarPlanilhaOrcamentariaModal({ open, onClose, empresaId, onImportado }) {
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
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
      setPrevia(await importarPlanilhaOrcamentaria(empresaId, f));
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
      const r = await importarPlanilhaOrcamentaria(empresaId, arquivo, true);
      if (r.aplicado) {
        setFeito(r.resumo);
        onImportado?.(r.resumo);
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

  const mudancas = previa ? previa.resumo.incluidos + previa.resumo.alterados + previa.resumo.limpos : 0;
  const temErros = previa?.erros?.length > 0;

  return (
    <Modal open={open} onClose={aplicando ? () => {} : onClose} title="Planilha Orçamentária" maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        {feito ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-900">Planilha importada</p>
            <p className="max-w-md text-sm text-gray-500">
              {feito.incluidos} incluído(s), {feito.alterados} alterado(s) e {feito.limpos} limpo(s) em HORIZON - INFORMADO. Clique em "Nova
              versão" para ver na grade e em "Salvar versão" para valer no Orçamento.
            </p>
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
                  {carregando ? 'Lendo a planilha...' : 'Use o arquivo baixado em "Layout do orçamento" — só a coluna Valor é lida como alteração.'}
                </span>
              </span>
              <Upload size={18} className="shrink-0 text-gray-400" />
            </button>
            <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />

            {erro && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{erro}</div>}

            {previa && (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Numero rotulo="Linhas lidas" valor={previa.resumo.linhas} cor="text-gray-900" />
                  <Numero rotulo="Sem mudança" valor={previa.resumo.sem_mudanca} cor="text-gray-400" />
                  <Numero rotulo="Incluídos" valor={previa.resumo.incluidos} cor="text-emerald-600" />
                  <Numero rotulo="Alterados" valor={previa.resumo.alterados} cor="text-primary-600" />
                  <Numero rotulo="Limpos" valor={previa.resumo.limpos} cor="text-rose-600" />
                </div>

                {temErros && (
                  <div className="rounded-lg border border-red-200 bg-red-50/60">
                    <p className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-700">
                      <AlertTriangle size={15} />
                      {previa.erros.length} linha(s) com erro — corrija na planilha e escolha o arquivo de novo. Nada será gravado.
                    </p>
                    <ul className="max-h-40 overflow-y-auto border-t border-red-100 px-3 py-2 text-xs text-red-700">
                      {previa.erros.map((e, i) => (
                        <li key={i}>
                          {e.linha ? <b>Linha {e.linha}: </b> : null}
                          {e.erro}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!temErros && mudancas > 0 && (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Centro</th>
                            <th className="px-3 py-2 font-semibold">Natureza</th>
                            <th className="px-3 py-2 font-semibold">Mês</th>
                            <th className="px-3 py-2 text-right font-semibold">De</th>
                            <th className="px-3 py-2 text-right font-semibold">Para</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previa.mudancas.map((m) => (
                            <tr key={`${m.centro_id}|${m.sienge_id}|${m.mes}`} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 text-gray-700">{m.centro}</td>
                              <td className="px-3 py-1.5 text-gray-700">
                                <span className="text-gray-400">{m.sienge_id}</span> {m.natureza}
                              </td>
                              <td className="px-3 py-1.5 text-gray-600">{rotuloMes(m.mes)}</td>
                              <td className="px-3 py-1.5 text-right font-mono text-gray-500">{moeda(m.anterior)}</td>
                              <td className={`px-3 py-1.5 text-right font-mono font-semibold ${m.valor === null ? 'text-rose-600' : 'text-gray-900'}`}>
                                {m.valor === null ? 'limpo' : moeda(m.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {mudancas > previa.mudancas.length && (
                      <p className="border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-400">
                        Mostrando {previa.mudancas.length} de {mudancas} mudanças.
                      </p>
                    )}
                  </div>
                )}

                {!temErros && mudancas === 0 && (
                  <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-sm text-gray-500">
                    Nenhum valor mudou em relação ao que já está no Orçamento.
                  </p>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <Button type="button" variant="secondary" onClick={onClose} disabled={aplicando}>
                Cancelar
              </Button>
              <Button type="button" onClick={aplicar} loading={aplicando} disabled={!previa || temErros || mudancas === 0 || aplicando}>
                <Upload size={16} />
                Importar {mudancas > 0 ? `${mudancas} mudança(s)` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
