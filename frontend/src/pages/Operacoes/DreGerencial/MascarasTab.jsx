import { forwardRef } from 'react';
import MascarasArvoreEditor from '../../../components/MascarasArvoreEditor';
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
];

const CALCULOS = [
  { value: 'VALOR_VENDAS', label: 'VALOR DE VENDAS', pai: 'CONTRATOS_VENDAS' },
  { value: 'ESTORNO_VENDAS', label: 'ESTORNO DE VENDAS', pai: 'CONTRATOS_VENDAS' },
  { value: 'RECEITA_DISTRATO', label: 'RECEITAS COM DISTRATO', pai: 'CONTRATOS_VENDAS' },
  { value: 'RECEITA_PERMUTA', label: 'RECEITA COM PERMUTA', pai: 'UNIDADES_IMOBILIARIAS' },
  { value: 'ENTRADAS_SAIDAS', label: 'ENTRADAS E SAÍDAS FINANCEIRAS', pai: 'FINANCEIRO' },
  { value: 'CORRECAO_MONETARIA', label: 'CORREÇÃO MONETÁRIA', pai: 'FINANCEIRO' },
];

// Marcações — por enquanto só informadas (nenhum cálculo usa ainda). Totalizadora é do nível 1
// (linha de subtotal: sem drilldown e sem máscaras de nível 2 — semFilhos); Realiza POC é do
// nível 2, e com ela o Tipo POC (POC Receita / POC Despesa, opcional). Origem e Cálculo também
// são do nível 2: o Cálculo só abre com a Origem escolhida e mostra só os cálculos dela.
const FLAGS = [
  {
    campo: 'totalizadora',
    label: 'Totalizadora',
    title: 'Nível 1 — linha de subtotal, sem máscaras de nível 2',
    nivel: 1,
    semFilhos: true,
  },
  { campo: 'realiza_poc', label: 'Realiza POC', title: 'Nível 2 — apropriada por POC (percentual de obra concluída)', nivel: 2 },
  {
    campo: 'tipo_poc',
    label: 'Tipo POC',
    title: 'Nível 2 — Receita ou Despesa (só com Realiza POC marcada)',
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
    largura: 'w-60',
    opcoes: ORIGENS,
  },
  {
    campo: 'calculo',
    label: 'Cálculo',
    title: 'Nível 2 — cálculo da Origem escolhida',
    nivel: 2,
    largura: 'w-56',
    requer: 'origem',
    opcoes: CALCULOS,
  },
];

// Operações > DRE Gerencial > Máscaras: estrutura da DRE da empresa em 2 níveis, cadastrada
// pelo usuário — mesma tela da aba Máscaras da DFC Construtoras (MascarasArvoreEditor), mais as
// colunas de marcação (FLAGS). As máscaras de nível 2 são as opções da combobox
// "Máscara DRE" na aba Plano de Contas.
const MascarasTab = forwardRef(function MascarasTab({ empresaId }, ref) {
  return (
    <MascarasArvoreEditor
      ref={ref}
      empresaId={empresaId}
      api={API}
      modeloSugerido={MODELO_SUGERIDO}
      demonstrativo="DRE"
      exemploNivel1="Receita Bruta"
      flags={FLAGS}
    />
  );
});

MascarasTab.displayName = 'MascarasTab';

export default MascarasTab;
