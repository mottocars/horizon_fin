import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, ReceiptText, Undo2 } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import CampoData from '../../components/CampoData';
import { useConfirm } from '../../confirm/ConfirmContext';
import { hojeISO } from '../../utils/datas';
import { baixarParcela, estornarBaixa, listarTitulos } from '../../api/contasPagarReceber.api';
import { TIPOS, data, lerValor, mensagemErro, moeda, numeroBr } from './util';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';
const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500';

// Aba Títulos: as parcelas com vencimento no período do filtro (uma linha por parcela). Clicar abre o
// título; o ícone da direita baixa a parcela (ou estorna a baixa).
export default function TitulosTab({ empresaId, inicio, fim, versao, onAbrir }) {
  const confirm = useConfirm();
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!empresaId || !inicio || !fim || inicio > fim) {
      setLinhas([]);
      return undefined;
    }
    let vivo = true;
    setLinhas(null);
    setErro('');
    listarTitulos(empresaId, inicio, fim)
      .then((l) => vivo && setLinhas(l))
      .catch((e) => {
        if (!vivo) return;
        setErro(mensagemErro(e, 'Não foi possível carregar os títulos.'));
        setLinhas([]);
      });
    return () => {
      vivo = false;
    };
  }, [empresaId, inicio, fim, versao, recarga]);

  const hoje = hojeISO();
  const totais = useMemo(
    () =>
      (linhas || []).reduce(
        (t, l) => {
          t[l.tipo] += l.valor;
          return t;
        },
        { PAGAR: 0, RECEBER: 0 }
      ),
    [linhas]
  );

  async function estornar(l) {
    const ok = await confirm({
      title: 'Estornar baixa',
      description: `Estornar a baixa da parcela ${l.numero}/${l.total_parcelas} de ${l.pessoa_nome}? Ela volta a ficar em aberto.`,
      confirmLabel: 'Estornar',
    });
    if (!ok) return;
    try {
      await estornarBaixa(empresaId, l.parcela_id);
      setRecarga((n) => n + 1);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível estornar a baixa.'));
    }
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <div className="overflow-clip rounded-xl border border-gray-200">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Títulos</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {linhas === null
              ? 'Carregando...'
              : `${linhas.length} parcela(s) com vencimento de ${data(inicio)} a ${data(fim)} · A pagar ${moeda(totais.PAGAR)} · A receber ${moeda(totais.RECEBER)}`}
          </p>
        </div>

        {erro && <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}

        {linhas === null ? (
          <div className="py-16 text-center text-sm text-gray-400">Carregando...</div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ReceiptText size={22} />
            </span>
            <p className="text-sm font-medium text-gray-800">Nenhum título com vencimento no período.</p>
            <p className="mt-1 max-w-md text-xs text-gray-500">Use o + no alto da tela para lançar um contas a pagar ou a receber.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className={CABECALHO}>
                  <th className="py-2.5 pl-4 pr-3 font-medium">Título</th>
                  <th className="py-2.5 pr-3 font-medium">Vencimento</th>
                  <th className="py-2.5 pr-3 font-medium">Tipo</th>
                  <th className="py-2.5 pr-3 font-medium">Fornecedor / Cliente</th>
                  <th className="py-2.5 pr-3 font-medium">Parcela</th>
                  <th className="py-2.5 pr-3 font-medium">Centro de custo</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2.5 pl-6 pr-3 font-medium">Situação</th>
                  <th className="w-12 py-2.5 pr-4" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const tipo = TIPOS[l.tipo];
                  const vencido = !l.data_baixa && l.vencimento < hoje;
                  return (
                    <tr key={l.parcela_id} onClick={() => onAbrir(l.titulo_id)} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pl-4 pr-3 font-medium tabular-nums text-gray-900">{String(l.titulo_id).padStart(5, '0')}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-gray-700">{data(l.vencimento)}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${tipo.cor}`}>{tipo.rotulo}</span>
                      </td>
                      <td className="max-w-[320px] py-1.5 pr-3">
                        <span className="block truncate font-semibold text-gray-900">{l.pessoa_nome || '—'}</span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-gray-700">
                        {l.numero}/{l.total_parcelas}
                      </td>
                      <td className="max-w-[240px] truncate py-1.5 pr-3 text-xs text-gray-700" title={l.centros.join(', ')}>
                        {l.centros[0] || '—'}
                        {l.centros.length > 1 && <span className="ml-1 text-gray-400">+{l.centros.length - 1}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-gray-900">{moeda(l.valor)}</td>
                      <td className="py-1.5 pl-6 pr-3 text-xs">
                        {l.data_baixa ? (
                          <span className="font-medium text-emerald-700" title={`Valor baixado: ${moeda(l.valor_baixa)}`}>
                            Baixado em {data(l.data_baixa)}
                          </span>
                        ) : vencido ? (
                          <span className="font-medium text-red-600">Vencido</span>
                        ) : (
                          <span className="text-gray-500">Em aberto</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {l.data_baixa ? (
                          <button
                            type="button"
                            onClick={() => estornar(l)}
                            title="Estornar baixa"
                            className="rounded-lg p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                          >
                            <Undo2 size={16} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBaixando(l)}
                            title={l.tipo === 'PAGAR' ? 'Baixar pagamento' : 'Baixar recebimento'}
                            className="rounded-lg p-1 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <CircleCheck size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {baixando && (
        <BaixaModal
          empresaId={empresaId}
          linha={baixando}
          onClose={() => setBaixando(null)}
          onBaixado={() => {
            setBaixando(null);
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function BaixaModal({ empresaId, linha, onClose, onBaixado }) {
  const [dataBaixa, setDataBaixa] = useState(hojeISO());
  const [valor, setValor] = useState(numeroBr(linha.valor));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function confirmar() {
    const v = lerValor(valor);
    if (!dataBaixa) return setErro('Informe a data da baixa.');
    if (!(v > 0)) return setErro('Informe o valor baixado.');
    setSalvando(true);
    setErro('');
    try {
      await baixarParcela(empresaId, linha.parcela_id, { data_baixa: dataBaixa, valor_baixa: Math.round(v * 100) / 100 });
      onBaixado();
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível registrar a baixa.'));
      setSalvando(false);
    }
  }

  return (
    <Modal open title={linha.tipo === 'PAGAR' ? 'Baixar pagamento' : 'Baixar recebimento'} onClose={onClose}>
      <p className="text-sm font-semibold text-gray-900">{linha.pessoa_nome}</p>
      <p className="mb-4 text-xs text-gray-500">
        Parcela {linha.numero}/{linha.total_parcelas} · vence {data(linha.vencimento)} · {moeda(linha.valor)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Data da baixa</span>
          <CampoData value={dataBaixa} onChange={setDataBaixa} className={INPUT} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Valor</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => lerValor(valor) > 0 && setValor(numeroBr(lerValor(valor)))}
            inputMode="decimal"
            className={`${INPUT} text-right tabular-nums`}
          />
        </label>
      </div>
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={confirmar} loading={salvando}>
          Confirmar baixa
        </Button>
      </div>
    </Modal>
  );
}
