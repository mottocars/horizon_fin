import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, FileDown, Minus, Plus, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';
import RotuloAgrupador from '../../../components/RotuloAgrupador';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { getMatrizRepassesCef } from '../../../api/relatorioRepassesCef.api';
import { MACRO_ETAPAS_REPASSES } from '../../../config/macroEtapasRepasses';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';

const MACRO_POR_VALOR = Object.fromEntries(MACRO_ETAPAS_REPASSES.map((m) => [m.value, m]));

// O número que acompanha o nome do cliente e o que a "Data Etapa" representa em cada macro
// etapa: código da reserva na Reserva, contrato Sienge no Contrato e contrato Caixa na
// Assinatura/Registro. O Excel abre uma coluna pra cada um (ver handleExportar).
const DOCUMENTO_POR_MACRO = {
  VENDA: { titulo: 'Código da reserva', tituloData: 'Data da reserva' },
  CONTRATO: { titulo: 'Contrato Sienge', tituloData: 'Data do contrato Sienge' },
  ASSINATURA: { titulo: 'Contrato Caixa', tituloData: 'Data da assinatura' },
  REGISTRO: { titulo: 'Contrato Caixa', tituloData: 'Data do registro' },
};

const MICRO_SEM_ETAPA = 'Sem etapa registrada';

// Situação do cliente frente ao SLA da micro etapa atual. Sem micro etapa registrada, ou
// micro etapa sem SLA configurado em Máscaras, não tem como estar atrasado.
const SITUACOES_SLA = {
  atrasado: { label: 'SLA atrasado', swatch: 'bg-red-500' },
  no_prazo: { label: 'No prazo', swatch: 'bg-emerald-500' },
  sem_sla: { label: 'Sem SLA', swatch: 'bg-gray-300' },
};

function situacaoSla(cliente) {
  if (cliente.microId === 0 || cliente.slaMicroEtapa == null || cliente.diasMicroEtapa == null) return 'sem_sla';
  return cliente.diasMicroEtapa > cliente.slaMicroEtapa ? 'atrasado' : 'no_prazo';
}

function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDias(dias) {
  if (dias == null) return null;
  return `${dias.toLocaleString('pt-BR')} ${dias === 1 ? 'dia' : 'dias'}`;
}

// Dias Etapa / Dias Micro Etapa mostram só o número — o título da coluna já diz que é dia.
function formatarNumero(valor) {
  return valor.toLocaleString('pt-BR');
}

function media(clientes, campo) {
  const valores = clientes.map((c) => c[campo]).filter((v) => v != null);
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
}

function Vazio() {
  return <span className="text-gray-300">—</span>;
}

function ResumoMedia({ clientes, campo }) {
  const valor = media(clientes, campo);
  if (valor == null) return <Vazio />;
  return (
    <span title="Média dos clientes do grupo">
      <span className="text-[10px] uppercase tracking-wide text-gray-400">média </span>
      {formatarNumero(valor)}
    </span>
  );
}

function ResumoAtrasados({ clientes }) {
  const atrasados = clientes.filter((c) => c.situacaoSla === 'atrasado').length;
  if (atrasados === 0) return <span className="text-gray-400">nenhum atrasado</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      {atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}
    </span>
  );
}

