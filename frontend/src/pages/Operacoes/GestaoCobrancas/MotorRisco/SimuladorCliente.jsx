import { useState } from 'react';
import { Calculator } from 'lucide-react';
import Card from '../../../../components/Card';
import { calcularNotas, calcularScore, classificarCluster, clamp, fmt } from './calculo';
import { estadoCampoNumero } from './estadoCampo';

const CAMPOS_TESTE = [
  { id: 'qtd', label: 'Parcelas já vencidas' },
  { id: 'pag', label: 'Pagas dentro da tolerância' },
  { id: 'atraso_medio', label: 'Atraso médio (dias)' },
  { id: 'maior_atraso', label: 'Maior atraso (dias)' },
  { id: 'reincidencia', label: 'Reincidências' },
  { id: 'relacionamento', label: 'Relacionamento (meses)' },
];

const TAG_ESTILO = {
  novo: 'bg-primary-50 text-primary-700',
  bom: 'bg-emerald-50 text-emerald-600',
  duvidoso: 'bg-amber-50 text-amber-600',
  mau: 'bg-red-50 text-red-600',
};

// Painel lateral fixo: simula um cliente com números brutos de teste contra
// a escala/pesos definidos no formulário ao lado, em tempo real — não grava
// nada, é só uma calculadora pra quem está calibrando ver o efeito de cada
// ajuste antes de gravar uma versão nova.
export default function SimuladorCliente({ indicadores, minimoParcelas, corteBom, corteDuvidoso, diasVencidosRegua }) {
  const [teste, setTeste] = useState(() => Object.fromEntries(CAMPOS_TESTE.map((c) => [c.id, ''])));

  function set(id, valor) {
    setTeste((prev) => ({ ...prev, [id]: valor === '' ? '' : Number(valor) }));
  }

  // Só dá pra simular depois que a escala dos 5 indicadores, no formulário
  // ao lado, estiver preenchida — sem ela não tem como converter os
  // números brutos em nota.
  const escalaPronta = indicadores.every((ind) => ind.nota_0 !== '' && ind.nota_100 !== '' && ind.peso !== '');

  const qtd = Number(teste.qtd) || 0;
  const pag = Number(teste.pag) || 0;
  const pct = qtd > 0 ? clamp((pag / qtd) * 100, 0, 100) : 0;

  const brutos = {
    pct_em_dia: pct,
    atraso_medio: Number(teste.atraso_medio) || 0,
    maior_atraso: Number(teste.maior_atraso) || 0,
    reincidencia: Number(teste.reincidencia) || 0,
    relacionamento: Number(teste.relacionamento) || 0,
  };

  const notas = escalaPronta ? calcularNotas(indicadores, brutos) : [];
  const score = escalaPronta ? calcularScore(indicadores, notas) : 0;
  // Regra dura da régua de cobrança: no simulador, "maior atraso" faz o
  // papel da parcela mais vencida em aberto do cliente de teste.
  const regraDuraAtiva = Boolean(diasVencidosRegua) && brutos.maior_atraso > diasVencidosRegua;
  const classificavel = escalaPronta && qtd > 0 && qtd >= minimoParcelas && !regraDuraAtiva;
  const { classe, tom } = classificarCluster(score, qtd, minimoParcelas, corteBom, corteDuvidoso, regraDuraAtiva);
  const somaPesos = indicadores.reduce((acc, ind) => acc + (Number(ind.peso) || 0), 0);

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <Calculator size={15} className="text-primary-600" />
        <h3 className="text-sm font-semibold text-gray-900">Testar com um cliente</h3>
      </div>
      <p className="mb-1 mt-2 text-xs text-gray-500">
        Informe os números brutos, como saem do razão de parcelas. O sistema faz as contas.
      </p>

      <div>
        {CAMPOS_TESTE.map((campo, i) => (
          <div
            key={campo.id}
            className={`grid grid-cols-[1fr_84px] items-center gap-2 py-2 text-sm ${
              i === 0 ? 'border-t-0' : 'border-t border-gray-100'
            }`}
          >
            <span className="text-gray-600">{campo.label}</span>
            <input
              type="number"
              value={teste[campo.id]}
              onChange={(e) => set(campo.id, e.target.value)}
              className={`w-full rounded-lg border px-2 py-1.5 text-right font-mono text-xs tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampoNumero(teste[campo.id])}`}
            />
          </div>
        ))}

        <div className="mt-3 rounded-lg bg-primary-50 px-3 py-2 font-mono text-xs text-primary-800">
          {qtd > 0 ? (
            <>
              {pag} de {qtd} pagas em dia = <strong className="font-semibold">{fmt(pct)}%</strong>
              {pag > qtd ? ' · valor limitado a 100%' : ''}
            </>
          ) : (
            'Informe ao menos 1 parcela vencida.'
          )}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-4 text-center">
          <b className="block font-mono text-4xl font-medium leading-none tracking-tight text-gray-900">
            {classificavel ? fmt(score) : '—'}
          </b>
          <span className="text-xs text-gray-500">score ponderado</span>
          <div>
            {/* "Novo cliente" e a regra dura de dias vencidos não dependem da
                escala; as demais classificações, sim — sem escala
                preenchida não tem tag ainda. */}
            {qtd > 0 && (regraDuraAtiva || qtd < minimoParcelas || escalaPronta) && (
              <span className={`mt-2 inline-block rounded-md px-2.5 py-1 text-xs font-medium ${TAG_ESTILO[tom]}`}>
                {classe}
              </span>
            )}
          </div>
        </div>

        <p className="mb-1.5 mt-5 font-mono text-[10px] uppercase tracking-wide text-gray-400">
          Como o score foi formado
        </p>
        <p className="mb-2 text-xs text-gray-500">
          O sistema converte o valor bruto em nota, multiplica pelo peso e soma os pontos.
        </p>

        {!escalaPronta ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Preencha a escala dos 5 indicadores, no formulário ao lado, para simular.
          </p>
        ) : qtd <= 0 ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Informe ao menos 1 parcela vencida para simular.
          </p>
        ) : regraDuraAtiva ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Maior atraso de {brutos.maior_atraso} dias ultrapassa o limite de {diasVencidosRegua} dias da régua de
            cobrança. A regra dura classifica como Mau pagador direto, sem calcular score.
          </p>
        ) : !classificavel ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Só {qtd} parcela{qtd === 1 ? '' : 's'} vencida{qtd === 1 ? '' : 's'} e o mínimo é {minimoParcelas}. A
            regra dura classifica sem calcular score.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="font-mono text-[9.5px] uppercase tracking-wide text-gray-400">
                <th className="pb-1.5 text-left font-medium">Indicador</th>
                <th className="pb-1.5 text-right font-medium">Valor</th>
                <th className="pb-1.5 text-right font-medium">Nota</th>
                <th className="pb-1.5 text-right font-medium">Peso</th>
                <th className="pb-1.5 pl-1 text-right font-medium">Pontos</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {indicadores.map((ind, i) => (
                <tr key={ind.id} className="border-t border-gray-100">
                  <td className="py-1.5 text-left font-sans text-gray-500">{ind.curto}</td>
                  <td className="py-1.5 text-right">
                    {fmt(brutos[ind.id])}
                    {ind.unidade}
                  </td>
                  <td className="py-1.5 text-right">{notas[i].toFixed(0)}</td>
                  <td className="py-1.5 text-right">{ind.peso}%</td>
                  <td className="py-1.5 pl-1 text-right font-medium text-primary-600">
                    {fmt((notas[i] * ind.peso) / 100)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 font-semibold text-gray-900">
                <td className="pt-2 text-left font-sans">Score</td>
                <td className="pt-2"></td>
                <td className="pt-2"></td>
                <td className="pt-2 text-right">{somaPesos}%</td>
                <td className="pt-2 pl-1 text-right text-primary-600">{fmt(score)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
