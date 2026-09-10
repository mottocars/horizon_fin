import N from './Num';

// Conteúdo estático (rótulos, explicações e exemplos) do Motor de Risco —
// separado da lógica/layout pra não poluir o componente principal. Os
// exemplos são ilustrativos e fixos (não recalculam com o valor digitado),
// só pra ancorar o que cada parâmetro significa na prática.

// Sessão 1 — parâmetros de contagem: definem o que entra na conta (quais
// parcelas, em que período), não se o cliente é bom ou ruim.
export const PARAMETROS = [
  {
    id: 'tolerancia_dias',
    label: 'Tolerância de "em dia"',
    desc: 'Quantos dias após o vencimento o pagamento ainda conta como pontual. Serve para não punir o cliente por compensação bancária, feriado ou fim de semana.',
    exemplo: (
      <>
        Com <N>3</N> dias: parcela vence sexta, <N>31/07</N>. Pagou na segunda, <N>03/08</N> → em dia. Pagou em{' '}
        <N>05/08</N> → 5 dias de atraso.
      </>
    ),
    min: 0,
    max: 15,
    step: 1,
    unidade: 'dias',
    default: 3,
  },
  {
    id: 'janela_observacao_meses',
    label: 'Janela de observação',
    desc: 'Período de histórico que o motor enxerga. Parcelas mais antigas saem da conta. Sem janela, um atraso antigo pesa para sempre e o cliente nunca se recupera.',
    exemplo: (
      <>
        Com <N>24</N> meses: um atraso de 40 dias em <N>mar/2024</N> deixa de contar a partir de <N>mar/2026</N>.
      </>
    ),
    min: 6,
    max: 120,
    step: 6,
    unidade: 'meses',
    default: 24,
  },
  {
    id: 'gatilho_reincidencia_dias',
    label: 'Gatilho de reincidência',
    desc: 'A partir de quantos dias de atraso uma parcela conta como uma reincidência. Use o mesmo número que abre a governança de cobrança, para que os dois módulos falem a mesma língua.',
    exemplo: (
      <>
        Com <N>10</N> dias: cliente com parcelas atrasadas <N>3, 9 e 22</N> dias tem reincidência <N>1</N> — só a de
        22 dias cruzou o gatilho.
      </>
    ),
    min: 1,
    max: 60,
    step: 1,
    unidade: 'dias',
    default: 10,
  },
  {
    id: 'minimo_parcelas',
    label: 'Mínimo de parcelas para classificar',
    desc: 'Abaixo desta quantidade de parcelas já vencidas, o cliente fica como Novo cliente e não recebe score. Pouco histórico não é histórico bom — é ausência de informação.',
    exemplo: (
      <>
        Com <N>3</N>: cliente na <N>2ª</N> parcela, mesmo pagando tudo em dia, continua Novo cliente. Ganha score na{' '}
        <N>3ª</N>.
      </>
    ),
    min: 1,
    max: 12,
    step: 1,
    unidade: 'parcelas',
    default: 3,
  },
  {
    id: 'dia_recalculo',
    label: 'Dia do recálculo mensal',
    desc: 'Data fixa em que todos os clusters são reprocessados. Um cluster estável durante o mês evita que a régua mude de tom no meio de uma cobrança em andamento.',
    exemplo: (
      <>
        Com dia <N>1</N>: o cluster apurado em <N>01/08</N> vale até <N>31/08</N>, mesmo que o cliente atrase uma
        parcela no dia 15.
      </>
    ),
    min: 1,
    max: 28,
    step: 1,
    unidade: 'do mês',
    default: 1,
  },
  {
    id: 'trava_subida_parcelas',
    label: 'Trava de subida de cluster',
    desc: 'Quantas parcelas seguidas em dia o cliente precisa pagar para melhorar de cluster. Piorar é imediato; melhorar é travado. Vale também para quem renegociou.',
    exemplo: (
      <>
        Com <N>6</N>: cliente Mau pagador que paga <N>6</N> parcelas seguidas em dia sobe para Duvidoso. Na{' '}
        <N>5ª</N>, ainda não sobe. Se atrasar a 4ª, a contagem recomeça.
      </>
    ),
    min: 0,
    max: 24,
    step: 1,
    unidade: 'parcelas',
    default: 6,
  },
  {
    id: 'dias_vencidos_regua_cobranca',
    label: 'Dias vencidos para régua de cobrança',
    desc: 'A partir de quantos dias de atraso em uma única parcela em aberto o cliente entra na regra dura da régua de cobrança e vira Mau pagador na hora, independentemente do score. É a régua real que roda sobre a base do Sienge (Operações → Gestão de Cobranças → Clusters de Clientes) — veja o motivo registrado no log de cada cliente.',
    exemplo: (
      <>
        Com <N>20</N> dias: cliente com score ótimo mas 1 parcela em aberto há <N>25</N> dias vira Mau pagador
        assim que o cluster é recalculado. Quitando essa parcela, ele volta a valer pelo score — sujeito à trava
        de subida.
      </>
    ),
    min: 1,
    max: 90,
    step: 1,
    unidade: 'dias',
    default: 20,
  },
];