// Colunas analíticas — as que o usuário pode mostrar/esconder no painel lateral (Centro de
// Custo, Macro Etapa, Micro Etapa e Cliente são fixas). `celula` desenha o valor de 1
// cliente; `resumo` o de um grupo recolhido e do totalizador.
const COLUNAS = [
  {
    chave: 'dataEtapa',
    label: 'Data Etapa',
    largura: 'w-24 2xl:w-28',
    celula: (c) =>
      c.dataEtapa ? <span title={DOCUMENTO_POR_MACRO[c.macro].tituloData}>{formatarData(c.dataEtapa)}</span> : <Vazio />,
    resumo: () => <Vazio />,
  },
  {
    chave: 'diasEtapa',
    label: 'Dias Etapa',
    largura: 'w-24 2xl:w-28',
    celula: (c) => (c.diasEtapa != null ? formatarNumero(c.diasEtapa) : <Vazio />),
    resumo: (clientes) => <ResumoMedia clientes={clientes} campo="diasEtapa" />,
  },
  {
    chave: 'diasMicroEtapa',
    label: 'Dias Micro Etapa',
    largura: 'w-24 2xl:w-28',
    celula: (c) =>
      c.diasMicroEtapa != null ? (
        <span className={c.situacaoSla === 'atrasado' ? 'font-semibold text-red-600' : ''}>{formatarNumero(c.diasMicroEtapa)}</span>
      ) : (
        <Vazio />
      ),
    resumo: (clientes) => <ResumoMedia clientes={clientes} campo="diasMicroEtapa" />,
  },
  {
    chave: 'slaMicroEtapa',
    label: 'SLA Micro Etapa',
    largura: 'w-32 2xl:w-40',
    celula: (c) => {
      if (c.microId === 0) return <Vazio />;
      if (c.slaMicroEtapa == null) return <span className="text-gray-400" title="Micro etapa sem SLA configurado em Máscaras">sem SLA</span>;
      const excedido = c.diasMicroEtapa - c.slaMicroEtapa;
      return (
        <span className="inline-flex items-center gap-1.5">
          {formatarDias(c.slaMicroEtapa)}
          {c.situacaoSla === 'atrasado' ? (
            <span
              className="rounded-full bg-red-100 px-1.5 py-px text-[10px] font-semibold text-red-700"
              title={`${formatarDias(excedido)} além do SLA`}
            >
              +{excedido}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">no prazo</span>
          )}
        </span>
      );
    },
    resumo: (clientes) => <ResumoAtrasados clientes={clientes} />,
  },
];

const B_CENTRO = 'border-b-2 border-b-gray-400';
const B_MACRO = 'border-b border-b-gray-300';
const B_LINHA = 'border-b border-b-gray-200';

