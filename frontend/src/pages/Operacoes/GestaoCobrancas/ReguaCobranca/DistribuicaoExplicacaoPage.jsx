import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  Layers,
  Pause,
  Play,
  Scale,
  Shuffle,
  Timer,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import Card from '../../../../components/Card';
import { getConfigDistribuicaoReguaCobranca } from '../../../../api/reguaCobranca.api';
import { EQUIPE, FAIXAS, NOME_FAIXA, montarExemplo } from './distribuicaoSimulacao';

// Página "Como funciona a distribuição" — aberta pelo "?" ao lado da
// Distribuição da Rotina nas Configurações Globais da Régua de Cobrança.
// Os exemplos são calculados na hora pela mesma regra do backend (ver
// distribuicaoSimulacao.js), então os números sempre batem com a regra.

const COR_PESSOA = {
  Ana: { ponto: 'bg-violet-500', borda: 'border-t-violet-500', barra: 'bg-violet-500' },
  Bruno: { ponto: 'bg-sky-500', borda: 'border-t-sky-500', barra: 'bg-sky-500' },
  Carla: { ponto: 'bg-rose-500', borda: 'border-t-rose-500', barra: 'bg-rose-500' },
  Diego: { ponto: 'bg-lime-600', borda: 'border-t-lime-600', barra: 'bg-lime-600' },
  Elisa: { ponto: 'bg-orange-500', borda: 'border-t-orange-500', barra: 'bg-orange-500' },
};
const ESTILO_FAIXA = {
  inad: 'bg-red-50 text-red-700 ring-red-100',
  d15: 'bg-amber-50 text-amber-700 ring-amber-100',
  d3: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
};
const BARRA_FAIXA = { inad: 'bg-red-400', d15: 'bg-amber-400', d3: 'bg-emerald-400' };
const MOTIVO = {
  continuidade: { rotulo: 'Continuidade', estilo: 'border-primary-100 bg-primary-50 text-primary-700' },
  novo: { rotulo: 'Novo', estilo: 'border-gray-200 bg-white text-gray-500' },
  liberado: { rotulo: 'Liberado da carteira', estilo: 'border-red-100 bg-red-50 text-red-700' },
  cobertura: { rotulo: 'Cobertura de férias', estilo: 'border-amber-100 bg-amber-50 text-amber-700' },
};

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function Pessoa({ nome }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-gray-800">
      <span className={`h-2 w-2 rounded-full ${COR_PESSOA[nome].ponto}`} />
      {nome}
    </span>
  );
}

function Secao({ rotulo, titulo, children }) {
  return (
    <Card>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">{rotulo}</span>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">{titulo}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-600">{children}</div>
    </Card>
  );
}