// Comportamentos fixos do motor — não são configuráveis, de propósito: uma
// escolha errada aqui invalidaria o modelo inteiro. Ficam só documentados.
export const REGRAS_FIXAS = [
  {
    label: 'Parcela vencida e ainda em aberto sempre entra na conta',
    desc: 'O atraso é contado do vencimento até hoje, e cresce a cada dia. Se ficasse de fora, quem simplesmente parou de pagar apareceria com atraso médio baixo.',
    exemplo: (
      <>
        Cliente com 5 parcelas pagas em dia e <N>1 aberta há 70 dias</N>: atraso médio <N>11,7</N> dias. Se a aberta
        fosse ignorada, o atraso médio seria <N>0</N> — e ele viraria bom pagador.
      </>
    ),
    selo: 'sempre',
  },
  {
    label: 'Renegociação não apaga o histórico nem muda o cluster',
    desc: 'As parcelas originais continuam no cálculo com o vencimento original até saírem da janela de observação. O cliente permanece no cluster atual e só melhora cumprindo a trava de subida.',
    exemplo: (
      <>
        Cliente Mau pagador renegocia em <N>ago/2026</N>. As parcelas atrasadas de antes continuam contando. Ele só
        volta a Duvidoso após <N>6</N> parcelas do novo acordo pagas em dia.
      </>
    ),
    selo: 'fixo',
  },
];

// Sessão 2 — indicadores do score. `pior`/`melhor` são a escala padrão
// (nota 0 / nota 100) de fábrica; `cor` é o slot categórico (paleta
// validada com o script da skill de dataviz para 5 séries lado a lado).
export const INDICADORES = [
  {
    id: 'pct_em_dia',
    nome: 'Parcelas pagas em dia',
    curto: 'Pagas em dia',
    formula: 'pagas dentro da tolerância ÷ total vencido',
    unidade: '%',
    pior: 50,
    melhor: 100,
    peso: 30,
    cor: '#2a78d6',
  },
  {
    id: 'atraso_medio',
    nome: 'Atraso médio',
    curto: 'Atraso médio',
    formula: 'média de dias de atraso na janela',
    unidade: ' dias',
    pior: 30,
    melhor: 0,
    peso: 25,
    cor: '#eb6834',
  },
  {
    id: 'maior_atraso',
    nome: 'Maior atraso',
    curto: 'Maior atraso',
    formula: 'máximo de dias de atraso na janela',
    unidade: ' dias',
    pior: 90,
    melhor: 0,
    peso: 15,
    cor: '#1baf7a',
  },
  {
    id: 'reincidencia',
    nome: 'Reincidência',
    curto: 'Reincidência',
    formula: 'parcelas que cruzaram o gatilho',
    unidade: '',
    pior: 5,
    melhor: 0,
    peso: 20,
    cor: '#eda100',
  },
  {
    id: 'relacionamento',
    nome: 'Tempo de relacionamento',
    curto: 'Relacionamento',
    formula: 'meses desde a primeira parcela',
    unidade: ' m',
    pior: 0,
    melhor: 36,
    peso: 10,
    cor: '#e87ba4',
  },
];

// Faixas de corte — onde o score vira cluster.
export const CORTES = [
  {
    id: 'corte_bom_pagador',
    label: 'Bom pagador a partir de',
    desc: 'Score igual ou acima deste valor.',
    exemplo: (
      <>
        Com <N>75</N>: score <N>75</N> é Bom pagador; score <N>74</N> é Duvidoso.
      </>
    ),
    min: 1,
    max: 99,
    step: 1,
    unidade: 'pontos',
    default: 75,
  },
  {
    id: 'corte_pagador_duvidoso',
    label: 'Pagador duvidoso a partir de',
    desc: 'Abaixo deste valor, o cliente é Mau pagador.',
    exemplo: (
      <>
        Com <N>45</N>: a faixa Duvidoso vai de <N>45</N> a <N>74</N>. Score <N>44</N> cai em Mau pagador.
      </>
    ),
    min: 1,
    max: 98,
    step: 1,
    unidade: 'pontos',
    default: 45,
  },
];

// Estado inicial do formulário quando a empresa ainda não tem versão salva —
// tudo em branco de propósito: o `default` de cada campo acima é só o
// número usado no texto de exemplo, não um valor sugerido pra preencher
// sozinho. Cada empresa calibra o motor do zero, e um campo em branco (em
// vez de já vir com um número) deixa isso óbvio.
export const PARAMS_VAZIOS = Object.fromEntries(PARAMETROS.map((p) => [p.id, '']));
export const CORTES_VAZIOS = Object.fromEntries(CORTES.map((c) => [c.id, '']));
export const INDICADORES_VAZIOS = INDICADORES.map((ind) => ({
  indicador: ind.id,
  nota_0: '',
  nota_100: '',
  peso: '',
}));
