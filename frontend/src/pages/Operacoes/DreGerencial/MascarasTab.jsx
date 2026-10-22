import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { History, X } from 'lucide-react';
import MascarasArvoreEditor from '../../../components/MascarasArvoreEditor';
import HistoricoImpostoModal, { formatarAliquota } from './HistoricoImpostoModal';
import {
  createDreMascaras,
  listDreMascaras,
  removeDreMascara,
  reordenarDreMascaras,
  updateDreMascara,
} from '../../../api/dreMascaras.api';

// Oferecido só quando a empresa ainda não tem nenhuma máscara (botão "Usar modelo sugerido") —
// a estrutura de nível 1 que a DRE tinha fixa no código, com as linhas de nível 2 que já
// tinham sido cadastradas nela. Depois é tudo editável normalmente.
const MODELO_SUGERIDO = [
  {
    descricao: 'RECEITA BRUTA',
    filhos: [
      'RECEITA COM VENDA DE IMÓVEIS',
      'RECEITA COM PERMUTA',
      'CORREÇÃO MONETÁRIA',
      'RECEITA COM DISTRATOS',
      'ESTORNO DE RECEITA',
    ],
  },
  { descricao: 'IMPOSTOS SOBRE A RECEITA', filhos: ['RET'] },
  { descricao: 'CIV - CUSTO DOS IMÓVEIS VENDIDOS', filhos: ['CUSTO DOS IMÓVEIS', 'PÓS OBRA', 'ESTORNO DE CUSTO'] },
  { descricao: 'DESPESAS OPERACIONAIS', filhos: ['DESPESAS ADMINISTRATIVAS', 'DESPESAS COM MARKETING', 'DESPESAS COM VENDAS'] },
  {
    descricao: 'DESPESAS/RECEITAS NÃO OPERACIONAIS',
    filhos: ['DESPESAS FINANCEIRAS', 'RECEITAS FINANCEIRAS', 'PARTICIPAÇÃO NOS LUCROS - PLR'],
  },
];

const API = {
  listar: listDreMascaras,
  criar: createDreMascaras,
  atualizar: updateDreMascara,
  remover: removeDreMascara,
  reordenar: reordenarDreMascaras,
};

// Origem do valor de uma linha de nível 2 e os cálculos de cada uma — mesmos códigos de
// CALCULOS_POR_ORIGEM no backend (dreMascaras.service.js).
const ORIGENS = [
  { value: 'CONTRATOS_VENDAS', label: 'SIENGE - CONTRATOS DE VENDAS' },
  { value: 'UNIDADES_IMOBILIARIAS', label: 'SIENGE - UNIDADES IMOBILIÁRIAS' },
  { value: 'FINANCEIRO', label: 'SIENGE - FINANCEIRO CP/CR/EXTRATO' },
  { value: 'IMPOSTO_FIXO', label: 'IMPOSTO FIXO' },
];

const CALCULOS = [
  { value: 'VALOR_VENDAS', label: 'VALOR DE VENDAS', pai: 'CONTRATOS_VENDAS' },
  { value: 'ESTORNO_VENDAS', label: 'ESTORNO DE VENDAS', pai: 'CONTRATOS_VENDAS' },
  { value: 'RECEITA_DISTRATO', label: 'RECEITAS COM DISTRATO', pai: 'CONTRATOS_VENDAS' },
  { value: 'ESTORNO_CUSTO', label: 'ESTORNO DE CUSTO', pai: 'CONTRATOS_VENDAS' },
  { value: 'RECEITA_PERMUTA', label: 'RECEITA COM PERMUTA', pai: 'UNIDADES_IMOBILIARIAS' },
  { value: 'ENTRADAS_SAIDAS', label: 'ENTRADAS E SAÍDAS FINANCEIRAS', pai: 'FINANCEIRO' },
  { value: 'CORRECAO_MONETARIA', label: 'CORREÇÃO MONETÁRIA', pai: 'FINANCEIRO' },
];

// Ícone (sinal) da linha: + / - / +/- escolhidos no seletor (SeletorIcone); o = é automático com Totaliza (o
// backend grava e limpa junto com ela) e não é escolhível.
const ICONES = [
  { value: 'MAIS', label: '+', title: 'Soma' },
  { value: 'MENOS', label: '-', title: 'Subtrai' },
  { value: 'MAIS_MENOS', label: '+/-', title: 'Soma ou subtrai' },
];

// Botão com o ícone atual; ao clicar abre a lista dos ícones e, escolhido um, ela fecha. Com
// Totaliza, o = fixo no lugar (sem lista).
function SeletorIcone({ item, definir }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => !raiz.current?.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (item.totalizadora) {
    return (
      <span
        title="= — automático com Totaliza"
        className="flex h-6 w-11 items-center justify-center rounded-md bg-gray-200 text-xs font-bold text-gray-700"
      >
        =
      </span>
    );
  }
  // 'IGUAL' sem Totaliza só sobra na tela depois de arrastar uma Totaliza pro nível 2 (o backend já
  // limpou) — conta como vazio.
  const atual = ICONES.find((o) => o.value === item.icone);

  function escolher(valor) {
    setAberto(false);
    if (valor !== (atual?.value ?? null)) definir(valor);
  }

  return (
    <span ref={raiz} className="relative">
      <button
        type="button"
        title={atual ? `${atual.title} — clique para trocar` : 'Escolher ícone'}
        onClick={() => setAberto((v) => !v)}
        className={`flex h-6 w-11 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
          atual ? 'border-primary-100 bg-primary-50 text-gray-900' : 'border-amber-200 bg-amber-50 text-gray-400'
        } ${aberto ? 'ring-2 ring-primary-100' : ''}`}
      >
        {atual ? atual.label : '—'}
      </button>
      {aberto && (
        <span className="absolute left-1/2 top-full z-30 mt-1 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          {ICONES.map((o) => (
            <button
              key={o.value}
              type="button"
              title={o.title}
              onClick={() => escolher(o.value)}
              className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1 text-sm font-bold transition-colors ${
                atual?.value === o.value ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {o.label}
            </button>
          ))}
          {atual && (
            <button
              type="button"
              title="Limpar ícone"
              onClick={() => escolher(null)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <X size={13} />
            </button>
          )}
        </span>
      )}
    </span>
  );
}

