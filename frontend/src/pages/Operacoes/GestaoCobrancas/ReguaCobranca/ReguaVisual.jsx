import { Send } from 'lucide-react';
import { numeroDia, rotuloDia } from './constantes';

// Réplica da "régua visual" do protótipo: uma linha do tempo horizontal.
// A janela (D0 a D1) É DINÂMICA:
// - D0 (borda esquerda): nos 4 clusters do score, se estica pra caber a
//   etapa mais extrema DESTA régua, com 5 dias de folga (D-20 configurado
//   → janela começa em D-25). Na régua de Inadimplência, não tem por que
//   voltar tão longe — nenhuma etapa dela existe antes da fronteira (o
//   próprio intervalo permitido já trava isso, ver limitesDias no backend)
//   — começa só 5 dias antes da fronteira, o suficiente pra dar contexto
//   de "onde a régua de inadimplência começa" sem sobrar espaço à toa.
// - D1 (borda direita): nos 4 clusters do score, a régua de Inadimplência
//   aparece só como referência — sempre 5 dias além da fronteira, um
//   pedaço fixo, não precisa ir até a última etapa dela. Só na própria aba
//   Inadimplência é que D1 reflete de verdade a última etapa registrada
//   (`maiorDiaInad`, vindo do resumo) + 10 dias — lá sim é o próprio
//   território, o desenho tem que caber a régua inteira.
const D0_PADRAO = -15;
const FOLGA = 5;
const FOLGA_APOS_ULTIMA_ETAPA_INAD = 10;
const FOLGA_INAD_NOS_OUTROS_CLUSTERS = 5;
const ANTES_DA_FRONTEIRA_NA_REGUA_INAD = 5;

const TICKS_BASE = [-10, -5, 0, 10, 45, 60, 90];

// Ícone genérico, sempre o mesmo — uma etapa pode ter até 3 canais
// marcados ao mesmo tempo (zap/e-mail/ligação), então o pino não tenta
// escolher "qual deles" representar: é só "aqui tem contato", o canal
// exato quem mostra é a coluna Comunicação da tabela.
function IconePino() {
  return <Send size={11} />;
}

export default function ReguaVisual({ cluster, limite, etapas, maiorDiaInad }) {
  const risco = cluster.tipo === 'inad';

  // Etapa recém-criada (`dias` ainda em branco, ver
  // reguaCobranca.service.js::criarEtapa) não entra nessa conta — nem na
  // janela D0/D1 nem nos pinos abaixo, senão um `dias` null vira 0 na
  // aritmética do JS e desloca a régua inteira sem sentido.
  const diasConfigurados = etapas.filter((e) => e.dias != null).map((e) => e.dias);
  const D0 = risco
    ? limite - ANTES_DA_FRONTEIRA_NA_REGUA_INAD
    : diasConfigurados.length
      ? Math.min(D0_PADRAO, Math.min(...diasConfigurados) - FOLGA)
      : D0_PADRAO;
  const D1 = risco ? (maiorDiaInad ?? limite) + FOLGA_APOS_ULTIMA_ETAPA_INAD : limite + FOLGA_INAD_NOS_OUTROS_CLUSTERS;
  const SPAN = D1 - D0;
  const pos = (d) => ((d - D0) / SPAN) * 100;

  // D0/D1 sempre entram como marcação, pra deixar claro onde a janela
  // (dinâmica) começa e termina.
  const ticks = [...new Set([D0, ...TICKS_BASE.filter((d) => d > D0 && d < D1), limite, D1])].sort((a, b) => a - b);
  // Só ganha pino quem está ativa E já tem `dias` configurado — dá pra
  // ligar a etapa sem preencher tudo ainda (o toggle não trava nisso), mas
  // sem `dias` não existe posição nenhuma pra desenhar o pino.
  const ativas = etapas.filter((e) => e.ativa && e.dias != null);

  return (
    <div className="select-none">
      <div className="relative h-[110px]">
        {/* Bandas: pré-vencimento (azul) e vencimento (amarelo) são as duas
            fatias da régua deste cluster; a régua de inadimplência
            (vermelho) aparece como referência à direita. Na aba
            Inadimplência em si, a parte antes da fronteira é só contexto
            (hachurada — não é esta régua) e a fatia vermelha passa a ser o
            próprio território. Os títulos ficam dentro de cada faixa,
            rente à borda superior (ver Banda abaixo). */}
        <div className="absolute inset-x-0 top-0 bottom-11 flex overflow-hidden rounded border border-gray-200">
          {risco ? (
            <>
              <Banda flex={limite - D0} tipo="off" texto="Outras réguas" />
              <Banda flex={D1 - limite} tipo="risk" texto="Inadimplência" />
            </>
          ) : (
            <>
              <Banda flex={0 - D0} tipo="pre" texto="Pré-vencimento" />
              <Banda flex={limite - 0} tipo="pos" texto="Vencimento" />
              <Banda flex={D1 - limite} tipo="risk" texto="Inadimplência" />
            </>
          )}
        </div>

        {/* Linha vertical marcando a fronteira D+limite. */}
        <div className="absolute top-0 bottom-11 w-0.5 bg-red-500" style={{ left: `${pos(limite)}%` }} />

        {/* Pinos: 1 por etapa ativa, no dia configurado (número acima do
            ícone) — sempre dentro da janela agora (ela se ajusta pra caber
            todas), sem precisar travar nas bordas. */}
        <div className="absolute inset-x-0 top-8 h-8">
          {ativas.map((e) => (
            <span
              key={e.id}
              className="absolute flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pos(e.dias)}%` }}
              title={`${e.nome} · ${rotuloDia(e.dias)}`}
            >
              <b className={`mb-0.5 font-mono text-[10px] font-normal ${risco ? 'text-red-500' : 'text-gray-500'}`}>
                {numeroDia(e.dias)}
              </b>
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-white ${
                  risco ? 'border-red-300 text-red-600' : 'border-gray-300 text-gray-700'
                }`}
              >
                <IconePino />
              </span>
            </span>
          ))}
        </div>

        {/* Marcações de dia (ticks), embaixo. */}
        <div className="absolute inset-x-0 bottom-0 h-[22px]">
          {ticks.map((d) => (
            <span
              key={d}
              className="absolute -translate-x-1/2 text-center"
              style={{ left: `${pos(d)}%` }}
            >
              <i className={`mx-auto block h-1.5 w-px ${d === limite ? 'h-[11px] bg-red-500' : 'bg-gray-300'}`} />
              <b className={`mt-0.5 block font-mono text-[10.5px] font-normal ${d === limite ? 'text-red-600' : 'text-gray-400'}`}>
                {numeroDia(d)}
              </b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Banda({ flex, tipo, texto }) {
  const estilos = {
    pre: 'bg-primary-50',
    pos: 'bg-amber-50',
    risk: 'bg-red-50',
    off: 'bg-[repeating-linear-gradient(135deg,#F2F4F6,#F2F4F6_6px,#F7F9FA_6px,#F7F9FA_12px)]',
  };
  const textoCor = {
    pre: 'text-primary-600',
    pos: 'text-amber-600',
    risk: 'text-red-600',
    off: 'text-gray-400',
  };
  return (
    <div className={`relative overflow-hidden border-r border-gray-200 last:border-r-0 ${estilos[tipo]}`} style={{ flex }}>
      {/* Rente à borda superior da faixa, de propósito. */}
      <span className={`absolute left-2 top-0.5 truncate font-mono text-[10px] uppercase tracking-wider ${textoCor[tipo]}`}>
        {texto}
      </span>
    </div>
  );
}
