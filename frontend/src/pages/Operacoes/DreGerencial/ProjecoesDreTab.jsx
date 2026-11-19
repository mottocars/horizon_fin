import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { FilePlus2, Minimize2, Play, RefreshCcw, Trash2, TrendingUp, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { listCentrosCustoDre } from '../../../api/dreCentros.api';
import {
  criarOrcamentoDre,
  descartarOrcamentoDre,
  listarProjecoesDre,
} from '../../../api/dreProjecoes.api';
import AssistenteOrcamento from './projecoes/AssistenteOrcamento';
import ImportarPlanilhaModal from './projecoes/ImportarPlanilhaModal';
import { useLeituraDre } from './leituraDre';
import { baixarArquivo, corValor, mensagemDeErro, moeda, rotuloMesLongo } from './projecoes/util';
import { baixarLayoutProjecoesDre } from '../../../api/dreProjecoes.api';

const ROTULO_ETAPA = {
  centro: 'centro e ciclo',
  historico: 'histórico',
  vendas: 'vendas',
  custos: 'custos da POC',
  poc: 'POC',
  demais: 'demais contas',
  conclusao: 'conclusão',
};

const dataHora = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function Situacao({ linha }) {
  if (linha.status === 'CONCLUIDO') {
    return <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">Concluído</span>;
  }
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      Em andamento · {ROTULO_ETAPA[linha.etapa] || linha.etapa}
    </span>
  );
}

