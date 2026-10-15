import { useEffect, useRef } from 'react';
import {
  Activity,
  BookOpen,
  Building2,
  CircleDollarSign,
  Filter,
  Gauge,
  Landmark,
  LayoutGrid,
  LineChart,
  Scale,
  Table2,
  TrendingDown,
  X,
} from 'lucide-react';

// Sumário do painel do Fluxo de Caixa (pedido do usuário): uma janela com uma aba por seção do painel,
// explicando o que cada análise mostra, de onde vêm os números, como ler e o que dá para clicar.
// Abre pelo botão "Sumário" da barra ou pelo "?" no título de cada seção (direto na aba dela).
// Os cálculos descritos aqui são os de modelo.js / secoes.jsx — mude o texto junto se mudar a regra.

const Status = ({ t, children }) => <span className={`st ${t}`}>{children}</span>;

// Cada aba: titulo, icone, resumo (uma frase) e blocos { titulo, itens | texto }.
const ABAS_SUMARIO = [
  {
    id: 'filtros',
    titulo: 'Filtros do painel',
    icone: Filter,
    resumo: 'O que cada filtro da barra muda no painel.',
    blocos: [
      {
        titulo: 'Filtros',
        itens: [
          <>
            <b>Empresa</b> — a empresa do DFC Construtoras analisada.
          </>,
          <>
            <b>Histórico</b> — quantos meses <b>antes</b> do mês atual entram como realizado (6m, 1m ou digite de 1 a 36). Começa em 1.
          </>,
          <>
            <b>Horizonte</b> — quantos meses de projeção, <b>contando o mês atual</b> (6m, 9m ou digite). Começa em 6: com o mês atual em
            out/26, vai até mar/27.
          </>,
          <>
            <b>Centro de custo</b> — limita o painel aos centros marcados. Sem nenhum marcado, entram todos os centros com &quot;Projeta
            DFC&quot;.
          </>,
        ],
      },
      {
        titulo: 'Bom saber',
        itens: [
          'Clicar numa empresa (Fôlego de cada SPE) ou num centro (Quem gera e quem consome caixa) aplica o filtro de centro sozinho; clicar de novo volta ao consolidado.',
          'O botão de download gera o Excel do DFC (fluxo, saldos, bases do realizado e do projetado e dossiê da Projeção CEF) com os mesmos filtros da barra.',
          'Saldos das contas, carteira a receber/pagar e inadimplência são sempre da empresa inteira — não dependem do filtro de centro.',
          'Os dados recarregam sozinhos a cada 30 minutos com a tela aberta.',
        ],
      },
    ],
  },
  {
    id: 'indicadores',
    titulo: 'Indicadores',
    icone: LayoutGrid,
    resumo: 'Os 8 cards do topo: a fotografia do caixa hoje e dos próximos meses.',
    blocos: [
      {
        titulo: 'Cada card',
        itens: [
          <>
            <b>Caixa hoje</b> — saldo de abertura do mês atual nas contas com &quot;Projeta DFC&quot; (o Saldo inicial do mês atual na tabela).
            &quot;Aplicado&quot; é a parte em contas do tipo <b>Investimento</b>.
          </>,
          <>
            <b>Mínimo projetado</b> — o menor saldo de fim de mês dentro do horizonte, o mês em que ele acontece e quanto é menor que hoje.
          </>,
          <>
            <b>Resultado médio · próximos 6 meses</b> — média do Resultado do mês projetado (todas as entradas menos todas as saídas) nos 6
            primeiros meses do horizonte, e o mês em que o saldo fica abaixo do colchão, se ficar.
          </>,
          <>
            <b>Fluxo operacional · últimos meses</b> — soma do realizado (entradas + saídas) do Fluxo de Caixa Operacional nos meses do
            Histórico.
          </>,
          <>
            <b>Dívida PJ Caixa</b> — saldo devedor do crédito PJ (Projeção CEF) no último mês fechado, somando as obras, e até onde ele vai no
            fim da projeção.
          </>,
          <>
            <b>A receber em 90 dias</b> — parcelas a receber em aberto no Sienge que vencem do início do mês atual até 3 meses à frente; embaixo,
            toda a carteira a vencer.
          </>,
          <>
            <b>Inadimplência</b> — valor vencido ÷ (vencido + a vencer) das parcelas a receber em aberto.
          </>,
          <>
            <b>Maior concentração de caixa</b> — quanto do caixa está na empresa (SPE) com o maior saldo.
          </>,
        ],
      },
      {
        titulo: 'O colchão',
        texto:
          'O colchão é 1 mês de saídas operacionais: a média mensal das saídas do Fluxo de Caixa Operacional projetadas no horizonte. É a referência de "caixa mínimo seguro" usada nos cards e na Trajetória do caixa.',
      },
      {
        titulo: 'Como ler as etiquetas',
        itens: [
          <>
            <Status t="good">Verde</Status> situação confortável — <Status t="warn">Amarelo</Status> atenção — <Status t="crit">Vermelho</Status>{' '}
            crítico — <Status t="info">Azul</Status> informativo.
          </>,
          'Mínimo projetado: crítico abaixo do colchão; atenção abaixo de 2 colchões.',
          'Resultado médio: crítico se o saldo fura o colchão nos próximos 3 meses; atenção se a média é negativa.',
          'Inadimplência: atenção acima de 3%; crítico acima de 8%.',
          'Maior concentração: atenção quando uma empresa tem mais de 40% do caixa.',
          'Dívida PJ: "Crescente" quando o saldo no fim da projeção passa de 1,5 vez o de hoje.',
        ],
      },
    ],
  },
  {
    id: 'detalhamento',
    titulo: 'Detalhamento do fluxo de caixa',
    icone: Table2,
    resumo: 'A mesma tabela da aba DFC do DFC Construtoras, no período dos filtros.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Saldo inicial › grupos (máscara nível 1) › Entradas e Saídas › linhas (máscara nível 2) › naturezas › Resultado do mês › Saldo final.',
          'Até o mês atual, cada mês tem duas colunas: Realizado (extrato bancário das contas com Projeta DFC) e Projetado (última versão salva do Orçamento). Depois do mês atual, só Projetado.',
          'O mês atual fica destacado em azul.',
        ],
      },
      {
        titulo: 'Como usar',
        itens: [
          'Clique na seta de uma linha para abrir ou fechar o nível de baixo. O quadro cresce conforme você abre, até a altura da tela.',
          'Clique num valor de natureza para abrir o Detalhamento: os lançamentos (realizado) ou de onde veio o valor projetado (Aging, Orçamento Empresarial, valor informado ou Projeção CEF).',
          'O ícone no canto direito do título abre a tabela em tela cheia (Esc para sair).',
        ],
      },
    ],
  },
  {
    id: 'trajetoria',
    titulo: 'Trajetória do caixa e simulador',
    icone: LineChart,
    resumo: 'Para onde vai o saldo de caixa mês a mês — e o que acontece se as premissas piorarem.',
    blocos: [
      {
        titulo: 'O gráfico',
        itens: [
          <>
            <b>Linha azul cheia</b> — saldo realizado no fim de cada mês do histórico. <b>Azul tracejada</b> — saldo projetado pelo Orçamento.
          </>,
          <>
            <b>Laranja</b> — o mesmo projetado com os ajustes do simulador (só aparece quando o cenário muda alguma coisa).
          </>,
          <>
            <b>Vermelha pontilhada</b> — o colchão (1 mês de saídas operacionais). O fundo cinza marca os meses projetados.
          </>,
          'O título resume o ponto mais baixo do Orçamento no horizonte. Passe o mouse para ver os valores de cada mês.',
        ],
      },
      {
        titulo: 'O simulador (não altera nada no sistema)',
        itens: [
          <>
            <b>Orçamento</b> — sem ajustes. <b>Conservador</b> — estrutura fixa no ritmo real, obra 10% mais cara e entradas da obra escolhida 3
            meses atrasadas. <b>Estresse</b> — o conservador com obra 25% mais cara e 15% menos receita de vendas.
          </>,
          <>
            <b>Estrutura fixa no ritmo real</b> — quando o Orçamento projeta Pessoal e Administrativo abaixo da média realizada (últimos meses do
            histórico), usa a média.
          </>,
          <>
            <b>Estouro no custo de obra</b> — aumenta as saídas das linhas de construção/obra na porcentagem escolhida.
          </>,
          <>
            <b>Queda na receita de vendas</b> — reduz as entradas da linha Receita de Vendas.
          </>,
          <>
            <b>Atrasar entradas de</b> — empurra as entradas projetadas da obra escolhida o número de meses escolhido (o que passa do horizonte
            sai do gráfico).
          </>,
        ],
      },
    ],
  },
  {
    id: 'entradas',
    titulo: 'Entradas e saídas operacionais',
    icone: Activity,
    resumo: 'Quanto entra e quanto sai na operação, mês a mês.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Barras azuis: entradas do Fluxo de Caixa Operacional. Barras vermelhas: saídas. Pontos pretos: o líquido do mês (entradas − saídas).',
          'Barras fortes são realizado; barras claras, projetado. A linha tracejada separa os dois.',
          'O Fluxo Operacional já inclui captação de financiamentos (repasses CEF) e serviço da dívida; aplicações e resgates ficam de fora.',
        ],
      },
      { titulo: 'Como usar', texto: 'Passe o mouse sobre um mês para ver entradas, saídas e líquido.' },
    ],
  },
  {
    id: 'folego',
    titulo: 'Fôlego de cada SPE',
    icone: Building2,
    resumo: 'Se cada empresa (SPE) tivesse que se manter sozinha, até quando o caixa dela aguenta?',
    blocos: [
      {
        titulo: 'Como é calculado',
        itens: [
          'Ponto de partida: o saldo de hoje nas contas com Projeta DFC daquela empresa.',
          'Mês a mês soma o fluxo operacional projetado dos centros de custo dela — sem mútuos nem transferências entre empresas.',
          'Cada célula é o saldo projetado no fim do mês: vermelho = negativo, azul = positivo; quanto mais forte, maior o valor.',
        ],
      },
      {
        titulo: 'Como ler',
        itens: [
          <>
            <Status t="crit">Zera em …</Status> o primeiro mês em que o saldo fica negativo.
          </>,
          <>
            <Status t="warn">Cai …%</Status> não zera, mas o ponto mais baixo fica abaixo da metade do caixa de hoje.
          </>,
          <>
            <Status t="good">Cobre</Status> o caixa da empresa cobre o fluxo do horizonte.
          </>,
          'A célula com contorno é o mês de menor saldo. A linha "Soma" junta todas as empresas.',
        ],
      },
      {
        titulo: 'Como usar',
        itens: [
          'Ordene por Risco (quem zera primeiro), Caixa hoje ou Nome; "Só as que zeram" esconde as demais.',
          'Clique numa empresa para filtrar o painel inteiro pelos centros dela; clique de novo para voltar.',
        ],
      },
    ],
  },
  {
    id: 'quemgera',
    titulo: 'Quem gera e quem consome caixa',
    icone: Scale,
    resumo: 'Quais centros de custo colocam dinheiro no caixa e quais tiram.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Para cada centro com Projeta DFC: o fluxo operacional líquido realizado nos meses do Histórico e o projetado nos meses do Horizonte.',
          'A barra mostra o projetado: azul para a direita gera caixa; vermelha para a esquerda consome. A lista vem do que mais gera para o que mais consome.',
        ],
      },
      {
        titulo: 'Etiquetas',
        itens: [
          <>
            <span className="flag">CEF</span> a obra tem Projeção CEF ativa (Parâmetros cadastrados).
          </>,
          <>
            <span className="flag w">CEF fora</span> a obra tem contrato Caixa e recebeu repasse no histórico, mas não tem Projeção CEF — os
            repasses futuros podem estar faltando no Orçamento.
          </>,
        ],
      },
      { titulo: 'Como usar', texto: 'Clique numa linha para filtrar o painel por aquele centro; clique de novo para voltar.' },
    ],
  },
  {
    id: 'carteira',
    titulo: 'Carteira e liquidez',
    icone: Landmark,
    resumo: 'Onde está o dinheiro hoje e o que há para receber e pagar.',
    blocos: [
      {
        titulo: 'Os números',
        itens: [
          <>
            <b>Liquidez imediata</b> — saldo das contas correntes (que não são do tipo Investimento).
          </>,
          <>
            <b>Em aplicações</b> — saldo das contas do tipo Investimento (cadastro das contas correntes do DFC Construtoras).
          </>,
          <>
            <b>A receber a vencer</b> — parcelas a receber em aberto no Sienge ainda não vencidas.
          </>,
          <>
            <b>A pagar em aberto</b> — parcelas a pagar em aberto no Sienge (vencidas + a vencer).
          </>,
        ],
      },
      {
        titulo: 'O gráfico',
        texto:
          'Todas as contas com Projeta DFC e o saldo de abertura do mês atual, da maior para a menor: azul claro = Investimento, azul escuro = conta corrente. Passe o mouse para ver empresa, número e tipo da conta.',
      },
    ],
  },
  {
    id: 'orcamento',
    titulo: 'O Orçamento erra para qual lado?',
    icone: Gauge,
    resumo: 'Compara o que aconteceu com o que o Orçamento previa para os mesmos meses.',
    blocos: [
      {
        titulo: 'Como é calculado',
        itens: [
          'Para cada linha do Fluxo Operacional, soma o realizado e o projetado (versão atual do Orçamento) nos meses do Histórico.',
          'Desvio = realizado ÷ projetado − 1. Aparecem as 8 linhas com a maior diferença em reais (só as que somam mais de R$ 20 mil).',
        ],
      },
      {
        titulo: 'Como ler',
        itens: [
          'Vermelho = desfavorável: saída maior que a prevista ou entrada menor. Azul/verde = favorável.',
          'Um desvio que se repete mês a mês indica que a premissa do Orçamento daquela linha precisa de ajuste.',
          'Com Histórico de 1 mês a comparação é curta — aumente o Histórico para ver a tendência.',
        ],
      },
    ],
  },
  {
    id: 'saidas',
    titulo: 'Maiores saídas operacionais',
    icone: TrendingDown,
    resumo: 'Para quem foi a maior parte do dinheiro no período.',
    blocos: [
      {
        titulo: 'O que mostra',
        itens: [
          'Os 10 favorecidos com mais pagamentos no Fluxo Operacional realizado, nos meses do Histórico (respeita o filtro de centro).',
          'Vermelho = custo de obra (linhas de construção/obra); cinza = demais saídas.',
          'Passe o mouse para ver o total pago, o número de lançamentos e a linha do fluxo.',
        ],
      },
    ],
  },
  {
    id: 'divida',
    titulo: 'Dívida PJ da Caixa',
    icone: CircleDollarSign,
    resumo: 'O financiamento à produção (PJ) de cada obra com Projeção CEF.',
    blocos: [
      {
        titulo: 'Os números de cada obra',
        itens: [
          'Saldo devedor no último mês fechado, teto do PJ, % da obra executada, juros ao mês, % de amortização e os juros no último mês da projeção.',
          'O gráfico mostra o saldo devedor ao longo de toda a projeção; a linha tracejada horizontal é o teto e a vertical, o mês de referência.',
        ],
      },
      {
        titulo: 'Unidades',
        itens: [
          'Azul: unidades já registradas (repasse feito). Azul escuro: unidades com contrato na Caixa ainda sem registro. Cinza: unidades sem contrato.',
          'Os valores vêm da Projeção CEF gravada (aba Projeção CEF do DFC Construtoras).',
        ],
      },
    ],
  },
];

