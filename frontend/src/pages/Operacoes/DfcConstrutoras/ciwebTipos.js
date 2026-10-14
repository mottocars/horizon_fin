import { CalendarClock, FileBarChart } from 'lucide-react';
import { baixarDcd, excluirDcd, exportarDcd, importarDcd, listDcdContratos } from '../../../api/dcd.api';
import {
  baixarExtrato,
  excluirExtrato,
  exportarExtrato,
  importarExtrato,
  listExtratoEmpreendimentos,
} from '../../../api/extrato.api';

// Mesmas APIs e regras da tela Integrações > Portal das Construtoras (PortalConstrutorasPage.jsx)
// — esta aba é um espelho dela, só com DCD e Geral (o antigo "Extrato dos Empreendimentos";
// por baixo, a API e as tabelas continuam com o nome extrato): os dados são os mesmos
// (importar aqui aparece lá, e vice-versa).
export const TIPOS_CIWEB = {
  DCD: {
    label: 'DCD',
    labelLongo: 'DCD',
    descricao: 'Demonstrativo de Cronograma de Desembolso',
    formato: 'PDF',
    icone: CalendarClock,
    cor: 'bg-emerald-50 text-emerald-600',
    prefixoArquivo: 'DCD',
    listar: listDcdContratos,
    importar: importarDcd,
    baixar: baixarDcd,
    exportar: exportarDcd,
    excluir: excluirDcd,
    idField: 'numero_contrato',
    extensaoArquivo: 'pdf',
    aceita: '.pdf,application/pdf',
  },
  EXTRATO: {
    label: 'Geral',
    labelLongo: 'Geral dos Empreendimentos',
    descricao: 'Geral completo por empreendimento',
    formato: 'Excel (.xls / .xlsx)',
    icone: FileBarChart,
    cor: 'bg-orange-50 text-orange-600',
    prefixoArquivo: 'GERAL',
    listar: listExtratoEmpreendimentos,
    importar: importarExtrato,
    baixar: baixarExtrato,
    exportar: exportarExtrato,
    excluir: excluirExtrato,
    idField: 'contrato_empreendimento',
    extensaoArquivo: 'xls',
    aceita: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};
