import { forwardRef } from 'react';
import MascarasArvoreEditor from '../../../components/MascarasArvoreEditor';
import {
  createDfcMascaras,
  listDfcMascaras,
  removeDfcMascara,
  reordenarDfcMascaras,
  updateDfcMascara,
} from '../../../api/dfcMascaras.api';

// Estrutura de exemplo passada pelo usuário — oferecida só quando a empresa ainda não tem
// nenhuma máscara (botão "Usar modelo sugerido"); depois disso é tudo editável normalmente.
const MODELO_SUGERIDO = [
  {
    descricao: 'FLUXO DE CAIXA OPERACIONAL',
    filhos: [
      'RECEITA DE VENDAS',
      'OUTRAS RECEITAS OPERACIONAIS',
      'CUSTO DO TERRENO',
      'CUSTO DE CONSTRUCAO (OBRA)',
      'INCORPORACAO E LEGALIZACAO',
      'DESPESAS COMERCIAIS E MARKETING',
      'DESPESAS COM PESSOAL',
      'DESPESAS ADMINISTRATIVAS',
      'IMPOSTOS E TRIBUTOS',
      'DISTRATOS, ENCARGOS E AJUSTES OPERACIONAIS',
      'CAPTACAO DE FINANCIAMENTOS',
      'SERVICO DA DIVIDA (AMORTIZACAO E JUROS)',
      'ENCARGOS E TARIFAS FINANCEIRAS',
    ],
  },
  {
    descricao: 'FLUXO DE CAIXA DOS INVESTIMENTOS',
    filhos: ['APLICACOES E RESGATES FINANCEIROS', 'RENDIMENTOS DE APLICACOES', 'INVESTIMENTO PRODUTOS'],
  },
  {
    descricao: 'RETIRADAS / INTEGRALIZAÇÕES E ACERTOS',
    filhos: [
      'TRANSFERENCIAS E MOVIMENTACOES BANCARIAS',
      'APORTES E INTEGRALIZACOES DE CAPITAL',
      'REMUNERACAO E DISTRIBUICAO AOS SOCIOS',
      'MOVIMENTACAO E DEVOLUCAO DE CAPITAL',
      'OUTRAS RECEITAS',
    ],
  },
];

const API = {
  listar: listDfcMascaras,
  criar: createDfcMascaras,
  atualizar: updateDfcMascara,
  remover: removeDfcMascara,
  reordenar: reordenarDfcMascaras,
};

// Operações > DFC Construtoras > Máscaras: estrutura da DFC da empresa em 2 níveis. A tela em si
// é o MascarasArvoreEditor (o mesmo da DRE Gerencial); aqui só entram a API e o modelo da DFC.
const DfcMascarasTab = forwardRef(function DfcMascarasTab({ empresaId }, ref) {
  return (
    <MascarasArvoreEditor
      ref={ref}
      empresaId={empresaId}
      api={API}
      modeloSugerido={MODELO_SUGERIDO}
      demonstrativo="DFC"
      exemploNivel1="Fluxo de Caixa Operacional"
    />
  );
});

DfcMascarasTab.displayName = 'DfcMascarasTab';

export default DfcMascarasTab;