// Marcações — por enquanto só informadas (nenhum cálculo usa ainda). Totalizadora é do nível 1
// (linha de subtotal: sem drilldown e sem máscaras de nível 2 — semFilhos); % POC é do
// nível 2, e com ela o Tipo POC (POC Receita / POC Despesa, opcional). Origem e Cálculo também
// são do nível 2: o Cálculo só abre com a Origem escolhida e mostra só os cálculos dela. Imposto
// Fixo não tem cálculo: no lugar da combobox vem o botão "Informar histórico" (alíquotas por mês —
// HistoricoImpostoModal) e, à frente dele, a alíquota do histórico mais recente — por isso as flags
// são montadas no componente (`abrirHistorico`, `aliquotaDe`).
const montarFlags = (abrirHistorico, aliquotaDe) => [
  {
    campo: 'icone',
    label: 'Ícone',
    title: 'Sinal da linha na DRE: + / - / +/- (o = vem sozinho com Totaliza)',
    largura: 'w-[72px]',
    substituir: (item, definir) => <SeletorIcone item={item} definir={definir} />,
  },
  {
    campo: 'totalizadora',
    label: 'Totaliza',
    title: 'Nível 1 — linha de subtotal, sem máscaras de nível 2',
    nivel: 1,
    semFilhos: true,
    junto: (valor) => ({ icone: valor ? 'IGUAL' : null }),
  },
  { campo: 'realiza_poc', label: '% POC', title: 'Nível 2 — apropriada por POC (percentual de obra concluída)', nivel: 2 },
  {
    campo: 'tipo_poc',
    label: 'Tipo POC',
    title: 'Nível 2 — Receita ou Despesa (só com % POC marcada)',
    nivel: 2,
    requer: 'realiza_poc',
    opcoes: [
      { value: 'RECEITA', label: 'RECEITA' },
      { value: 'DESPESA', label: 'DESPESA' },
    ],
  },
  {
    campo: 'origem',
    label: 'Origem',
    title: 'Nível 2 — de onde vem o valor da linha',
    nivel: 2,
    largura: 'w-72',
    opcoes: ORIGENS,
  },
  {
    campo: 'calculo',
    label: 'Cálculo',
    title: 'Nível 2 — cálculo da Origem escolhida',
    nivel: 2,
    largura: 'w-64',
    requer: 'origem',
    opcoes: CALCULOS,
    substituir: (item) => {
      if (item.origem !== 'IMPOSTO_FIXO') return null;
      const aliquota = aliquotaDe(item);
      return (
        <span className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={() => abrirHistorico(item)}
            className="flex shrink-0 items-center gap-1 rounded border border-primary-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-50"
          >
            <History size={11} />
            Informar histórico
          </button>
          {aliquota === null ? (
            <span className="text-[11px] text-gray-400">sem alíquota</span>
          ) : (
            <span className="text-xs font-semibold tabular-nums text-gray-900">{formatarAliquota(aliquota)}</span>
          )}
        </span>
      );
    },
  },
];

// Operações > DRE Gerencial > Máscaras: estrutura da DRE da empresa em 2 níveis, cadastrada
// pelo usuário — mesma tela da aba Máscaras da DFC Construtoras (MascarasArvoreEditor), mais as
// colunas de marcação (montarFlags). As máscaras de nível 2 são as opções da combobox
// "Máscara DRE" na aba Plano de Contas.
const MascarasTab = forwardRef(function MascarasTab({ empresaId }, ref) {
  const [historicoDe, setHistoricoDe] = useState(null);
  // Alíquota mais recente por máscara depois de mexer no histórico nesta tela — a da carga
  // (aliquota_vigente) vale até lá, sem precisar recarregar a árvore.
  const [aliquotasAlteradas, setAliquotasAlteradas] = useState({});
  const flags = useMemo(
    () =>
      montarFlags(setHistoricoDe, (item) =>
        item.id in aliquotasAlteradas ? aliquotasAlteradas[item.id] : (item.aliquota_vigente ?? null)
      ),
    [aliquotasAlteradas]
  );

  return (
    <>
      <MascarasArvoreEditor
        ref={ref}
        empresaId={empresaId}
        api={API}
        modeloSugerido={MODELO_SUGERIDO}
        demonstrativo="DRE"
        exemploNivel1="Receita Bruta"
        flags={flags}
      />
      <HistoricoImpostoModal
        empresaId={empresaId}
        mascara={historicoDe}
        onClose={() => setHistoricoDe(null)}
        onAlterado={(historico) =>
          setAliquotasAlteradas((atual) => ({ ...atual, [historicoDe.id]: historico[0]?.aliquota ?? null }))
        }
      />
    </>
  );
});

MascarasTab.displayName = 'MascarasTab';

export default MascarasTab;