// Monta a árvore Centro de Custo → Macro Etapa → Micro Etapa → Clientes a partir da lista
// plana (já filtrada). Centros da maior média de Dias Etapa pra menor (Registro não conta
// dias, então fica fora da média), macros na ordem do funil (Reserva → Registro), micros na
// sequência cadastrada em Máscaras com a 0 ("Sem etapa registrada") primeiro, e clientes de
// quem está há mais tempo na etapa (data da etapa mais antiga) pro mais recente.
function construirArvore(clientes) {
  const centros = new Map();
  for (const c of clientes) {
    if (!centros.has(c.centroId)) centros.set(c.centroId, { id: c.centroId, nome: c.centroNome, clientes: [], macros: new Map() });
    const centro = centros.get(c.centroId);
    centro.clientes.push(c);
    if (!centro.macros.has(c.macro)) {
      centro.macros.set(c.macro, { value: c.macro, chave: `${c.centroId}::${c.macro}`, clientes: [], micros: new Map() });
    }
    const macro = centro.macros.get(c.macro);
    macro.clientes.push(c);
    if (!macro.micros.has(c.microId)) {
      macro.micros.set(c.microId, {
        id: c.microId,
        chave: `${macro.chave}::${c.microId}`,
        rotulo: c.rotuloMicro,
        sequencia: c.sequenciaMicro,
        clientes: [],
      });
    }
    macro.micros.get(c.microId).clientes.push(c);
  }

  const ordemMacro = (v) => MACRO_POR_VALOR[v]?.numero ?? 99;
  return [...centros.values()]
    .map((centro) => ({ ...centro, mediaDiasEtapa: media(centro.clientes, 'diasEtapa') }))
    .sort((a, b) => (b.mediaDiasEtapa ?? -1) - (a.mediaDiasEtapa ?? -1) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((centro) => ({
      ...centro,
      macros: [...centro.macros.values()]
        .sort((a, b) => ordemMacro(a.value) - ordemMacro(b.value))
        .map((macro) => ({
          ...macro,
          micros: [...macro.micros.values()]
            .sort((a, b) => a.sequencia - b.sequencia)
            .map((micro) => ({
              ...micro,
              // Pela data da etapa (e não por Dias Etapa) pra valer também no Registro, que não
              // conta dias; sem data vai pro fim.
              clientes: [...micro.clientes].sort(
                (a, b) =>
                  (a.dataEtapa || '9999').localeCompare(b.dataEtapa || '9999') ||
                  a.rotuloCliente.localeCompare(b.rotuloCliente, 'pt-BR')
              ),
            })),
        })),
    }));
}

// Achata um centro expandido em linhas de tabela, já com o que o JSX precisa pra cada célula
// agrupadora (rowSpan de Centro/Macro/Micro na 1ª linha de cada grupo) e pra borda de baixo:
// fim do centro = borda grossa, fim de macro = média, demais = fina. Macro ou Micro recolhida
// vira 1 linha só de resumo (e o rowSpan dos níveis de cima já conta esse tamanho reduzido).
function construirLinhasCentro(centro, macrosColapsadas, microsColapsadas) {
  const macros = centro.macros.map((macro) => {
    const colapsado = macrosColapsadas.has(macro.chave);
    const micros = macro.micros.map((micro) => {
      const microColapsado = microsColapsadas.has(micro.chave);
      return { ...micro, colapsado: microColapsado, tamanho: microColapsado ? 1 : micro.clientes.length };
    });
    return { ...macro, colapsado, micros, tamanho: colapsado ? 1 : micros.reduce((s, m) => s + m.tamanho, 0) };
  });
  const total = macros.reduce((s, m) => s + m.tamanho, 0);

  const linhas = [];
  macros.forEach((macro, iMacro) => {
    const ultimaMacro = iMacro === macros.length - 1;
    if (macro.colapsado) {
      linhas.push({ tipo: 'macroColapsada', macro, ultimaMacro, primeiraDoCentro: linhas.length === 0, ultimaDoCentro: ultimaMacro });
      return;
    }
    macro.micros.forEach((micro, iMicro) => {
      const ultimaMicro = iMicro === macro.micros.length - 1;
      const base = { macro, micro, ultimaMacro, ultimaMicro, primeiraDaMacro: iMicro === 0 };
      if (micro.colapsado) {
        linhas.push({
          tipo: 'microColapsada',
          ...base,
          primeiraDoCentro: linhas.length === 0,
          ultimaDaMacro: ultimaMicro,
          ultimaDoCentro: ultimaMacro && ultimaMicro,
        });
        return;
      }
      micro.clientes.forEach((cliente, iCliente) => {
        const ultimoCliente = iCliente === micro.clientes.length - 1;
        linhas.push({
          tipo: 'cliente',
          ...base,
          cliente,
          primeiraDoCentro: linhas.length === 0,
          primeiraDaMacro: iMicro === 0 && iCliente === 0,
          primeiraDaMicro: iCliente === 0,
          ultimaDaMacro: ultimaMicro && ultimoCliente,
          ultimaDoCentro: ultimaMacro && ultimaMicro && ultimoCliente,
        });
      });
    });
  });
  return { linhas, total };
}

function bordaDaLinha(linha) {
  if (linha.ultimaDoCentro) return B_CENTRO;
  if (linha.ultimaDaMacro) return B_MACRO;
  return B_LINHA;
}

function RotuloMacro({ value }) {
  const macro = MACRO_POR_VALOR[value];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {macro?.logo && <img src={macro.logo} alt="" title={macro.integracaoNome} className="h-3.5 w-3.5 shrink-0 object-contain" />}
      {macro?.label || value}
    </span>
  );
}

function CelulaContagem({ valor, borda, fundo = '' }) {
  return <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4 ${fundo}`}>{valor}</td>;
}

function CelulasResumo({ colunas, clientes, borda, fundo = '' }) {
  return colunas.map((coluna) => (
    <td key={coluna.chave} className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4 ${fundo}`}>
      {coluna.resumo(clientes)}
    </td>
  ));
}

