import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, FileDown, ListFilter, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
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

// Mesma ideia de relatorioMasa.service.js::chaveOrdemTaskType — só pra ordenar as opções do
// filtro de "Micro Etapa Atual" pelo prefixo "major.minor" do nome (1.2, 1.10, 2.1...) em vez de
// ordem alfabética de string (que colocaria "1.10" antes de "1.2").
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

// Ícone de filtro compacto ao lado do nome da coluna — mesmo padrão de
// GestaoCobrancas/RotinasTab.jsx::FiltroColuna (SearchableSelect com `multiple` e
// `renderTrigger`, painel com a largura do <th> via `colunaRef`).
function FiltroColuna({ valor, onChange, opcoes, label, colunaRef }) {
  return (
    <SearchableSelect
      multiple
      value={valor}
      onChange={onChange}
      options={opcoes}
      placeholder="Todos"
      emptyMessage="Nenhuma opção encontrada."
      larguraRef={colunaRef}
      renderTrigger={({ toggle, temSelecao }) => (
        <button
          type="button"
          onClick={toggle}
          title={`Filtrar por ${label}`}
          aria-pressed={temSelecao}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
            temSelecao ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-400 hover:bg-white/60 hover:text-primary-700'
          }`}
        >
          <ListFilter size={13} />
        </button>
      )}
    />
  );
}

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela). Coluna "Etapa Atual" (fase, action_types) fixa: 1 célula só por fase, com
// `rowSpan` cobrindo todas as linhas dos empreendimentos dela e centralizada verticalmente
// (`align-middle`). Cada empreendimento aparece só na fase mais avançada entre todas as suas
// ações (ver relatorioMasa.service.js::listMatriz) — nunca repetido em mais de uma linha.
export default function EmpreendimentosMasaPage() {
  const [matriz, setMatriz] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtro de coluna (Etapa Atual/Empreendimento/Micro Etapa Atual) — mesma convenção de
  // RotinasTab.jsx: array vazio = sem filtro (mostra tudo); selecionar valores restringe só a
  // eles. Os 3 filtros são combinados em "E" entre si.
  const [filtroEtapaAtual, setFiltroEtapaAtual] = useState([]);
  const [filtroEmpreendimento, setFiltroEmpreendimento] = useState([]);
  const [filtroMicroEtapa, setFiltroMicroEtapa] = useState([]);

  // Referências dos <th> — passadas pra FiltroColuna (via `colunaRef`) só pra o painel de
  // filtro nascer com a mesma largura da coluna, em vez da largura do ícone que abre ele.
  const thEtapaAtualRef = useRef(null);
  const thEmpreendimentoRef = useRef(null);
  const thMicroEtapaRef = useRef(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro('');
    return getMatrizEmpreendimentosMasa()
      .then(setMatriz)
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

  // Aplica os 3 filtros por cima da matriz: filtra fases por nome (Etapa Atual), filtra os
  // empreendimentos de cada fase por nome/micro etapa, e descarta fase que ficou sem nenhum
  // empreendimento POR CAUSA do filtro — mas preserva a fase genuinamente vazia (sem nenhum
  // empreendimento na Actioon) quando nenhum filtro de Empreendimento/Micro Etapa está ativo,
  // já que aí o "vazio" não veio do filtro.
  const matrizFiltrada = useMemo(() => {
    const semFiltroDeItem = filtroEmpreendimento.length === 0 && filtroMicroEtapa.length === 0;
    return (matriz || [])
      .filter((fase) => filtroEtapaAtual.length === 0 || filtroEtapaAtual.includes(fase.name))
      .map((fase) => ({
        ...fase,
        empreendimentos: fase.empreendimentos.filter(
          (emp) =>
            (filtroEmpreendimento.length === 0 || filtroEmpreendimento.includes(emp.name)) &&
            (filtroMicroEtapa.length === 0 || filtroMicroEtapa.includes(emp.microEtapaAtual))
        ),
      }))
      .filter((fase) => fase.empreendimentos.length > 0 || semFiltroDeItem);
  }, [matriz, filtroEtapaAtual, filtroEmpreendimento, filtroMicroEtapa]);

  // Totalizador do rodapé — soma só as 6 colunas numéricas "de valor" que fazem sentido somar
  // (pedido do usuário): M², Unidades, VGV Geral, VGV Masa, Horas Trabalhadas e Contas Pagas.
  // Fica de fora Duração (não é um total que faça sentido somar entre empreendimentos). Sempre
  // a partir da matriz JÁ FILTRADA — os totais têm que refletir só o que está visível na tela.
  const totais = useMemo(() => {
    const todos = matrizFiltrada.flatMap((fase) => fase.empreendimentos);
    return todos.reduce(
      (acc, emp) => ({
        areaM2: acc.areaM2 + (emp.areaM2 || 0),
        unidades: acc.unidades + (emp.unidades || 0),
        vgvGeral: acc.vgvGeral + (emp.vgvGeral || 0),
        vgvMasa: acc.vgvMasa + (emp.vgvMasa || 0),
        segundosTrabalhados: acc.segundosTrabalhados + (emp.segundosTrabalhados || 0),
        contasPagas: acc.contasPagas + (emp.contasPagas || 0),
      }),
      { areaM2: 0, unidades: 0, vgvGeral: 0, vgvMasa: 0, segundosTrabalhados: 0, contasPagas: 0 }
    );
  }, [matrizFiltrada]);

  const semResultadoFiltro = Boolean(matriz && matriz.length > 0 && matrizFiltrada.length === 0);

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
    window.addEventListener('click', fechar);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('contextmenu', fechar);
    return () => {
      window.removeEventListener('click', fechar);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('contextmenu', fechar);
    };
  }, [menuContexto]);

  // Exporta a matriz JÁ FILTRADA pra Excel, de forma "empilhada" — 1 linha por empreendimento
  // com todas as colunas preenchidas (Etapa Atual/Empreendimento repetidos em cada linha), bem
  // diferente da grade visual da tela (que usa rowSpan pra não repetir). Termina com uma linha
  // de Total igual à do rodapé. Gera o .xlsx inteiramente no navegador (a matriz já filtrada já
  // está em memória, sem precisar buscar nada de novo no backend) — biblioteca carregada sob
  // demanda (só quando o usuário realmente exporta) pra não pesar no carregamento da página.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const linhas = matrizFiltrada.flatMap((fase) =>
      fase.empreendimentos.map((emp) => ({
        'Etapa Atual': fase.name,
        Empreendimento: emp.name,
        'Micro Etapa Atual': emp.microEtapaAtual || '',
        'Duração (dias)': emp.duracaoDias ?? '',
        'M²': emp.areaM2 ?? '',
        Unidades: emp.unidades ?? '',
        'VGV Geral': emp.vgvGeral ?? '',
        'VGV Masa': emp.vgvMasa ?? '',
        'Horas Trabalhadas': emp.segundosTrabalhados != null ? Number((emp.segundosTrabalhados / 3600).toFixed(1)) : '',
        'Contas Pagas': emp.contasPagas ?? '',
      }))
    );
    // Arredonda pra 2 casas — somar dezenas de valores com centavos em ponto flutuante gera
    // ruído tipo 13781669.180000002, que não existe nos valores de origem.
    const arredondar = (valor) => Math.round(valor * 100) / 100;
    linhas.push({
      'Etapa Atual': 'Total',
      Empreendimento: '',
      'Micro Etapa Atual': '',
      'Duração (dias)': '',
      'M²': arredondar(totais.areaM2),
      Unidades: totais.unidades,
      'VGV Geral': arredondar(totais.vgvGeral),
      'VGV Masa': arredondar(totais.vgvMasa),
      'Horas Trabalhadas': Number((totais.segundosTrabalhados / 3600).toFixed(1)),
      'Contas Pagas': arredondar(totais.contasPagas),
    });
    const planilha = XLSX.utils.json_to_sheet(linhas);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Empreendimentos Masa');
    XLSX.writeFile(livro, `empreendimentos-masa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
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
                        valor={filtroEtapaAtual}
                        onChange={setFiltroEtapaAtual}
                        opcoes={opcoesEtapaAtual}
                        label="etapa atual"
                        colunaRef={thEtapaAtualRef}
                      />
                      Etapa Atual
                    </span>
                  </th>
                  <th
                    ref={thEmpreendimentoRef}
                    className="sticky -top-6 z-20 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        valor={filtroEmpreendimento}
                        onChange={setFiltroEmpreendimento}
                        opcoes={opcoesEmpreendimento}
                        label="empreendimento"
                        colunaRef={thEmpreendimentoRef}
                      />
                      Empreendimento
                    </span>
                  </th>
                  <th
                    ref={thMicroEtapaRef}
                    className="sticky -top-6 z-20 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        valor={filtroMicroEtapa}
                        onChange={setFiltroMicroEtapa}
                        opcoes={opcoesMicroEtapa}
                        label="micro etapa atual"
                        colunaRef={thMicroEtapaRef}
                      />
                      Micro Etapa Atual
                    </span>
                  </th>
                  <th className="sticky -top-6 z-20 w-28 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    Duração
                  </th>
                  <th className="sticky -top-6 z-20 w-28 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    M²
                  </th>
                  <th className="sticky -top-6 z-20 w-24 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    Unidades
                  </th>
                  <th className="sticky -top-6 z-20 w-32 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    VGV Geral
                  </th>
                  <th className="sticky -top-6 z-20 w-32 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    VGV Masa
                  </th>
                  <th className="sticky -top-6 z-20 w-28 border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    Horas Trabalhadas
                  </th>
                  <th className="sticky -top-6 z-20 w-32 rounded-tr-card border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-2 py-2.5 text-center font-medium">
                    Contas Pagas
                  </th>
                </tr>
              </thead>
              <tbody>
                {semResultadoFiltro && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">Nenhuma linha corresponde aos filtros selecionados.</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
                        Ajuste os filtros de Etapa Atual, Empreendimento ou Micro Etapa Atual pra ver as linhas de novo.
                      </p>
                    </td>
                  </tr>
                )}
                {matrizFiltrada.map((fase) => {
                  // Fase sem nenhum empreendimento ainda ocupa 1 linha (com um traço no lugar
                  // do nome) — senão ela desaparece da matriz inteira, o que esconderia que
                  // aquela etapa existe e está vazia.
                  const linhas = fase.empreendimentos.length > 0 ? fase.empreendimentos : [null];

                  return (
                    <Fragment key={fase.id}>
                      {linhas.map((empreendimento, indice) => {
                        // Última linha da fase — borda de baixo mais grossa/escura pra marcar
                        // bem a separação entre uma etapa e a próxima (pedido do usuário).
                        const ultimaLinha = indice === linhas.length - 1;
                        const bordaInferior = ultimaLinha
                          ? 'border-b-2 border-b-gray-300'
                          : 'border-b border-b-gray-100';
                        return (
                          <tr key={`${fase.id}-${empreendimento?.id ?? 'vazia'}`}>
                            {indice === 0 && (
                              <td
                                rowSpan={linhas.length}
                                className="border-b-2 border-b-gray-300 border-r border-r-gray-200 bg-gray-50 px-4 py-2.5 align-middle"
                              >
                                <span className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-gray-900">{fase.name}</span>
                                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                    {fase.empreendimentos.length}
                                  </span>
                                </span>
                              </td>
                            )}
                            <td className={`${bordaInferior} py-1.5 pl-4 text-xs text-gray-700`}>
                              {empreendimento ? (
                                empreendimento.name
                              ) : (
                                <span className="italic text-gray-400">Nenhum empreendimento nesta fase.</span>
                              )}
                            </td>
                            <td className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs text-gray-700`}>
                              {empreendimento?.microEtapaAtual || <span className="text-gray-300">—</span>}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.duracaoDias != null ? (
                                `${empreendimento.duracaoDias.toLocaleString('pt-BR')} dias`
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.areaM2 != null ? (
                                empreendimento.areaM2.toLocaleString('pt-BR')
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.unidades != null ? (
                                empreendimento.unidades.toLocaleString('pt-BR')
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.vgvGeral != null ? (
                                formatarMoeda(empreendimento.vgvGeral)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.vgvMasa != null ? (
                                formatarMoeda(empreendimento.vgvMasa)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.segundosTrabalhados != null ? (
                                formatarHoras(empreendimento.segundosTrabalhados)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td
                              className={`${bordaInferior} border-l border-l-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700`}
                            >
                              {empreendimento?.contasPagas != null ? (
                                formatarMoeda(empreendimento.contasPagas)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
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
                    colSpan={3}
                    className="sticky -bottom-6 z-10 rounded-bl-card border-t-2 border-t-primary-500 bg-primary-50 px-4 py-2.5"
                  >
                    Total
                  </td>
                  <td className="sticky -bottom-6 z-10 w-28 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs">
                    <span className="text-gray-300">—</span>
                  </td>
                  <td className="sticky -bottom-6 z-10 w-28 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {totais.areaM2.toLocaleString('pt-BR')}
                  </td>
                  <td className="sticky -bottom-6 z-10 w-24 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {totais.unidades.toLocaleString('pt-BR')}
                  </td>
                  <td className="sticky -bottom-6 z-10 w-32 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {formatarMoeda(totais.vgvGeral)}
                  </td>
                  <td className="sticky -bottom-6 z-10 w-32 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {formatarMoeda(totais.vgvMasa)}
                  </td>
                  <td className="sticky -bottom-6 z-10 w-28 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {formatarHoras(totais.segundosTrabalhados)}
                  </td>
                  <td className="sticky -bottom-6 z-10 w-32 rounded-br-card border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-4 text-xs tabular-nums">
                    {formatarMoeda(totais.contasPagas)}
                  </td>
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
