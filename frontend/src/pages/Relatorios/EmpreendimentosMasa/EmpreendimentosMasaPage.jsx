import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, FileDown, Filter, Minus, Plus, TriangleAlert, X } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro, proximoFiltro, valoresDoFiltro } from '../../../components/FiltroColuna';
import { getMatrizEmpreendimentosMasa } from '../../../api/relatorioMasa.api';

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatarHoras(segundos) {
  const horas = segundos / 3600;
  return `${horas.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

function formatarPercentual(valor) {
  return `${(Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Duração em texto (pedido do usuário, no lugar de só "N dias"): menos de 1 mês mostra só dias;
// de 1 mês até 1 ano mostra mês e dia; a partir de 1 ano mostra ano e mês (sem o dia, que perde
// relevância nessa escala). Mês/ano são aproximados (30/365 dias) — não temos a data de
// assinatura no front, só a contagem de dias já calculada pelo backend.
function formatarDuracao(dias) {
  if (dias == null) return null;
  const unidade = (valor, singular, plural) => `${valor} ${valor === 1 ? singular : plural}`;

  if (dias < 30) {
    return unidade(dias, 'dia', 'dias');
  }
  if (dias < 365) {
    const meses = Math.floor(dias / 30);
    const diasRestantes = dias % 30;
    return diasRestantes > 0
      ? `${unidade(meses, 'mês', 'meses')} e ${unidade(diasRestantes, 'dia', 'dias')}`
      : unidade(meses, 'mês', 'meses');
  }
  const anos = Math.floor(dias / 365);
  const mesesRestantes = Math.floor((dias % 365) / 30);
  return mesesRestantes > 0
    ? `${unidade(anos, 'ano', 'anos')} e ${unidade(mesesRestantes, 'mês', 'meses')}`
    : unidade(anos, 'ano', 'anos');
}

// Cor por classificação do empreendimento (client_related_products.classificacao_id, join com
// classifications, no Time Tracker — ver relatorioMasa.service.js::buscarDadosTimeTracker).
// `swatch` = cor cheia (usada só na bolinha da legenda); `fundo` = versão clara, aplicada como
// background nas células do próprio empreendimento na tabela. Ordem = severidade/prioridade,
// usada também como ordem da legenda. Quem não tem classificação (a maioria — a base só cobre
// uma parte dos empreendimentos) fica sem cor nenhuma.
const CLASSIFICACAO_CORES = {
  Críticos: { swatch: 'bg-red-500', fundo: 'bg-red-50' },
  Prioritários: { swatch: 'bg-amber-500', fundo: 'bg-amber-50' },
  Especiais: { swatch: 'bg-purple-500', fundo: 'bg-purple-50' },
  'Masa Operação': { swatch: 'bg-primary-500', fundo: 'bg-primary-50' },
};

// Mesma ideia de relatorioMasa.service.js::chaveOrdemTaskType — só pra ordenar as opções do
// filtro de "Micro Etapa Atual" (e agrupar as linhas da tabela) pelo prefixo "major.minor" do
// nome (1.2, 1.10, 2.1...) em vez de ordem alfabética de string (que colocaria "1.10" antes de
// "1.2").
function chaveOrdemMicroEtapa(nome) {
  const match = /^(\d+)\.(\d+)/.exec(nome || '');
  if (!match) return null;
  return parseInt(match[1], 10) * 1000 + parseInt(match[2], 10);
}
function compararMicroEtapas(a, b) {
  const chaveA = chaveOrdemMicroEtapa(a);
  const chaveB = chaveOrdemMicroEtapa(b);
  if (chaveA != null && chaveB != null) return chaveA - chaveB;
  if (chaveA != null) return -1;
  if (chaveB != null) return 1;
  return a.localeCompare(b, 'pt-BR');
}

// Agrupa os empreendimentos de uma fase por Micro Etapa Atual, preservando a ordem relativa de
// cada um dentro do grupo (a lista já chega ordenada por `order` do backend) — os grupos em si
// saem ordenados pelo prefixo numérico da micro etapa (ver compararMicroEtapas), com quem não
// tem micro etapa nenhuma por último.
function agruparPorMicroEtapa(empreendimentos) {
  const porMicroEtapa = new Map(); // nome da micro etapa (ou null) -> empreendimentos[]
  for (const emp of empreendimentos) {
    const chave = emp.microEtapaAtual || null;
    if (!porMicroEtapa.has(chave)) porMicroEtapa.set(chave, []);
    porMicroEtapa.get(chave).push(emp);
  }
  return [...porMicroEtapa.entries()]
    .sort(([a], [b]) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return compararMicroEtapas(a, b);
    })
    .map(([microEtapaAtual, itens]) => ({ microEtapaAtual, empreendimentos: itens }));
}

// Chave estável de um grupo de Micro Etapa Atual — usada tanto pro Set de colapsados quanto pra
// key do React — combina a fase (o mesmo nome de micro etapa pode existir em fases diferentes)
// com o nome da micro etapa em si (ou um marcador fixo pra quem não tem nenhuma).
function chaveGrupoMicroEtapa(faseId, microEtapaAtual) {
  return `${faseId}::${microEtapaAtual || '(sem micro etapa)'}`;
}

function formatarNumero(valor) {
  return valor.toLocaleString('pt-BR');
}

// Colunas de % Masa até Contas a Pagar — as que o usuário pode mostrar/esconder pelo painel
// lateral (Fase, Tarefa e Empreendimento são fixas). Uma definição só, usada por TODAS as
// partes da tabela (cabeçalho, linha do empreendimento, resumo de fase/grupo colapsado,
// totalizador) e pela exportação pro Excel, pra esconder uma coluna esconder em todas de uma vez.
// - `somavel`: entra nos resumos/totalizador (% Masa não — percentual não é grandeza que se soma).
// - `excel`: título da coluna, formato de número e, quando o valor exportado não é o valor cru,
//   a conversão (Horas: segundos -> horas; Duração continua em dias, não no texto ano/mês/dia
//   da tela, pra sobrar uma coluna numérica somável/filtrável no Excel).
const COLUNAS = [
  { chave: 'percentualMasa', label: '% Masa', largura: 'w-24', formatar: formatarPercentual, somavel: false, excel: { titulo: '% Masa', formato: '0.0"%"' } },
  { chave: 'duracaoDias', label: 'Duração', largura: 'w-28', formatar: formatarDuracao, somavel: true, excel: { titulo: 'Duração (dias)', formato: '#,##0' } },
  { chave: 'areaM2', label: 'M²', largura: 'w-28', formatar: formatarNumero, somavel: true, excel: { titulo: 'M²', formato: '#,##0.00' } },
  { chave: 'unidades', label: 'Unidades', largura: 'w-24', formatar: formatarNumero, somavel: true, excel: { titulo: 'Unidades', formato: '#,##0' } },
  { chave: 'vgvGeral', label: 'VGV Geral', largura: 'w-32', formatar: formatarMoeda, somavel: true, excel: { titulo: 'VGV Geral', formato: '"R$" #,##0.00' } },
  { chave: 'vgvMasa', label: 'VGV Masa', largura: 'w-32', formatar: formatarMoeda, somavel: true, excel: { titulo: 'VGV Masa', formato: '"R$" #,##0.00' } },
  {
    chave: 'segundosTrabalhados',
    label: 'Horas Trabalhadas',
    largura: 'w-28',
    formatar: formatarHoras,
    somavel: true,
    excel: { titulo: 'Horas Trabalhadas', formato: '#,##0.0" h"', converter: (segundos) => Number((segundos / 3600).toFixed(1)) },
  },
  { chave: 'contasPagas', label: 'Contas Pagas', largura: 'w-32', formatar: formatarMoeda, somavel: true, excel: { titulo: 'Contas Pagas', formato: '"R$" #,##0.00' } },
  { chave: 'contasAPagar', label: 'Contas a Pagar', largura: 'w-32', formatar: formatarMoeda, somavel: true, excel: { titulo: 'Contas a Pagar', formato: '"R$" #,##0.00' } },
];
const COLUNAS_SOMAVEIS = COLUNAS.filter((coluna) => coluna.somavel);

// Soma as colunas somáveis (Duração até Contas a Pagar) de uma lista de empreendimentos —
// usada pro resumo da fase colapsada, pro de um grupo de Micro Etapa Atual colapsado e pro
// totalizador do rodapé.
function somarEmpreendimentos(empreendimentos) {
  const soma = Object.fromEntries(COLUNAS_SOMAVEIS.map((coluna) => [coluna.chave, 0]));
  for (const emp of empreendimentos) {
    for (const { chave } of COLUNAS_SOMAVEIS) soma[chave] += emp[chave] || 0;
  }
  return soma;
}

// Valor da opção "Sem Agrupamento" do filtro de Agrupamento — casa com o empreendimento que não
// tem agrupamento_id (null). Texto fixo, que nunca colide com um id numérico de groupings.
const SEM_AGRUPAMENTO = 'sem-agrupamento';

// Achata uma fase em linhas de tabela prontas pra renderizar, já carregando tudo que o JSX
// precisa saber sobre rowSpan/borda de cada uma: "Etapa Atual" continua 1 célula só pra fase
// inteira (mesmo de sempre); "Micro Etapa Atual" segue o mesmo perfil — 1 célula só por grupo de
// empreendimentos com a mesma micro etapa — e cada grupo pode estar colapsado (`grupoColapsado`
// em `microEtapasColapsadas`), virando 1 linha de resumo só em vez de 1 por empreendimento (o
// rowSpan da fase e a borda de "última linha" já contam esse tamanho reduzido certinho).
function construirLinhasFase(fase, microEtapasColapsadas) {
  const gruposBrutos =
    fase.empreendimentos.length > 0
      ? agruparPorMicroEtapa(fase.empreendimentos)
      : [{ microEtapaAtual: null, empreendimentos: [null] }];

  const grupos = gruposBrutos.map((grupo) => {
    const chave = chaveGrupoMicroEtapa(fase.id, grupo.microEtapaAtual);
    const colapsado = fase.empreendimentos.length > 0 && microEtapasColapsadas.has(chave);
    return { ...grupo, chave, colapsado, tamanhoEfetivo: colapsado ? 1 : grupo.empreendimentos.length };
  });
  const total = grupos.reduce((soma, grupo) => soma + grupo.tamanhoEfetivo, 0);

  const linhas = [];
  let indice = 0;
  for (const grupo of grupos) {
    const grupoTerminaNaFase = indice + grupo.tamanhoEfetivo === total;
    if (grupo.colapsado) {
      linhas.push({
        tipo: 'grupoColapsado',
        grupo,
        primeiraDaFase: indice === 0,
        ultimaDaFase: indice === total - 1,
        grupoTerminaNaFase,
      });
      indice += 1;
    } else {
      grupo.empreendimentos.forEach((empreendimento, indiceNoGrupo) => {
        linhas.push({
          tipo: 'empreendimento',
          empreendimento,
          primeiraDaFase: indice === 0,
          ultimaDaFase: indice === total - 1,
          primeiraDoGrupo: indiceNoGrupo === 0,
          tamanhoGrupo: grupo.empreendimentos.length,
          microEtapaAtual: grupo.microEtapaAtual,
          grupoChave: grupo.chave,
          grupoTerminaNaFase,
        });
        indice += 1;
      });
    }
  }
  return { linhas, total };
}

// Resumo de uma fase colapsada (pedido do usuário): Micro Etapa Atual e Empreendimento viram
// uma CONTAGEM (quantas micro etapas distintas / quantos empreendimentos), e todas as colunas
// de Duração até Contas a Pagar somam os valores de TODOS os empreendimentos da fase.
function calcularResumoFase(fase) {
  const microEtapas = new Set();
  for (const emp of fase.empreendimentos) {
    if (emp.microEtapaAtual) microEtapas.add(emp.microEtapaAtual);
  }
  return {
    qtdMicroEtapas: microEtapas.size,
    qtdEmpreendimentos: fase.empreendimentos.length,
    ...somarEmpreendimentos(fase.empreendimentos),
  };
}

// Célula de uma coluna de COLUNAS numa linha de resumo (fase ou grupo de Micro Etapa colapsado):
// a soma da coluna, ou "—" quando ela não é somável (% Masa).
function CelulaResumo({ coluna, resumo, borda }) {
  return (
    <td
      className={`${borda} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums ${
        coluna.somavel ? 'text-gray-700' : 'text-gray-300'
      }`}
    >
      {coluna.somavel ? coluna.formatar(resumo[coluna.chave]) : '—'}
    </td>
  );
}

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela). Coluna "Etapa Atual" (fase, action_types) fixa: 1 célula só por fase, com
// `rowSpan` cobrindo todas as linhas dos empreendimentos dela e centralizada verticalmente
// (`align-middle`); "Micro Etapa Atual" segue o mesmo perfil, 1 célula por grupo de
// empreendimentos com a mesma micro etapa dentro da fase (ver construirLinhasFase). Cada
// empreendimento aparece só na fase mais avançada entre todas as suas ações (ver
// relatorioMasa.service.js::listMatriz) — nunca repetido em mais de uma linha.
export default function EmpreendimentosMasaPage() {
  const [matriz, setMatriz] = useState(null);
  // Agrupamentos ativos do Time Tracker (groupings) — opções do filtro de Agrupamento do painel
  // lateral, todas elas, tenham ou não algum empreendimento ligado.
  const [agrupamentos, setAgrupamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros de coluna (Fase/Tarefa/Empreendimento) e o de Agrupamento (painel lateral) — null =
  // todas as opções marcadas, sem filtro (ver valoresDoFiltro); uma lista restringe só aos
  // valores dela. Todos os filtros são combinados em "E" entre si.
  const [filtroEtapaAtual, setFiltroEtapaAtual] = useState(null);
  const [filtroEmpreendimento, setFiltroEmpreendimento] = useState(null);
  const [filtroMicroEtapa, setFiltroMicroEtapa] = useState(null);
  const [filtroAgrupamento, setFiltroAgrupamento] = useState(null);

  // Painel lateral (ícone de filtro no canto direito da linha da legenda): filtro de Agrupamento
  // e a escolha de quais colunas (de % Masa até Contas a Pagar) aparecem — todas por padrão.
  const [painelAberto, setPainelAberto] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = useState(() => new Set(COLUNAS.map((coluna) => coluna.chave)));
  const colunas = useMemo(() => COLUNAS.filter((coluna) => colunasVisiveis.has(coluna.chave)), [colunasVisiveis]);
  const todasColunasVisiveis = colunas.length === COLUNAS.length;

  function toggleColuna(chave) {
    setColunasVisiveis((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function toggleTodasColunas() {
    setColunasVisiveis(todasColunasVisiveis ? new Set() : new Set(COLUNAS.map((coluna) => coluna.chave)));
  }
  // Clicar numa classificação da legenda alterna ela dentro deste filtro (várias podem ficar
  // ativas ao mesmo tempo, mesma convenção multi-seleção dos outros filtros de coluna).
  const [filtroClassificacao, setFiltroClassificacao] = useState([]);

  function toggleFiltroClassificacao(nome) {
    setFiltroClassificacao((atual) => (atual.includes(nome) ? atual.filter((n) => n !== nome) : [...atual, nome]));
  }

  // Referências dos <th> — passadas pra FiltroColuna (via `colunaRef`) só pra o painel de
  // filtro nascer com a mesma largura da coluna, em vez da largura do ícone que abre ele.
  const thEtapaAtualRef = useRef(null);
  const thEmpreendimentoRef = useRef(null);
  const thMicroEtapaRef = useRef(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro('');
    return getMatrizEmpreendimentosMasa()
      .then((dados) => {
        setMatriz(dados.fases);
        setAgrupamentos(dados.agrupamentos);
      })
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar a matriz da Actioon.'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Opções das comboboxes de filtro — sempre a partir da `matriz` crua (não da já filtrada),
  // pra lista de opções não encolher conforme o usuário vai filtrando por outra coluna (mesmo
  // espírito de RotinasTab.jsx).
  const opcoesEtapaAtual = useMemo(() => (matriz || []).map((fase) => ({ value: fase.name, label: fase.name })), [matriz]);

  const opcoesEmpreendimento = useMemo(() => {
    const nomes = new Set();
    for (const fase of matriz || []) {
      for (const emp of fase.empreendimentos) nomes.add(emp.name);
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((nome) => ({ value: nome, label: nome }));
  }, [matriz]);

  const opcoesMicroEtapa = useMemo(() => {
    const nomes = new Set();
    for (const fase of matriz || []) {
      for (const emp of fase.empreendimentos) {
        if (emp.microEtapaAtual) nomes.add(emp.microEtapaAtual);
      }
    }
    return [...nomes].sort(compararMicroEtapas).map((nome) => ({ value: nome, label: nome }));
  }, [matriz]);

  // + "Sem Agrupamento" no fim, pra quem não tem agrupamento_id nenhum (ver SEM_AGRUPAMENTO).
  const opcoesAgrupamento = useMemo(
    () => [
      ...agrupamentos.map((agrupamento) => ({ value: agrupamento.id, label: agrupamento.nome })),
      { value: SEM_AGRUPAMENTO, label: 'Sem Agrupamento' },
    ],
    [agrupamentos]
  );

  // Aplica os filtros por cima da matriz: filtra fases por nome (Etapa Atual), filtra os
  // empreendimentos de cada fase por nome/micro etapa/classificação/agrupamento, e descarta fase
  // que ficou sem nenhum empreendimento POR CAUSA do filtro — mas preserva a fase genuinamente
  // vazia (sem nenhum empreendimento na Actioon) quando nenhum filtro de item está ativo, já que
  // aí o "vazio" não veio do filtro.
  const matrizFiltrada = useMemo(() => {
    const semFiltroDeItem =
      filtroEmpreendimento == null &&
      filtroMicroEtapa == null &&
      filtroAgrupamento == null &&
      filtroClassificacao.length === 0;
    return (matriz || [])
      .filter((fase) => passaNoFiltro(filtroEtapaAtual, fase.name))
      .map((fase) => ({
        ...fase,
        empreendimentos: fase.empreendimentos.filter(
          (emp) =>
            passaNoFiltro(filtroEmpreendimento, emp.name) &&
            passaNoFiltro(filtroMicroEtapa, emp.microEtapaAtual) &&
            passaNoFiltro(filtroAgrupamento, emp.agrupamentoId ?? SEM_AGRUPAMENTO) &&
            (filtroClassificacao.length === 0 || filtroClassificacao.includes(emp.classificacao))
        ),
      }))
      .filter((fase) => fase.empreendimentos.length > 0 || semFiltroDeItem);
  }, [matriz, filtroEtapaAtual, filtroEmpreendimento, filtroMicroEtapa, filtroAgrupamento, filtroClassificacao]);

  // Totalizador do rodapé — soma as colunas somáveis (Duração até Contas a Pagar). Sempre a
  // partir da matriz JÁ FILTRADA — os totais têm que refletir só o que está visível na tela.
  const totais = useMemo(() => {
    const todosEmpreendimentos = matrizFiltrada.flatMap((fase) => fase.empreendimentos);
    return { qtdEmpreendimentos: todosEmpreendimentos.length, ...somarEmpreendimentos(todosEmpreendimentos) };
  }, [matrizFiltrada]);

  const semResultadoFiltro = Boolean(matriz && matriz.length > 0 && matrizFiltrada.length === 0);

  // Colapsar/expandir uma etapa (fase) inteira — começa sempre expandida (conjunto vazio,
  // pedido do usuário); clicar no "+"/"-" da coluna Etapa Atual alterna só aquela fase.
  const [fasesColapsadas, setFasesColapsadas] = useState(() => new Set());

  function toggleFase(faseId) {
    setFasesColapsadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(faseId)) proximo.delete(faseId);
      else proximo.add(faseId);
      return proximo;
    });
  }

  // Mesmo comportamento, um nível abaixo: colapsar/expandir um grupo de Micro Etapa Atual
  // dentro de uma fase (pedido do usuário — "mesmo comportamento do da etapa atual"). Também
  // começa sempre expandido.
  const [microEtapasColapsadas, setMicroEtapasColapsadas] = useState(() => new Set());

  function toggleMicroEtapa(chave) {
    setMicroEtapasColapsadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  // Menu de contexto (botão direito em cima da tabela) — só a opção "Exportar". Fecha ao clicar
  // em qualquer lugar ou rolar a página; abre de novo na posição do próximo botão direito.
  const [menuContexto, setMenuContexto] = useState(null); // { x, y } | null

  function handleContextMenu(e) {
    e.preventDefault();
    setMenuContexto({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!menuContexto) return;
    function fechar() {
      setMenuContexto(null);
    }
    // Sem listener de 'contextmenu' aqui de propósito: o MESMO botão direito que abre o menu
    // (handleContextMenu, no <div> da tabela) continua se propagando nativamente até a `window`
    // depois de rodar — se este efeito (que só passa a existir DEPOIS que `menuContexto` vira
    // não-nulo) também escutasse 'contextmenu', ele fechava o menu que acabou de abrir na
    // mesma sequência de clique (a `window` recebe o evento em seguida, ainda dentro do mesmo
    // clique). Um novo botão direito em cima da tabela já reposiciona o menu sozinho via
    // handleContextMenu — não precisa de um listener à parte pra isso.
    window.addEventListener('click', fechar);
    window.addEventListener('scroll', fechar, true);
    return () => {
      window.removeEventListener('click', fechar);
      window.removeEventListener('scroll', fechar, true);
    };
  }, [menuContexto]);

  // Aplica um formato de número do Excel (símbolos universais — o Excel troca "," e "." pelos
  // separadores certos conforme o idioma de quem abrir, então NÃO dá pra cravar "." de milhar
  // direto na string) em cada célula numérica de 1 coluna, pulando o cabeçalho (linha 0).
  function aplicarFormatoNumerico(planilha, XLSX, colunaIndex, formato) {
    const range = XLSX.utils.decode_range(planilha['!ref']);
    for (let linha = range.s.r + 1; linha <= range.e.r; linha++) {
      const endereco = XLSX.utils.encode_cell({ r: linha, c: colunaIndex });
      const celula = planilha[endereco];
      if (celula && celula.t === 'n') celula.z = formato;
    }
  }

  // Exporta a matriz JÁ FILTRADA pra Excel, de forma "empilhada" — 1 linha por empreendimento
  // com todas as colunas preenchidas (Fase/Tarefa/Empreendimento repetidos em cada linha), bem
  // diferente da grade visual da tela (que usa rowSpan pra não repetir). Termina com uma linha de
  // Total igual à do rodapé. Números saem como número de verdade (não string formatada) com um
  // formato de Excel aplicado por cima — assim o arquivo mostra "1.234,56" pro usuário e ainda dá
  // pra somar/filtrar as colunas dentro do próprio Excel. Só as colunas visíveis na tela (ver
  // painel lateral) entram no arquivo, na mesma ordem — o formato/título de cada uma vem de
  // COLUNAS. % Masa não entra na linha de Total (percentual não é uma grandeza que se soma).
  // Gera o .xlsx inteiramente no navegador (a matriz já filtrada já está em memória, sem precisar
  // buscar nada de novo no backend) — biblioteca carregada sob demanda (só quando o usuário
  // realmente exporta) pra não pesar no carregamento da página.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const valorExcel = (coluna, valor) => (coluna.excel.converter ? coluna.excel.converter(valor) : valor);
    const linhas = matrizFiltrada.flatMap((fase) =>
      fase.empreendimentos.map((emp) => ({
        Fase: fase.name,
        Tarefa: emp.microEtapaAtual || '',
        Empreendimento: emp.name,
        ...Object.fromEntries(
          colunas.map((coluna) => [coluna.excel.titulo, emp[coluna.chave] != null ? valorExcel(coluna, emp[coluna.chave]) : ''])
        ),
      }))
    );
    // Arredonda pra 2 casas — somar dezenas de valores com centavos em ponto flutuante gera
    // ruído tipo 13781669.180000002, que não existe nos valores de origem.
    const arredondar = (valor) => Math.round(valor * 100) / 100;
    linhas.push({
      Fase: 'Total',
      Tarefa: '',
      Empreendimento: totais.qtdEmpreendimentos,
      ...Object.fromEntries(
        colunas.map((coluna) => [coluna.excel.titulo, coluna.somavel ? arredondar(valorExcel(coluna, totais[coluna.chave])) : ''])
      ),
    });
    const planilha = XLSX.utils.json_to_sheet(linhas);
    // Índice das colunas (0-based): Fase=0, Tarefa=1, Empreendimento=2, e as visíveis de
    // COLUNAS a partir da 3, na mesma ordem.
    aplicarFormatoNumerico(planilha, XLSX, 2, '#,##0');
    colunas.forEach((coluna, i) => aplicarFormatoNumerico(planilha, XLSX, 3 + i, coluna.excel.formato));
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Empreendimentos Masa');
    XLSX.writeFile(livro, `empreendimentos-masa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {!carregando && !erro && matriz?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-gray-400">
          <span className="mr-1.5">Classificação:</span>
          {Object.entries(CLASSIFICACAO_CORES).map(([nome, cor]) => {
            const ativo = filtroClassificacao.includes(nome);
            return (
              <button
                key={nome}
                type="button"
                onClick={() => toggleFiltroClassificacao(nome)}
                title={`Filtrar por ${nome}`}
                aria-pressed={ativo}
                className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 transition ${
                  ativo ? 'bg-gray-100 text-gray-600 ring-1 ring-gray-300' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor.swatch}`} />
                {nome}
              </button>
            );
          })}
          {filtroClassificacao.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltroClassificacao([])}
              className="ml-1 text-gray-400 underline decoration-dotted hover:text-gray-600"
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={() => setPainelAberto(true)}
            title="Filtros e colunas"
            aria-pressed={filtroAgrupamento != null || !todasColunasVisiveis}
            className={`ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
              filtroAgrupamento != null || !todasColunasVisiveis
                ? 'border-primary-500 bg-primary-50 text-primary-600'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Filter size={15} />
          </button>
        </div>
      )}
      <div className="rounded-card bg-white shadow-card">
        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : matriz.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Building2 size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Nenhuma fase cadastrada na Actioon.</p>
          </div>
        ) : (
          // Sem overflow-x-auto aqui de propósito: qualquer overflow != visible num ancestral
          // entre o cabeçalho/totalizador e o <main> (mesmo só no eixo X) faz o CSS computar o
          // eixo Y como "auto" também (regra do browser: se um eixo não é "visible" o outro
          // para de ser), e isso quebra o `sticky` — ele passa a grudar no topo/rodapé DESTA div
          // (que nunca chega a rolar de verdade, já que a altura é automática) em vez do
          // <main>, que é quem realmente rola. Deixando sem overflow aqui, o scroll horizontal
          // (se precisar) acontece no próprio <main> (que já tem overflow-y-auto, logo o
          // browser computa overflow-x dele como auto também).
          <div className="rounded-card" onContextMenu={handleContextMenu}>
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-primary-700">
                  <th
                    ref={thEtapaAtualRef}
                    className="sticky -top-6 z-20 w-64 rounded-tl-card border-b-2 border-b-primary-500 bg-primary-50 px-2 py-2.5 text-center font-medium"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroEtapaAtual}
                        onChange={setFiltroEtapaAtual}
                        opcoes={opcoesEtapaAtual}
                        label="fase"
                        colunaRef={thEtapaAtualRef}
                      />
                      Fase
                    </span>
                  </th>
                  <th
                    ref={thMicroEtapaRef}
                    className="sticky -top-6 z-20 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroMicroEtapa}
                        onChange={setFiltroMicroEtapa}
                        opcoes={opcoesMicroEtapa}
                        label="tarefa"
                        colunaRef={thMicroEtapaRef}
                      />
                      Tarefa
                    </span>
                  </th>
                  <th
                    ref={thEmpreendimentoRef}
                    className={`sticky -top-6 z-20 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium ${
                      colunas.length === 0 ? 'rounded-tr-card' : ''
                    }`}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroEmpreendimento}
                        onChange={setFiltroEmpreendimento}
                        opcoes={opcoesEmpreendimento}
                        label="empreendimento"
                        colunaRef={thEmpreendimentoRef}
                      />
                      Empreendimento
                    </span>
                  </th>
                  {colunas.map((coluna, i) => (
                    <th
                      key={coluna.chave}
                      className={`sticky -top-6 z-20 ${coluna.largura} border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium ${
                        i === colunas.length - 1 ? 'rounded-tr-card' : ''
                      }`}
                    >
                      {coluna.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semResultadoFiltro && (
                  <tr>
                    <td colSpan={3 + colunas.length} className="py-12 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">Nenhuma linha corresponde aos filtros selecionados.</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
                        Ajuste os filtros de Fase, Empreendimento, Tarefa, Classificação ou Agrupamento pra ver as linhas de novo.
                      </p>
                    </td>
                  </tr>
                )}
                {matrizFiltrada.map((fase) => {
                  const colapsada = fasesColapsadas.has(fase.id);

                  // Fase colapsada — 1 linha só de resumo: Micro Etapa Atual e Empreendimento
                  // viram contagem, e Duração até Contas a Pagar somam a fase inteira (pedido do
                  // usuário).
                  if (colapsada) {
                    const resumo = calcularResumoFase(fase);
                    return (
                      <tr key={fase.id}>
                        <td className="border-b-2 border-b-gray-400 border-r border-r-gray-200 bg-white px-4 py-2.5 align-middle">
                          <button
                            type="button"
                            onClick={() => toggleFase(fase.id)}
                            className="flex items-center gap-2 text-left"
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                              <Plus size={10} />
                            </span>
                            <span className="text-xs font-semibold text-gray-900">{fase.name}</span>
                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                              {fase.empreendimentos.length}
                            </span>
                          </button>
                        </td>
                        <td className="border-b-2 border-b-gray-400 border-l border-l-gray-200 py-1.5 pl-4 text-xs tabular-nums text-gray-700">
                          {resumo.qtdMicroEtapas}
                        </td>
                        <td className="border-b-2 border-b-gray-400 border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700">
                          {resumo.qtdEmpreendimentos}
                        </td>
                        {colunas.map((coluna) => (
                          <CelulaResumo key={coluna.chave} coluna={coluna} resumo={resumo} borda="border-b-2 border-b-gray-400" />
                        ))}
                      </tr>
                    );
                  }

                  const { linhas, total } = construirLinhasFase(fase, microEtapasColapsadas);

                  return (
                    <Fragment key={fase.id}>
                      {linhas.map((linha, i) => {
                        const empreendimento = linha.tipo === 'empreendimento' ? linha.empreendimento : null;
                        // Última linha da fase — borda de baixo mais grossa/escura pra marcar
                        // bem a separação entre uma etapa e a próxima (pedido do usuário).
                        const bordaInferior = linha.ultimaDaFase
                          ? 'border-b-2 border-b-gray-400'
                          : 'border-b border-b-gray-200';
                        // Idem, mas pro fim de cada GRUPO de Micro Etapa Atual — só fica forte
                        // quando o grupo também é o último da fase (senão vira uma borda comum,
                        // já que ainda tem mais empreendimento da mesma fase abaixo).
                        const bordaGrupo = linha.grupoTerminaNaFase
                          ? 'border-b-2 border-b-gray-400'
                          : 'border-b border-b-gray-200';

                        const celulaEtapaAtual = linha.primeiraDaFase && (
                          <td
                            rowSpan={total}
                            className="border-b-2 border-b-gray-400 border-r border-r-gray-200 bg-white px-4 py-2.5 align-middle"
                          >
                            <button type="button" onClick={() => toggleFase(fase.id)} className="flex items-center gap-2 text-left">
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                <Minus size={10} />
                              </span>
                              <span className="text-xs font-semibold text-gray-900">{fase.name}</span>
                              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                {fase.empreendimentos.length}
                              </span>
                            </button>
                          </td>
                        );

                        // Grupo de Micro Etapa Atual colapsado (pedido do usuário: "mesmo
                        // comportamento do da etapa atual") — 1 linha de resumo só: Empreendimento
                        // vira contagem, Duração até Contas a Pagar somam só os empreendimentos
                        // DAQUELE grupo (não a fase inteira).
                        if (linha.tipo === 'grupoColapsado') {
                          const resumoGrupo = somarEmpreendimentos(linha.grupo.empreendimentos);
                          return (
                            <tr key={`${fase.id}-grupo-${linha.grupo.chave}`}>
                              {celulaEtapaAtual}
                              <td
                                className={`${bordaGrupo} border-l border-l-gray-200 bg-white px-4 py-2.5 align-middle text-xs text-gray-700`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleMicroEtapa(linha.grupo.chave)}
                                  className="flex items-start gap-2 text-left"
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                    <Plus size={10} />
                                  </span>
                                  <span className="flex-1">
                                    {linha.grupo.microEtapaAtual || <span className="text-gray-300">—</span>}
                                  </span>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                    {linha.grupo.empreendimentos.length}
                                  </span>
                                </button>
                              </td>
                              <td className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}>
                                {linha.grupo.empreendimentos.length}
                              </td>
                              {colunas.map((coluna) => (
                                <CelulaResumo key={coluna.chave} coluna={coluna} resumo={resumoGrupo} borda={bordaInferior} />
                              ))}
                            </tr>
                          );
                        }

                        // Fundo colorido (versão clara da cor da legenda) em toda a linha do
                        // empreendimento, de acordo com sua classificação — pedido do usuário
                        // ("quero que o fundo dele seja colorido... de acordo com a legenda").
                        // Só nas células do próprio empreendimento: "Etapa Atual" e "Micro Etapa
                        // Atual" ficam de fora porque a célula é compartilhada (rowSpan) por
                        // vários empreendimentos que podem ter classificações diferentes.
                        const corFundo = empreendimento
                          ? CLASSIFICACAO_CORES[empreendimento.classificacao]?.fundo || ''
                          : '';

                        return (
                          <tr key={`${fase.id}-${empreendimento?.id ?? 'vazia'}-${i}`}>
                            {celulaEtapaAtual}
                            {linha.primeiraDoGrupo && (
                              <td
                                rowSpan={linha.tamanhoGrupo}
                                className={`${bordaGrupo} border-l border-l-gray-200 bg-white px-4 py-2.5 align-middle text-xs text-gray-700`}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleMicroEtapa(linha.grupoChave)}
                                  className="flex items-start gap-2 text-left"
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                    <Minus size={10} />
                                  </span>
                                  <span className="flex-1">{linha.microEtapaAtual || <span className="text-gray-300">—</span>}</span>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                    {linha.tamanhoGrupo}
                                  </span>
                                </button>
                              </td>
                            )}
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs text-gray-700 ${corFundo}`}
                              title={empreendimento?.classificacao || undefined}
                            >
                              {empreendimento ? (
                                empreendimento.name
                              ) : (
                                <span className="italic text-gray-400">Nenhum empreendimento nesta fase.</span>
                              )}
                            </td>
                            {colunas.map((coluna) => (
                              <td
                                key={coluna.chave}
                                className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700 ${corFundo}`}
                              >
                                {empreendimento?.[coluna.chave] != null ? (
                                  coluna.formatar(empreendimento[coluna.chave])
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              {/* Totalizador fixo — `sticky bottom-0` em cada <td> gruda no rodapé do container
                  que rola (o <main> do AppShell) até o fim da tabela, onde assenta naturalmente.
                  Cabeçalho segue a mesma ideia (`sticky top-0`), pra ficar visível a rolagem
                  inteira igual ao totalizador. O offset é `-bottom-6`/`-top-6` (não 0) pra
                  cancelar o `p-6` do <main> — sem isso sobraria uma faixa de 24px do padding
                  entre a barra grudada e a borda de verdade da tela (pedido do usuário: "o mais
                  encostado possível"). */}
              <tfoot>
                <tr className="text-xs font-semibold text-primary-700">
                  <td
                    colSpan={2}
                    className="sticky -bottom-6 z-10 rounded-bl-card border-t-2 border-t-primary-500 bg-primary-50 px-4 py-2.5"
                  >
                    Total
                  </td>
                  <td
                    className={`sticky -bottom-6 z-10 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums ${
                      colunas.length === 0 ? 'rounded-br-card' : ''
                    }`}
                  >
                    {totais.qtdEmpreendimentos}
                  </td>
                  {colunas.map((coluna, i) => (
                    <td
                      key={coluna.chave}
                      className={`sticky -bottom-6 z-10 ${coluna.largura} border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums ${
                        coluna.somavel ? '' : 'text-primary-300'
                      } ${i === colunas.length - 1 ? 'rounded-br-card' : ''}`}
                    >
                      {coluna.somavel ? coluna.formatar(totais[coluna.chave]) : '—'}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {menuContexto &&
        createPortal(
          <div
            style={{ position: 'fixed', top: menuContexto.y, left: menuContexto.x }}
            className="z-100 min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={handleExportar}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileDown size={14} className="text-gray-400" />
              Exportar
            </button>
          </div>,
          document.body
        )}

      {/* Painel lateral de filtros — mesmo padrão do Espião NFe/NFSe (EspiaoNfeNfsePage.jsx):
          sempre montado pra transição de translate funcionar (fechado fica fora da tela em vez de
          desmontar), com um fundo escurecido bem sutil que fecha o painel ao clicar. */}
      <div className={`fixed inset-0 z-50 ${painelAberto ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 cursor-pointer bg-black/10 transition-opacity duration-300 ${
            painelAberto ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setPainelAberto(false)}
        />
        <div
          className={`absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-card transition-transform duration-300 ${
            painelAberto ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Filtros</h2>
            <button type="button" onClick={() => setPainelAberto(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Agrupamento</label>
              <SearchableSelect
                multiple
                selecionarTodos
                value={valoresDoFiltro(filtroAgrupamento, opcoesAgrupamento)}
                onChange={(selecionados) => setFiltroAgrupamento(proximoFiltro(selecionados, opcoesAgrupamento))}
                options={opcoesAgrupamento}
                placeholder="Nenhum"
                emptyMessage="Nenhum agrupamento encontrado."
                corClasses={filtroAgrupamento != null ? 'border-primary-500' : 'border-gray-200'}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Colunas</span>
                <button
                  type="button"
                  onClick={toggleTodasColunas}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  {todasColunasVisiveis ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {COLUNAS.map((coluna) => (
                  <label
                    key={coluna.chave}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={colunasVisiveis.has(coluna.chave)}
                      onChange={() => toggleColuna(coluna.chave)}
                      className="h-4 w-4 cursor-pointer accent-primary-600"
                    />
                    {coluna.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">Fase, Tarefa e Empreendimento aparecem sempre.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