// Relatório Repasses CEF: os mesmos clientes do Kanban de Repasses CEF (mesmos buckets e
// filtros — ver relatorioRepassesCef.service.js no backend), no layout em matriz do relatório
// Empreendimentos Masa, com drilldown Centro de Custo → Macro Etapa → Micro Etapa → Cliente.
// Cliente = número da etapa (reserva, contrato Sienge ou contrato Caixa) + nome, pra um mesmo nome
// em duas linhas não se juntar.
export default function RepassesCefRelatorioPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [filtroCentro, setFiltroCentro] = useState(null);
  const [filtroMacro, setFiltroMacro] = useState(null);
  const [filtroMicro, setFiltroMicro] = useState(null);
  const [filtroCliente, setFiltroCliente] = useState(null);
  const colunas = COLUNAS;

  const thCentroRef = useRef(null);
  const thMacroRef = useRef(null);
  const thMicroRef = useRef(null);
  const thClienteRef = useRef(null);
  const theadRef = useRef(null);
  const [alturaCabecalho, setAlturaCabecalho] = useState(48);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  const opcoesEmpresa = useMemo(
    () =>
      empresas
        .filter((e) => !empresaIds || empresaIds.includes(String(e.id)))
        .map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })),
    [empresas, empresaIds]
  );

  // Uma empresa só disponível — já vem escolhida.
  useEffect(() => {
    if (!empresaId && opcoesEmpresa.length === 1) setEmpresaId(opcoesEmpresa[0].value);
  }, [empresaId, opcoesEmpresa]);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setDados(null);
      return Promise.resolve();
    }
    setCarregando(true);
    setErro('');
    return getMatrizRepassesCef(empresaId)
      .then(setDados)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar o relatório de Repasses CEF.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setFiltroCentro(null);
    setFiltroMacro(null);
    setFiltroMicro(null);
    setFiltroCliente(null);
    carregar();
  }, [carregar]);

  // Enriquece cada cliente com os rótulos exibidos (e usados nos filtros) e a situação de SLA.
  const clientes = useMemo(() => {
    if (!dados) return [];
    const microPorId = new Map(dados.microEtapas.map((m) => [m.id, m]));
    return dados.clientes.map((c) => {
      const micro = microPorId.get(c.microId);
      return {
        ...c,
        // Reserva: código da reserva; Contrato: contrato Sienge; Assinatura/Registro: contrato
        // Caixa — sempre único, então o mesmo nome em duas linhas não se junta.
        rotuloCliente: `${c.documento || c.codigo} - ${c.cliente || 'Cliente não informado'}`,
        rotuloMicro: micro ? `${micro.sequencia} - ${micro.descricao || 'Sem descrição'}` : `0 - ${MICRO_SEM_ETAPA}`,
        sequenciaMicro: micro ? micro.sequencia : 0,
        situacaoSla: situacaoSla(c),
      };
    });
  }, [dados]);

  // Opções dos filtros sempre a partir da lista crua (não da filtrada), pra não encolherem
  // conforme o usuário filtra outra coluna.
  const opcoesCentro = useMemo(() => {
    const nomes = [...new Set(clientes.map((c) => c.centroNome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return nomes.map((n) => ({ value: n, label: n }));
  }, [clientes]);

  const opcoesMacro = useMemo(() => {
    const presentes = new Set(clientes.map((c) => c.macro));
    return MACRO_ETAPAS_REPASSES.filter((m) => presentes.has(m.value)).map((m) => ({ value: m.value, label: m.label }));
  }, [clientes]);

  const opcoesMicro = useMemo(() => {
    const porRotulo = new Map();
    for (const c of clientes) porRotulo.set(c.rotuloMicro, c.sequenciaMicro);
    return [...porRotulo.entries()]
      .sort(([ra, sa], [rb, sb]) => sa - sb || ra.localeCompare(rb, 'pt-BR'))
      .map(([rotulo]) => ({ value: rotulo, label: rotulo }));
  }, [clientes]);

  const opcoesCliente = useMemo(() => {
    const rotulos = [...new Set(clientes.map((c) => c.rotuloCliente))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    return rotulos.map((r) => ({ value: r, label: r }));
  }, [clientes]);

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter(
        (c) =>
          passaNoFiltro(filtroCentro, c.centroNome) &&
          passaNoFiltro(filtroMacro, c.macro) &&
          passaNoFiltro(filtroMicro, c.rotuloMicro) &&
          passaNoFiltro(filtroCliente, c.rotuloCliente)
      ),
    [clientes, filtroCentro, filtroMacro, filtroMicro, filtroCliente]
  );

  const arvore = useMemo(() => construirArvore(clientesFiltrados), [clientesFiltrados]);

  const filtroAtivo = [filtroCentro, filtroMacro, filtroMicro, filtroCliente].some((f) => f != null);

  function limparFiltros() {
    setFiltroCentro(null);
    setFiltroMacro(null);
    setFiltroMicro(null);
    setFiltroCliente(null);
  }

  // Centros começam recolhidos (como as fases do Masa); Macro e Micro começam abertas dentro
  // de um centro aberto.
  const [centrosExpandidos, setCentrosExpandidos] = useState(() => new Set());
  const [macrosColapsadas, setMacrosColapsadas] = useState(() => new Set());
  const [microsColapsadas, setMicrosColapsadas] = useState(() => new Set());
  const tudoExpandido = arvore.length > 0 && arvore.every((c) => centrosExpandidos.has(c.id));

  function alternar(setter, chave) {
    setter((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function toggleTudo() {
    if (tudoExpandido) {
      setCentrosExpandidos(new Set());
    } else {
      setCentrosExpandidos(new Set(arvore.map((c) => c.id)));
      setMacrosColapsadas(new Set());
      setMicrosColapsadas(new Set());
    }
  }

  // Menu de contexto (botão direito na tabela) com "Exportar" — mesmo comportamento do Masa.
  const [menuContexto, setMenuContexto] = useState(null);

  function handleContextMenu(e) {
    e.preventDefault();
    setMenuContexto({ x: e.clientX, y: e.clientY });
  }

  useEffect(() => {
    if (!menuContexto) return;
    function fechar() {
      setMenuContexto(null);
    }
    window.addEventListener('click', fechar);
    window.addEventListener('scroll', fechar, true);
    return () => {
      window.removeEventListener('click', fechar);
      window.removeEventListener('scroll', fechar, true);
    };
  }, [menuContexto]);

  // Exporta os clientes JÁ FILTRADOS, 1 linha por cliente, na mesma ordem da tela — e aqui sim
  // com uma coluna pra cada informação analítica (Código Reserva, Data Reserva, Contrato
  // Sienge, ...), preenchida só na macro etapa a que pertence. Datas saem como data de verdade
  // e dias como número, pra dar pra filtrar/somar no Excel.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const data = (iso) => {
      if (!iso) return '';
      const [ano, mes, dia] = iso.split('-').map(Number);
      return new Date(ano, mes - 1, dia);
    };
    const linhas = [];
    for (const centro of arvore) {
      for (const macro of centro.macros) {
        for (const micro of macro.micros) {
          for (const c of micro.clientes) {
            linhas.push({
              'Centro de Custo': centro.nome,
              'Macro Etapa': MACRO_POR_VALOR[c.macro]?.label || c.macro,
              'Micro Etapa': c.rotuloMicro,
              Cliente: c.rotuloCliente,
              'Código Reserva': c.idreserva ?? '',
              'Data Reserva': c.macro === 'VENDA' ? data(c.dataEtapa) : '',
              'Contrato Sienge': c.macro === 'CONTRATO' ? c.documento || '' : '',
              'Data Contrato Sienge': c.macro === 'CONTRATO' ? data(c.dataEtapa) : '',
              'Contrato CEF': c.macro === 'ASSINATURA' || c.macro === 'REGISTRO' ? c.documento || '' : '',
              'Data Assinatura': c.macro === 'ASSINATURA' ? data(c.dataEtapa) : '',
              'Data Registro': c.macro === 'REGISTRO' ? data(c.dataEtapa) : '',
              'Dias Etapa': c.diasEtapa ?? '',
              'Dias Micro Etapa': c.diasMicroEtapa ?? '',
              'SLA Micro Etapa (dias)': c.slaMicroEtapa ?? '',
              'Situação SLA': SITUACOES_SLA[c.situacaoSla].label,
            });
          }
        }
      }
    }
    const planilha = XLSX.utils.json_to_sheet(linhas, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    planilha['!cols'] = [28, 12, 34, 44, 14, 13, 18, 18, 16, 15, 14, 11, 15, 20, 14].map((wch) => ({ wch }));
    planilha['!autofilter'] = { ref: planilha['!ref'] };
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Repasses CEF');
    XLSX.writeFile(livro, `repasses-cef_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.getBoundingClientRect().height);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [dados, colunas]);
  const topoRotuloGrudado = alturaCabecalho - 24 + 8;

  const semResultadoFiltro = clientes.length > 0 && clientesFiltrados.length === 0;
  const temDados = !carregando && !erro && clientes.length > 0;
  const COLUNAS_FIXAS = 4;

  function cabecalho(ref, filtro, setFiltro, opcoes, labelFiltro, titulo, classes) {
    return (
      <th
        ref={ref}
        className={`sticky -top-6 z-20 border-b-2 border-b-primary-500 bg-primary-50 px-2 py-2.5 text-center font-medium ${classes}`}
      >
        <span className="inline-flex items-center justify-center gap-1.5">
          <FiltroColuna filtro={filtro} onChange={setFiltro} opcoes={opcoes} label={labelFiltro} colunaRef={ref} />
          {titulo}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho no mesmo padrão do Acervo NF-e / NFS-e. Exportar fica só no botão direito em
          cima da tabela. */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 lg:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={(v) => setEmpresaId(v || '')}
              disabled={carregandoEmpresas || empresaTravada}
              options={opcoesEmpresa}
              placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
          {filtroAtivo && (
            <button
              type="button"
              onClick={limparFiltros}
              className="self-start text-xs text-gray-400 underline decoration-dotted hover:text-gray-600 lg:mb-2.5 lg:self-end"
            >
              Mostrar tudo
            </button>
          )}
          {temDados && (
            <button
              type="button"
              onClick={toggleTudo}
              disabled={arvore.length === 0}
              className="inline-flex items-center gap-1.5 self-start py-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50 lg:ml-auto lg:self-end"
            >
              {tudoExpandido ? <Minus size={14} /> : <Plus size={14} />}
              {tudoExpandido ? 'Recolher' : 'Expandir'}
            </button>
          )}
        </div>
      </Card>

      <div className="rounded-card bg-white shadow-card">
        {!empresaId ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Banknote size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Selecione uma empresa para ver o relatório.</p>
          </div>
        ) : carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : clientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Banknote size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Nenhum cliente no Kanban de Repasses CEF desta empresa.</p>
            <p className="max-w-sm text-xs text-gray-400">
              Entram só centros de custo com a etapa &quot;Lançamento&quot; e os filtros salvos em &quot;Configurar Filtros de
              Visualização&quot; do Kanban.
            </p>
          </div>
        ) : (
          // Sem overflow aqui de propósito — mesmo motivo do Masa: qualquer overflow num
          // ancestral quebra o `sticky` do cabeçalho/totalizador em relação ao <main>.
          <div className="rounded-card" onContextMenu={handleContextMenu}>
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-wide text-primary-700">
                  {cabecalho(thCentroRef, filtroCentro, setFiltroCentro, opcoesCentro, 'centro de custo', 'Centro de Custo', 'w-36 rounded-tl-card 2xl:w-64 min-[1800px]:w-72')}
                  {cabecalho(thMacroRef, filtroMacro, setFiltroMacro, opcoesMacro, 'macro etapa', 'Macro Etapa', 'w-28 border-l border-l-primary-100 2xl:w-36')}
                  {cabecalho(thMicroRef, filtroMicro, setFiltroMicro, opcoesMicro, 'micro etapa', 'Micro Etapa', 'w-32 border-l border-l-primary-100 2xl:w-48 min-[1800px]:w-64')}
                  {cabecalho(
                    thClienteRef,
                    filtroCliente,
                    setFiltroCliente,
                    opcoesCliente,
                    'cliente',
                    'Cliente',
                    `border-l border-l-primary-100 ${colunas.length === 0 ? 'rounded-tr-card' : ''}`
                  )}
                  {colunas.map((coluna, i) => (
                    <th
                      key={coluna.chave}
                      className={`sticky -top-6 z-20 ${coluna.largura} border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-1 py-2.5 text-center font-medium 2xl:px-2 ${
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
                    <td colSpan={COLUNAS_FIXAS + colunas.length} className="py-12 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">Nenhum cliente corresponde aos filtros selecionados.</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
                        Ajuste os filtros de Centro de Custo, Macro Etapa, Micro Etapa ou Cliente pra ver as linhas de novo.
                      </p>
                    </td>
                  </tr>
                )}
                {arvore.map((centro) => {
                  if (!centrosExpandidos.has(centro.id)) {
                    const qtdMicros = centro.macros.reduce((s, m) => s + m.micros.length, 0);
                    return (
                      <tr key={centro.id}>
                        <td className={`${B_CENTRO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                          <RotuloAgrupador
                            aberto={false}
                            negrito
                            nome={centro.nome}
                            contagem={centro.clientes.length}
                            onClick={() => alternar(setCentrosExpandidos, centro.id)}
                          />
                        </td>
                        <CelulaContagem valor={centro.macros.length} borda={B_CENTRO} />
                        <CelulaContagem valor={qtdMicros} borda={B_CENTRO} />
                        <CelulaContagem valor={centro.clientes.length} borda={B_CENTRO} />
                        <CelulasResumo colunas={colunas} clientes={centro.clientes} borda={B_CENTRO} />
                      </tr>
                    );
                  }

                  const { linhas, total } = construirLinhasCentro(centro, macrosColapsadas, microsColapsadas);
                  return (
                    <Fragment key={centro.id}>
                      {linhas.map((linha, i) => {
                        const borda = bordaDaLinha(linha);
                        const bordaMacro = linha.ultimaMacro ? B_CENTRO : B_MACRO;
                        const bordaMicro = linha.ultimaMicro ? bordaMacro : B_LINHA;

                        const celulaCentro = linha.primeiraDoCentro && (
                          <td rowSpan={total} className={`${B_CENTRO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}>
                            <RotuloAgrupador
                              aberto
                              negrito
                              nome={centro.nome}
                              contagem={centro.clientes.length}
                              onClick={() => alternar(setCentrosExpandidos, centro.id)}
                              topoGrudado={topoRotuloGrudado}
                            />
                          </td>
                        );

                        if (linha.tipo === 'macroColapsada') {
                          return (
                            <tr key={`${linha.macro.chave}-resumo`}>
                              {celulaCentro}
                              <td className={`${bordaMacro} border-l border-l-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                                <RotuloAgrupador
                                  aberto={false}
                                  nome={<RotuloMacro value={linha.macro.value} />}
                                  contagem={linha.macro.clientes.length}
                                  onClick={() => alternar(setMacrosColapsadas, linha.macro.chave)}
                                />
                              </td>
                              <CelulaContagem valor={linha.macro.micros.length} borda={borda} />
                              <CelulaContagem valor={linha.macro.clientes.length} borda={borda} />
                              <CelulasResumo colunas={colunas} clientes={linha.macro.clientes} borda={borda} />
                            </tr>
                          );
                        }

                        const celulaMacro = linha.primeiraDaMacro && (
                          <td
                            rowSpan={linha.macro.tamanho}
                            className={`${bordaMacro} border-l border-l-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}
                          >
                            <RotuloAgrupador
                              aberto
                              nome={<RotuloMacro value={linha.macro.value} />}
                              contagem={linha.macro.clientes.length}
                              onClick={() => alternar(setMacrosColapsadas, linha.macro.chave)}
                              topoGrudado={topoRotuloGrudado}
                            />
                          </td>
                        );

                        // Micro etapa 0 ("Sem etapa registrada") fica vermelha aberta ou recolhida.
                        const fundoMicro = linha.micro?.id === 0 ? 'bg-red-50' : 'bg-white';

                        if (linha.tipo === 'microColapsada') {
                          const fundoResumo = linha.micro.id === 0 ? 'bg-red-50' : '';
                          return (
                            <tr key={`${linha.micro.chave}-resumo`}>
                              {celulaCentro}
                              {celulaMacro}
                              <td className={`${bordaMicro} border-l border-l-gray-200 ${fundoMicro} px-2 py-2.5 align-middle 2xl:px-4`}>
                                <RotuloAgrupador
                                  aberto={false}
                                  nome={linha.micro.rotulo}
                                  contagem={linha.micro.clientes.length}
                                  onClick={() => alternar(setMicrosColapsadas, linha.micro.chave)}
                                />
                              </td>
                              <CelulaContagem valor={linha.micro.clientes.length} borda={borda} fundo={fundoResumo} />
                              <CelulasResumo colunas={colunas} clientes={linha.micro.clientes} borda={borda} fundo={fundoResumo} />
                            </tr>
                          );
                        }

                        const { cliente } = linha;
                        // Fundo vermelho do Cliente até o SLA quando o SLA estourou ou quando
                        // ainda não há nenhuma micro etapa registrada nesta macro (micro 0).
                        const fundo = cliente.situacaoSla === 'atrasado' || cliente.microId === 0 ? 'bg-red-50' : '';
                        return (
                          <tr key={`${linha.micro.chave}-${cliente.codigo}-${cliente.documento}-${i}`}>
                            {celulaCentro}
                            {celulaMacro}
                            {linha.primeiraDaMicro && (
                              <td
                                rowSpan={linha.micro.tamanho}
                                className={`${bordaMicro} border-l border-l-gray-200 ${fundoMicro} px-2 py-2.5 align-top 2xl:px-4`}
                              >
                                <RotuloAgrupador
                                  aberto
                                  nome={linha.micro.rotulo}
                                  contagem={linha.micro.clientes.length}
                                  onClick={() => alternar(setMicrosColapsadas, linha.micro.chave)}
                                  topoGrudado={topoRotuloGrudado}
                                />
                              </td>
                            )}
                            <td
                              className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 pr-1 text-xs text-gray-700 [overflow-wrap:anywhere] 2xl:pl-4 ${fundo}`}
                            >
                              <span className="flex items-start gap-1.5">
                                {cliente.situacaoSla === 'atrasado' && (
                                  <span aria-hidden="true" className="mt-0.75 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                                )}
                                <span>
                                  <span className="tabular-nums text-gray-400" title={DOCUMENTO_POR_MACRO[cliente.macro].titulo}>
                                    {cliente.documento || cliente.codigo}
                                  </span>
                                  <span className="text-gray-300"> - </span>
                                  {cliente.cliente || <span className="italic text-gray-400">Cliente não informado</span>}
                                </span>
                              </span>
                            </td>
                            {colunas.map((coluna) => (
                              <td
                                key={coluna.chave}
                                className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4 ${fundo}`}
                              >
                                {coluna.celula(cliente)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-xs font-semibold text-primary-700">
                  <td
                    colSpan={3}
                    className="sticky -bottom-6 z-10 rounded-bl-card border-t-2 border-t-primary-500 bg-primary-50 px-4 py-2.5"
                  >
                    Total
                  </td>
                  <td
                    className={`sticky -bottom-6 z-10 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-2 text-xs tabular-nums 2xl:pl-4 ${
                      colunas.length === 0 ? 'rounded-br-card' : ''
                    }`}
                  >
                    {clientesFiltrados.length.toLocaleString('pt-BR')} {clientesFiltrados.length === 1 ? 'cliente' : 'clientes'}
                  </td>
                  {colunas.map((coluna, i) => (
                    <td
                      key={coluna.chave}
                      className={`sticky -bottom-6 z-10 ${coluna.largura} border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-2 text-xs tabular-nums 2xl:pl-4 ${
                        i === colunas.length - 1 ? 'rounded-br-card' : ''
                      }`}
                    >
                      {coluna.resumo(clientesFiltrados)}
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

    </div>
  );
}