// Operações > DRE Construtoras > Projeções: os orçamentos da DRE por centro de custo — uma linha por
// centro com o fechamento (do primeiro lançamento ao fim do ciclo) em cada totalizador da Máscara DRE, o ciclo e a trava. Um
// orçamento por centro, na versão da DRE que a tela mostra (a aberta ou, sem ela, a última salva — aba Versões;
// "Salvar versão" fica lá e só deixa salvar com todos concluídos). Os botões do topo (DreGerencialPage.jsx)
// chamam `novo()`, `baixarLayout()` e `importar()` pela ref. Só leitura: abre o assistente sem gravar.
const ProjecoesDreTab = forwardRef(function ProjecoesDreTab({ empresaId, telaCheia = false, onSairTelaCheia }, ref) {
  const confirm = useConfirm();
  const { somenteLeitura } = useLeituraDre();
  const [lista, setLista] = useState(null);
  const [centros, setCentros] = useState([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [assistente, setAssistente] = useState(null); // { id } (id null = novo)

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setErro('');
    Promise.all([listarProjecoesDre(empresaId), listCentrosCustoDre(empresaId)])
      .then(([l, c]) => {
        setLista(l);
        setCentros(c.filter((x) => x.realiza_dre));
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as projeções.'));
  }, [empresaId]);

  useEffect(() => {
    setLista(null);
    setAviso('');
    carregar();
  }, [carregar]);

  // Planilha da empresa (botões do topo): todos os centros, com as abas Ciclos, Vendas, Custos da POC e
  // Demais contas. A de um centro só fica nas etapas do assistente.
  const [importando, setImportando] = useState(false);
  async function baixarLayout() {
    setErro('');
    try {
      const { blob, nome } = await baixarLayoutProjecoesDre(empresaId);
      baixarArquivo(blob, nome);
    } catch (e) {
      setErro(await mensagemDeErro(e, 'Não foi possível gerar a planilha.'));
    }
  }

  useImperativeHandle(ref, () => ({ novo: () => setAssistente({ id: null }), baixarLayout, importar: () => setImportando(true) }));

  // Tela cheia: pede também a do navegador; sai pelo botão ou com Esc (fora do assistente) — mesmo
  // esquema de DfcOrcamentosTab.jsx.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) onSairTelaCheia?.();
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape' && e.target.tagName !== 'INPUT') onSairTelaCheia?.();
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaCheia]);

  async function descartar(linha) {
    const ok = await confirm({
      title: 'Descartar rascunho',
      description: `Descartar o orçamento ${linha.status === 'CONCLUIDO' ? 'concluído' : 'em andamento'} de ${
        linha.centro_apelido || linha.centro_nome
      }? O que foi informado nele será apagado.`,
      confirmLabel: 'Descartar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await descartarOrcamentoDre(empresaId, linha.id);
      carregar();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível descartar.');
    }
  }

  // Revisar um orçamento da versão: abre um rascunho do centro começando com o que foi informado nele.
  async function revisar(linha) {
    try {
      const o = await criarOrcamentoDre(empresaId, { centroId: linha.centro_id, cicloInicio: linha.ciclo_inicio, cicloFim: linha.ciclo_fim });
      setAssistente({ id: o.id });
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível abrir o orçamento.');
    }
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <TrendingUp size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as projeções da DRE.</p>
      </Card>
    );
  }

  const emAndamento = lista ? lista.rascunhos.filter((r) => r.status !== 'CONCLUIDO').length : 0;
  // Na ordem dos centros (aba Centros Custos): o rascunho do centro e, embaixo, o da versão.
  const ordem = new Map(centros.map((c, i) => [c.sienge_id, i]));
  const linhas = lista
    ? [...lista.rascunhos, ...lista.orcamentos].sort(
        (a, b) =>
          (ordem.get(a.centro_id) ?? 9999) - (ordem.get(b.centro_id) ?? 9999) ||
          a.centro_id - b.centro_id ||
          (a.versao_id === null ? 0 : 1) - (b.versao_id === null ? 0 : 1)
      )
    : [];
  // Só os totalizadores da Máscara DRE (Receita Líquida, Lucro Bruto, EBITDA, Lucro Líquido…), pedido
  // do usuário — os grupos ficam no detalhe do orçamento.
  const colunas = (lista?.colunas || []).filter((c) => c.totalizadora);

  return (
    <div
      className={
        telaCheia ? 'fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white p-5' : 'min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
          <TrendingUp size={18} className="shrink-0 text-primary-600" />
          <h2 className="text-sm font-semibold text-gray-900">Projeções</h2>
          <span className="ml-auto hidden text-xs text-gray-400 sm:inline">Esc para sair</span>
          <button
            type="button"
            onClick={onSairTelaCheia}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minimize2 size={15} />
            Sair da tela cheia
          </button>
        </div>
      )}

      {lista && (
        <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            {lista.versao ? (
              <>
                <span className="font-medium text-gray-800">Versão {lista.versao.numero} da DRE</span>
                {lista.versao.status === 'ABERTA'
                  ? ` · em edição, aberta em ${dataHora(lista.versao.criado_em)}`
                  : ` · salva em ${dataHora(lista.versao.criado_em)}`}
                {lista.versao.usuario ? ` por ${lista.versao.usuario}` : ''}
                {lista.corte ? ` · realizado até ${rotuloMesLongo(lista.corte)}` : ''}
              </>
            ) : (
              'Sem versão da DRE'
            )}
          </span>
          {emAndamento > 0 && !somenteLeitura && (
            <span className="text-amber-700">{emAndamento} em andamento: conclua para poder salvar a versão (aba Versões)</span>
          )}
        </div>
      )}
      {(erro || aviso) && (
        <div className={`mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${erro ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {erro && <TriangleAlert size={14} className="shrink-0" />}
          {erro || aviso}
        </div>
      )}

      {!lista && !erro ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : lista && !linhas.length ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TrendingUp size={26} className="text-gray-300" />
          <p className="text-sm text-gray-600">Nenhum orçamento gerado.</p>
          {!somenteLeitura && (
            <Button className="mt-2" onClick={() => setAssistente({ id: null })}>
              <FilePlus2 size={16} /> Novo orçamento
            </Button>
          )}
        </div>
      ) : lista ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-blue-700">
                <th className="sticky left-0 z-10 min-w-80 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Centro de custo</th>
                <th className="min-w-44 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Ciclo</th>
                {colunas.map((c) => (
                  <th
                    key={c.id}
                    className="min-w-36 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium leading-tight"
                  >
                    {c.descricao}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const rascunho = l.versao_id === null;
                return (
                  <tr
                    key={l.id}
                    onClick={() => (rascunho ? setAssistente({ id: l.id }) : null)}
                    className={`group ${rascunho ? 'cursor-pointer bg-white hover:bg-gray-50' : 'bg-white'}`}
                  >
                    {/* Coluna fixa: o centro, a situação e as ações — sempre à vista, mesmo rolando as colunas. */}
                    <td className="sticky left-0 z-[1] border-b border-gray-100 bg-inherit px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="tabular-nums text-gray-400">{l.centro_id}</span>
                            <span className="truncate font-medium text-gray-900">{l.centro_apelido || l.centro_nome}</span>
                            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {l.natureza === 'OBRA' ? 'Obra' : 'Adm.'}
                            </span>
                          </span>
                          <span className="mt-1 block">
                            <Situacao linha={l} />
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {rascunho ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setAssistente({ id: l.id })}
                                title={somenteLeitura ? 'Ver (só leitura)' : l.status === 'CONCLUIDO' ? 'Abrir' : 'Continuar'}
                                className="rounded-md p-1.5 text-primary-600 hover:bg-primary-50"
                              >
                                <Play size={14} />
                              </button>
                              {!somenteLeitura && (
                                <button
                                  type="button"
                                  onClick={() => descartar(l)}
                                  title="Descartar orçamento"
                                  className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </>
                          ) : (
                            !lista.rascunhos.some((r) => r.centro_id === l.centro_id) && (
                              <button
                                type="button"
                                onClick={() => revisar(l)}
                                title="Revisar (novo rascunho a partir deste orçamento)"
                                className="rounded-md p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-600"
                              >
                                <RefreshCcw size={14} />
                              </button>
                            )
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-gray-100 px-3 py-2 text-gray-600">
                      {rotuloMesLongo(l.ciclo_inicio)} a {rotuloMesLongo(l.ciclo_fim)}
                      {(lista.corte || l.trava) && <span className="block text-[11px] text-gray-400">realizado até {rotuloMesLongo(lista.corte || l.trava)}</span>}
                    </td>
                    {colunas.map((c) => {
                      const v = l.totais?.[c.id];
                      return (
                        <td
                          key={c.id}
                          className={`border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums ${
                            v === undefined || v === null ? 'text-gray-300' : corValor(v)
                          }`}
                        >
                          {v === undefined || v === null ? '—' : moeda(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <ImportarPlanilhaModal
        open={importando}
        onClose={() => setImportando(false)}
        empresaId={empresaId}
        titulo="Importar planilha da Projeção"
        onImportado={(r) => {
          carregar();
          setAviso(`Planilha importada: ${r.resumo.centros} orçamento(s) gravado(s) no rascunho${r.concluidos ? `, ${r.concluidos} concluído(s)` : ''}.`);
        }}
      />

      {assistente && (
        <AssistenteOrcamento
          somenteLeitura={somenteLeitura}
          empresaId={empresaId}
          orcamentoId={assistente.id}
          centros={centros}
          onFechar={(mudou) => {
            setAssistente(null);
            if (mudou) carregar();
          }}
        />
      )}
    </div>
  );
});

export default ProjecoesDreTab;