export default function SumarioModal({ aberta, aba, onAba, onFechar }) {
  const painel = useRef(null);
  const atual = ABAS_SUMARIO.find((a) => a.id === aba) || ABAS_SUMARIO[0];

  useEffect(() => {
    if (!aberta) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, onFechar]);

  // Conteúdo volta ao topo ao trocar de aba.
  useEffect(() => {
    if (painel.current) painel.current.scrollTop = 0;
  }, [aba]);

  if (!aberta) return null;

  // Setas para cima/baixo trocam de aba (padrão de lista de abas vertical).
  const mover = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = ABAS_SUMARIO.findIndex((a) => a.id === atual.id);
    const prox = ABAS_SUMARIO[(i + (e.key === 'ArrowDown' ? 1 : -1) + ABAS_SUMARIO.length) % ABAS_SUMARIO.length];
    onAba(prox.id);
    document.getElementById(`sum-aba-${prox.id}`)?.focus();
  };
  const Icone = atual.icone;

  return (
    <div className="sumario-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="sumario" role="dialog" aria-modal="true" aria-labelledby="sumario-titulo">
        <header className="sumario-topo">
          <div>
            <div className="eyebrow">Econômico Financeiro · Fluxo de Caixa</div>
            <h2 id="sumario-titulo">
              <BookOpen size={20} aria-hidden="true" /> Sumário das análises
            </h2>
          </div>
          <button type="button" className="sumario-fechar" onClick={onFechar} aria-label="Fechar o sumário" title="Fechar (Esc)">
            <X size={18} />
          </button>
        </header>
        <div className="sumario-corpo">
          <nav className="sumario-abas" role="tablist" aria-orientation="vertical" aria-label="Seções do painel" onKeyDown={mover}>
            {ABAS_SUMARIO.map((a, i) => {
              const IconeAba = a.icone;
              const ativa = a.id === atual.id;
              return (
                <button
                  key={a.id}
                  id={`sum-aba-${a.id}`}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  aria-controls="sumario-conteudo"
                  tabIndex={ativa ? 0 : -1}
                  className={ativa ? 'ativa' : ''}
                  onClick={() => onAba(a.id)}
                >
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <IconeAba size={15} aria-hidden="true" />
                  <span className="txt">{a.titulo}</span>
                </button>
              );
            })}
          </nav>
          <section id="sumario-conteudo" className="sumario-conteudo" role="tabpanel" aria-labelledby={`sum-aba-${atual.id}`} ref={painel}>
            <div className="sumario-cab">
              <span className="sumario-icone">
                <Icone size={20} aria-hidden="true" />
              </span>
              <div>
                <h3>{atual.titulo}</h3>
                <p>{atual.resumo}</p>
              </div>
            </div>
            {atual.blocos.map((b) => (
              <div key={b.titulo} className="sumario-bloco">
                <h4>{b.titulo}</h4>
                {b.texto && <p>{b.texto}</p>}
                {b.itens && (
                  <ul>
                    {b.itens.map((it, k) => (
                      <li key={k}>{it}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