function TabelaDistribuicao({ resultado, mostrarMotivo = true }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Faixa</th>
            <th className="px-3 py-2 text-right font-medium">Em aberto</th>
            <th className="px-3 py-2 font-medium">Atendente</th>
            {mostrarMotivo && <th className="px-3 py-2 font-medium">Por quê</th>}
          </tr>
        </thead>
        <tbody>
          {resultado.map((r) => (
            <tr key={r.nome} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-1.5 text-gray-800">{r.nome}</td>
              <td className="px-3 py-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ESTILO_FAIXA[r.faixa]}`}>{NOME_FAIXA[r.faixa]}</span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-700">{brl(r.valor)}</td>
              <td className="px-3 py-1.5">
                <Pessoa nome={r.atendente} />
              </td>
              {mostrarMotivo && (
                <td className="px-3 py-1.5">
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${MOTIVO[r.motivo].estilo}`}>
                    {MOTIVO[r.motivo].rotulo}
                    {r.dono && r.motivo !== 'novo' ? ` · era de ${r.dono}` : ''}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumoAtendentes({ hoje, medias }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Object.entries(hoje).map(([p, h]) => (
        <div key={p} className={`rounded-lg border border-gray-200 border-t-[3px] bg-white p-3 ${COR_PESSOA[p].borda}`}>
          <Pessoa nome={p} />
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-gray-500">Clientes hoje</dt>
              <dd className="font-mono font-semibold text-gray-800">{h.qtd}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Valor hoje</dt>
              <dd className="font-mono font-semibold text-gray-800">{brl(h.valor)}</dd>
            </div>
            {medias?.[p] !== undefined && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Média/dia no mês</dt>
                <dd className="font-mono font-semibold text-gray-800">{brl(medias[p])}</dd>
              </div>
            )}
          </dl>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            {FAIXAS.map((f) => (
              <span key={f} className={BARRA_FAIXA[f]} style={{ width: `${((h.faixa[f] || 0) / h.qtd) * 100}%` }} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            {h.faixa.inad || 0} inadimpl. · {h.faixa.d15 || 0} atraso · {h.faixa.d3 || 0} recém-venc.
          </p>
        </div>
      ))}
    </div>
  );
}

function Comparacao({ titulo, dados, maximo }) {
  const valores = Object.values(dados);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-800">{titulo}</h4>
      <div className="mt-3 space-y-2">
        {EQUIPE.map((p) => (
          <div key={p} className="grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-2 text-xs">
            <span className="text-gray-600">{p}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-gray-100">
              <span className={`block h-full rounded-full ${COR_PESSOA[p].barra}`} style={{ width: `${(dados[p] / maximo) * 100}%` }} />
            </span>
            <span className="text-right font-mono font-semibold text-gray-800">{brl(dados[p])}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Diferença entre o maior e o menor:{' '}
        <b className="font-mono text-gray-800">{brl(Math.max(...valores) - Math.min(...valores))}</b>
      </p>
    </div>
  );
}

function Passo({ numero, titulo, children }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-600">{numero}</span>
      <div>
        <h3 className="font-semibold text-gray-800">{titulo}</h3>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}

function Opcao({ icone: Icone, titulo, children, destaque }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? 'border-primary-100 bg-primary-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 font-semibold text-gray-800">
        <Icone size={15} className="text-primary-600" />
        {titulo}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">{children}</p>
    </div>
  );
}

export default function DistribuicaoExplicacaoPage() {
  const [searchParams] = useSearchParams();
  const empresaId = searchParams.get('empresa_id') || '';
  const [diasLiberacao, setDiasLiberacao] = useState(10);
  const [cenario, setCenario] = useState('normal');

  useEffect(() => {
    if (!empresaId) return;
    getConfigDistribuicaoReguaCobranca(empresaId)
      .then((cfg) => setDiasLiberacao(cfg.dias_liberacao))
      .catch(() => {});
  }, [empresaId]);

  const ex = useMemo(() => montarExemplo(), []);
  const regra = Object.fromEntries(EQUIPE.map((p) => [p, ex.dia1.hoje[p].valor]));
  const maxComparacao = Math.max(...Object.values(ex.rodizio), ...Object.values(regra));
  const voltar = `/operacoes/gestao-de-cobrancas?aba=mascaras&regua_cluster=config-globais${empresaId ? `&empresa_id=${empresaId}` : ''}`;

  // Frases do exemplo montadas a partir do resultado calculado.
  const inadNovosDia2 = ex.dia2.resultado.filter((r) => r.faixa === 'inad' && r.motivo === 'novo');
  const maiorInad = inadNovosDia2[0];
  const menorInad = inadNovosDia2[inadNovosDia2.length - 1];
  const continuidadesDia2 = ex.dia2.resultado.filter((r) => r.motivo === 'continuidade').length;
  const novosDia2 = ex.dia2.resultado.length - continuidadesDia2;
  const liberadosSai = ex.cenarios.sai.resultado.filter((r) => r.motivo === 'liberado').map((r) => r.nome);
  const coberturaFerias = ex.cenarios.ferias.resultado.filter((r) => r.motivo === 'cobertura').map((r) => r.nome);
  const novosDiego = ex.cenarios.entra.resultado.filter((r) => r.atendente === 'Diego').length;
  const novosTotalDia3 = ex.cenarios.entra.resultado.filter((r) => r.motivo === 'novo').length;
  const listar = (nomes) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);

  const CENARIOS = [
    {
      id: 'normal',
      rotulo: 'Dia normal',
      texto: (
        <p>
          Equipe completa. Quem já tem dono continua com ele; os clientes novos vão primeiro para quem tem menos clientes em cada
          faixa.
        </p>
      ),
    },
    {
      id: 'entra',
      rotulo: 'Entra um atendente',
      icone: UserPlus,
      texto: (
        <>
          <p>
            Diego é adicionado em <b className="font-medium text-gray-800">Adicionar atendente</b>. Ele começa sem carteira. Como está
            com zero clientes, é o primeiro da fila em cada faixa e fica com {novosDiego} dos {novosTotalDia3} clientes novos do dia.
            Ninguém perde os clientes que já atende, e em poucos dias Diego chega ao volume dos outros.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Opcao icone={Timer} titulo="Entrada gradual (padrão)" destaque>
              Diego recebe só clientes novos, com prioridade, até igualar a carga dos outros. A continuidade dos demais não é quebrada.
            </Opcao>
            <Opcao icone={Shuffle} titulo='"Repassar parte da carteira"'>
              Opção do <b>Redistribuir hoje</b>. Clientes sem contato registrado nos últimos 7 dias passam de quem tem a maior carteira
              para quem tem a menor, até a diferença ser de no máximo 1.
            </Opcao>
          </div>
        </>
      ),
    },
    {
      id: 'sai',
      rotulo: 'Sai um atendente',
      icone: UserMinus,
      texto: (
        <p>
          Bruno é retirado em <b className="font-medium text-gray-800">Tirar da distribuição</b>. A carteira dele é liberada, e os
          clientes dele que aparecem hoje ({listar(liberadosSai)}) entram na distribuição como novos e passam para a carteira de quem
          os recebeu. O histórico dos dias anteriores continua com o nome de Bruno.
        </p>
      ),
    },
    {
      id: 'substitui',
      rotulo: 'Substituição',
      icone: ArrowLeftRight,
      texto: (
        <>
          <p>
            Elisa assume a vaga de Carla pelo botão <b className="font-medium text-gray-800">Substituir</b>. A carteira inteira de Carla
            passa para Elisa sem redistribuir nada, e Elisa herda também o placar do mês. Se começasse do zero, ela teria prioridade
            nos clientes novos mesmo já tendo uma carteira cheia. A vaga continua, só muda a pessoa.
          </p>
          <p className="text-xs text-gray-500">Compare com "Dia normal": o resultado é idêntico, com Elisa no lugar de Carla.</p>
        </>
      ),
    },
    {
      id: 'ferias',
      rotulo: 'Férias',
      icone: Pause,
      texto: (
        <>
          <p>
            Ana é <b className="font-medium text-gray-800">pausada</b> com data de volta, sem sair da lista. Os clientes dela que aparecem
            hoje ({listar(coberturaFerias)}) são atendidos por Bruno e Carla como <b className="font-medium text-gray-800">cobertura</b>,
            mas continuam na carteira dela e voltam para ela no retorno. Os clientes novos do período ficam com quem os recebeu.
          </p>
          <p className="text-xs text-gray-500">
            Como a média de valor é por dia trabalhado, na volta Ana não recebe todos os clientes novos de uma vez para "compensar"
            os dias fora.
          </p>
        </>
      ),
    },
  ];
  const atual = CENARIOS.find((c) => c.id === cenario);
  const resultadoAtual = ex.cenarios[cenario];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <Link to={voltar} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft size={14} />
          Voltar para as Configurações Globais da Régua
        </Link>
        <span className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-primary-600">
          Régua de Cobrança · Distribuição automática
        </span>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Como funciona a distribuição da Rotina</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
          Na Distribuição automática, a régua não tem mais um responsável por etapa. Todo dia, no horário agendado no Monitor de
          Integrações, os clientes que entraram na Rotina são repartidos entre os atendentes escolhidos nas Configurações Globais. O
          objetivo é que cada um receba a mesma carga, medida de três formas:
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { icone: Users, titulo: 'Quantidade', sub: 'igual todo dia', texto: 'Cada um recebe o mesmo número de clientes, com diferença de no máximo 1.' },
            { icone: Layers, titulo: 'Tempo de atraso', sub: 'igual por faixa', texto: 'Todos recebem a mesma mistura de recém-vencidos, atrasados e inadimplentes.' },
            { icone: Scale, titulo: 'Valor', sub: 'igual ao longo do mês', texto: 'Quem recebeu valores maiores fica no fim da fila dos próximos clientes.' },
          ].map((p) => (
            <div key={p.titulo} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2">
                <p.icone size={16} className="text-primary-600" />
                <span className="text-sm font-semibold text-gray-800">{p.titulo}</span>
                <span className="text-xs text-gray-400">{p.sub}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{p.texto}</p>
            </div>
          ))}
        </div>
      </Card>

      <Secao rotulo="A regra" titulo="O que acontece na distribuição de cada dia">
        <ol className="space-y-3">
          <Passo numero={1} titulo="Continuidade primeiro">
            Cliente que já tem atendente continua com ele. A unidade é o cliente: todas as parcelas dele vão para a mesma pessoa,
            mesmo em títulos ou centros de custo diferentes. Assim, duas pessoas não cobram o mesmo cliente no mesmo dia.
          </Passo>
          <Passo numero={2} titulo="Os demais são separados por faixa de atraso">
            A faixa é a etapa da régua em que o cliente está, contada pela parcela mais grave dele no dia. A distribuição começa pela
            faixa mais grave: Inadimplência, depois as etapas mais avançadas.
          </Passo>
          <Passo numero={3} titulo="Primeiro se define quantos clientes cada um recebe">
            As vagas da faixa vão para quem tem menos clientes nela hoje e, em caso de empate, menos clientes no total hoje. É isso
            que mantém a quantidade igual.
          </Passo>
          <Passo numero={4} titulo="Depois, quais clientes">
            Os clientes da faixa vão do maior para o menor valor em aberto. Cada um vai para quem ainda tem vaga e está com a menor
            média de valor por dia trabalhado no mês. É isso que equilibra o valor.
          </Passo>
          <Passo numero={5} titulo="A distribuição é gravada">
            O resultado fica fixo e vira histórico. Quem recebe um cliente novo passa a tê-lo na carteira.
          </Passo>
        </ol>
        <div className="rounded-lg bg-primary-50 p-3 text-sm">
          <b className="font-semibold text-primary-700">Quando o cliente sai da carteira.</b> Depois de{' '}
          <b className="font-semibold text-gray-800">{diasLiberacao} dias</b> sem aparecer na Rotina. Como há parcela todo mês, isso
          faz o cliente que pagou e só volta a aparecer na parcela seguinte ser redistribuído, em vez de ficar preso ao mesmo
          atendente para sempre. O prazo é ajustável nas Configurações Globais.
        </div>
      </Secao>

      <Secao rotulo="Exemplo · Dia 1" titulo="Primeira distribuição: Ana, Bruno e Carla começam do zero">
        <p>
          São {ex.dia1.resultado.length} clientes. Os nomes e valores são fictícios. Como ninguém tem carteira ainda, todos entram como
          novos.
        </p>
        <TabelaDistribuicao resultado={ex.dia1.resultado} mostrarMotivo={false} />
        <ResumoAtendentes hoje={ex.dia1.hoje} />
        <h3 className="pt-2 font-semibold text-gray-800">Comparação com o rodízio simples</h3>
        <p>
          No rodízio simples (um para cada, em sequência) a quantidade também fica igual, mas o valor não: quem pega o primeiro cliente
          de cada volta fica com os maiores.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <Comparacao titulo="Rodízio simples" dados={ex.rodizio} maximo={maxComparacao} />
          <Comparacao titulo="Regra da distribuição" dados={regra} maximo={maxComparacao} />
        </div>
      </Secao>

      <Secao rotulo="Exemplo · Dia 2" titulo="Quem já tem dono continua com ele">
        <p>
          {continuidadesDia2} clientes do dia 1 voltam à Rotina em outra etapa e ficam com quem já falou com eles. Os {novosDia2}{' '}
          clientes novos completam a carga de cada um.
        </p>
        <TabelaDistribuicao resultado={ex.dia2.resultado} />
        <ResumoAtendentes hoje={ex.dia2.hoje} medias={ex.mediasDia2} />
        {maiorInad && menorInad && maiorInad !== menorInad && (
          <div className="rounded-lg bg-primary-50 p-3 text-sm">
            <b className="font-semibold text-primary-700">A compensação no valor.</b> Ao fim do dia 1, {maiorInad.atendente} tinha a menor
            média ({brl(ex.placarDia1[maiorInad.atendente].valorMes)}) e ficou com o maior cliente novo da inadimplência ({maiorInad.nome},{' '}
            {brl(maiorInad.valor)}). {menorInad.atendente}, com média maior, ficou com o menor ({menorInad.nome}, {brl(menorInad.valor)}).
            Com o passar dos dias, as médias se aproximam.
          </div>
        )}
      </Secao>

      <Secao rotulo="Exemplo · Dia 3" titulo="O que muda quando a equipe muda">
        <p>
          Os cenários partem da mesma situação: as carteiras como ficaram ao fim do dia 2 e os mesmos {ex.cenarios.normal.resultado.length}{' '}
          clientes na Rotina do dia 3.
        </p>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {CENARIOS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cenario === c.id}
              onClick={() => setCenario(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                cenario === c.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {c.icone && <c.icone size={13} />}
              {c.rotulo}
            </button>
          ))}
        </div>
        <div className="space-y-3">{atual.texto}</div>
        <TabelaDistribuicao resultado={resultadoAtual.resultado} />
        <ResumoAtendentes hoje={resultadoAtual.hoje} />
      </Secao>

      <Secao rotulo="Durante o dia" titulo="Distribuir agora e Redistribuir hoje">
        <div className="grid gap-3 md:grid-cols-2">
          <Opcao icone={Play} titulo="Distribuir agora">
            Faz o mesmo que a execução agendada: entrega só os clientes de hoje que ainda não têm dono (por exemplo, os que entraram
            depois de uma atualização da base). O que já foi distribuído não muda.
          </Opcao>
          <Opcao icone={Shuffle} titulo="Redistribuir hoje" destaque>
            Refaz o dia com a equipe atual. Use depois de adicionar, tirar, pausar ou substituir alguém no meio do dia.
          </Opcao>
        </div>
        <ul className="space-y-2">
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>
              <b className="font-medium text-gray-800">O que já foi trabalhado não muda de dono.</b> Cliente com WhatsApp, e-mail ou
              ligação registrado hoje fica com quem registrou, porque o histórico mostra quem fez.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>Só os clientes ainda sem nenhum registro hoje são redistribuídos, pela mesma regra de cima.</span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>Tudo fica em "Últimas mudanças": quem redistribuiu, quando e como ficou.</span>
          </li>
        </ul>
      </Secao>

      <Secao rotulo="Horário" titulo="A distribuição diária roda pelo Monitor de Integrações">
        <p>
          Em <b className="font-medium text-gray-800">Integrações › Monitor de Integrações</b>, a rotina{' '}
          <b className="font-medium text-gray-800">Distribuição da Rotina de Cobrança</b> tem o horário da distribuição e o histórico
          de cada execução. Agende para depois da atualização da base do Sienge e do recálculo dos clusters, para a distribuição já
          usar os dados do dia.
        </p>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <CalendarClock size={18} className="shrink-0 text-primary-600" />
          <span>
            Sugestão de ordem: 05:00 base do contas a receber · 05:30 recálculo dos clusters · 06:00 distribuição da Rotina.
          </span>
        </div>
      </Secao>

      <Secao rotulo="Na Rotina" titulo="Como a distribuição aparece na aba Rotinas">
        <ul className="space-y-2">
          <li>
            <b className="font-medium text-gray-800">Responsável no primeiro nível.</b> Acima de Centro de Custo e Cliente, cada
            atendente tem uma linha com o valor total e a quantidade de títulos da carteira dele no período. Master e Administrador da tela veem
            todos os atendentes lado a lado ou filtram um só.
          </li>
          <li>
            <span className="mr-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-700">
              cobertura
            </span>
            Cliente da carteira de alguém que está de férias, atendido por outra pessoa até a volta.
          </li>
          <li>
            <span className="mr-1 rounded border border-gray-200 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-400">
              previsão
            </span>
            Dia que ainda não foi distribuído (amanhã, por exemplo). O atendente mostrado é quem tem o cliente na carteira hoje.
          </li>
          <li>
            <b className="font-medium text-amber-700">A distribuir</b> agrupa os clientes de um dia ainda não distribuído que não têm
            dono na carteira.
          </li>
        </ul>
      </Secao>
    </div>
  );
}
