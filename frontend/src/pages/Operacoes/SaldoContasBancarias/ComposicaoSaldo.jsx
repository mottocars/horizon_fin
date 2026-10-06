import { createPortal } from 'react-dom';
import { History, Landmark, ReceiptText, Zap } from 'lucide-react';
import { formatarSaldo } from './constantes';

// Dica (tooltip) da célula de saldo automático: de onde veio o valor. A composição é gravada
// pela abertura do período (vanpix-sync.service.js) na coluna saldos_contas_bancarias.composicao:
//   extrato  { fonte: VANPIX|ITAU, apelido|conexao, conta, dataFechamento|posicao, valor }
//   herdado  { de, origem, classificacao, valor }
//   cobranca { apelido, de, ate, valor, titulos: [{ pagador, documento, valorPago, dataCredito, ... }] }
// Saldos gravados antes desta coluna trazem só { fonte }.

const LARGURA = 380;
const MAX_TITULOS = 8;

const dataBR = (iso, comAno = true) => {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
};
const horaBR = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : '';
// número de conta sem quebrar no hífen (hífen não separável)
const conta = (t) => String(t || '').replace(/-/g, '‑');
const CANAL = { '01': 'agência', '02': 'terminal', '03': 'internet', '04': 'compensação', '05': 'lotérica', '06': 'internet banking', '07': 'correspondente' };

function Parcela({ Icone, cor, titulo, detalhe, valor, sinal }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cor}`}>
        <Icone size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gray-800">{titulo}</p>
        <p className="text-[11px] leading-snug text-gray-500">{detalhe}</p>
      </div>
      <span className={`shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums ${valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {sinal}
        {formatarSaldo(valor)}
      </span>
    </div>
  );
}

function Conteudo({ composicao, valor, data, rotulo }) {
  const { extrato, herdado, cobranca } = composicao;
  const legado = !extrato && !herdado && !cobranca;
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Composição do saldo · {dataBR(data)}</p>
          <p className="truncate text-[12px] font-medium text-gray-700">{rotulo}</p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        {legado && (
          <Parcela
            Icone={composicao.fonte === 'ITAU' ? Zap : Landmark}
            cor="bg-emerald-50 text-emerald-600"
            titulo={composicao.fonte === 'ITAU' ? 'API Itaú' : composicao.fonte === 'VANPIX' ? 'VanPix Extrato' : 'Saldo automático'}
            detalhe="Lançado antes do detalhamento. A composição completa aparece a partir das próximas aberturas de período."
            valor={valor}
          />
        )}

        {extrato?.fonte === 'VANPIX' && (
          <Parcela
            Icone={Landmark}
            cor="bg-emerald-50 text-emerald-600"
            titulo={`VanPix Extrato · convênio ${extrato.apelido}`}
            detalhe={`Saldo final de ${dataBR(extrato.dataFechamento)} · conta ${conta(extrato.conta)}`}
            valor={extrato.valor}
          />
        )}
        {extrato?.fonte === 'ITAU' && (
          <Parcela
            Icone={Zap}
            cor="bg-orange-50 text-orange-600"
            titulo={`API Itaú · ${extrato.conexao}`}
            detalhe={`Saldo em conta${extrato.posicao ? ` em ${horaBR(extrato.posicao)}` : ''} · ${conta(extrato.conta)}`}
            valor={extrato.valor}
          />
        )}
        {herdado && (
          <Parcela
            Icone={History}
            cor="bg-gray-100 text-gray-500"
            titulo="Saldo anterior repetido"
            detalhe={`Saldo de ${dataBR(herdado.de)} — classificação ${herdado.classificacao || ''} com "Buscar saldo anterior"`}
            valor={herdado.valor}
          />
        )}

        {cobranca && (
          <div className="space-y-2">
            <Parcela
              Icone={ReceiptText}
              cor="bg-primary-50 text-primary-600"
              titulo={`Cobrança · convênio ${cobranca.apelido}`}
              detalhe={`${cobranca.titulos.length} boleto${cobranca.titulos.length === 1 ? '' : 's'} com crédito ${
                cobranca.de === cobranca.ate ? `em ${dataBR(cobranca.de)}` : `de ${dataBR(cobranca.de, false)} a ${dataBR(cobranca.ate)}`
              }`}
              valor={cobranca.valor}
              sinal="+ "
            />
            <ul className="ml-9 divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50/60">
              {cobranca.titulos.slice(0, MAX_TITULOS).map((t) => (
                <li key={`${t.nossoNumero}-${t.dataCredito}`} className="flex items-center gap-2 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-gray-700">{t.pagador || 'Pagador não informado'}</p>
                    <p className="text-[10px] text-gray-400">
                      Doc. {t.documento || '—'} · crédito {dataBR(t.dataCredito, false)}
                      {CANAL[t.canal] ? ` · ${CANAL[t.canal]}` : ''}
                      {t.juros > 0 ? ` · juros ${formatarSaldo(t.juros)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-700">{formatarSaldo(t.valorPago)}</span>
                </li>
              ))}
              {cobranca.titulos.length > MAX_TITULOS && (
                <li className="px-2.5 py-1.5 text-[10px] text-gray-400">+ {cobranca.titulos.length - MAX_TITULOS} boleto(s)</li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-b-xl border-t border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">= Saldo do dia</span>
        <span className={`text-sm font-bold tabular-nums ${valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatarSaldo(valor)}</span>
      </div>
    </>
  );
}

// `ancora`: getBoundingClientRect() da célula. Abre abaixo dela; se não couber, acima.
export default function ComposicaoSaldo({ ancora, composicao, valor, data, rotulo }) {
  if (!ancora || !composicao) return null;
  const alturaEstimada = 150 + (composicao.cobranca ? 60 + Math.min(composicao.cobranca.titulos.length, MAX_TITULOS + 1) * 34 : 0);
  const cabeEmbaixo = window.innerHeight - ancora.bottom > alturaEstimada + 12;
  const left = Math.max(12, Math.min(ancora.right - LARGURA, window.innerWidth - LARGURA - 12));
  const estilo = cabeEmbaixo
    ? { left, top: ancora.bottom + 6, width: LARGURA }
    : { left, bottom: window.innerHeight - ancora.top + 6, width: LARGURA };
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] rounded-xl border border-gray-200 bg-white shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
      style={estilo}
    >
      <Conteudo composicao={composicao} valor={valor} data={data} rotulo={rotulo} />
    </div>,
    document.body
  );
}
