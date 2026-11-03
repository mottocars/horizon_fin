const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const { CORES, corrigirArquivo } = require('../../utils/excelMarca');
const exportacao = require('./exportacao.service');
const bases = require('./planilhas/bases');
const calculo = require('./planilhas/calculo');
const dre = require('./planilhas/dre');
const roteiro = require('./planilhas/roteiro');
const { dataBr, dataHoraBr, rotuloCentro } = require('./planilhas/comum');

// Monta o .xlsx de auditoria da DRE (Operações › DRE Gerencial, botão Exportar Excel): Roteiro, DRE, DRE
// Mensal, Memória de Cálculo, POC, as bases (Financeiro, Unidades, Correções, Orçamento), Plano de
// Contas, Fora da DRE e Parâmetros. A DRE, a memória e as POCs são fórmulas sobre as bases — o Excel
// refaz a conta inteira ao abrir — com o valor do sistema ao lado pra conferir. Devolve { buffer, nome }.

async function gerar(empresaId, { de, ate, centros = [] }, usuarioId) {
  const [d, { rows: usuarios }] = await Promise.all([
    exportacao.dados(empresaId, { de, ate, centros }),
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]),
  ]);
  const empresa = d.extras.empresa || `Empresa ${empresaId}`;
  const meta = {
    filtros: [
      ['Empresa', empresa],
      ['Período', `${dataBr(de)} a ${dataBr(ate)}`],
      ['Centros de custo', d.filtrado ? d.m.obras.map((c) => rotuloCentro(c)).join(', ') : 'Todos com "Realiza DRE"'],
    ],
    gerado: `Gerado por ${usuarios[0]?.nome || 'usuário'} em ${dataHoraBr(new Date())}`,
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // As abas na ordem do arquivo (preenchidas depois: as fórmulas de uma apontam pra outras).
  const cor = (argb) => ({ properties: { tabColor: { argb } } });
  const abas = {
    roteiro: workbook.addWorksheet(roteiro.NOMES.roteiro, cor(CORES.AZUL)),
    dre: workbook.addWorksheet(dre.NOMES.dre, cor('FF174A70')),
    mensal: workbook.addWorksheet(dre.NOMES.mensal, cor('FF174A70')),
    memoria: workbook.addWorksheet(calculo.NOMES.memoria, cor(CORES.TEAL)),
    poc: workbook.addWorksheet(calculo.NOMES.poc, cor(CORES.TEAL)),
    financeiro: workbook.addWorksheet(bases.NOMES.financeiro, cor(CORES.CINZA)),
    unidades: workbook.addWorksheet(bases.NOMES.unidades, cor(CORES.CINZA)),
    correcoes: workbook.addWorksheet(bases.NOMES.correcoes, cor(CORES.CINZA)),
    orcamento: workbook.addWorksheet(bases.NOMES.orcamento, cor(CORES.CINZA)),
    plano: workbook.addWorksheet(bases.NOMES.plano, cor(CORES.CINZA_BORDA)),
    fora: workbook.addWorksheet(bases.NOMES.fora, cor(CORES.VERMELHO)),
    parametros: workbook.addWorksheet(roteiro.NOMES.parametros, cor(CORES.CINZA_BORDA)),
  };

  const L = bases.linhas(d);
  const LY = bases.layouts(L);
  const C = calculo.montar(d, LY);

  bases.escrever(workbook, abas, LY, L, d, meta);
  calculo.escrever(workbook, abas, C, d, meta);
  const grade = dre.escreverDre(workbook, abas.dre, d, C, meta);
  dre.escreverMensal(workbook, abas.mensal, d, C, meta);
  roteiro.escreverParametros(workbook, abas.parametros, d, { L, LY, C }, meta);
  roteiro.escreverRoteiro(workbook, abas.roteiro, d, { L, LY, C, dre: grade }, meta);

  const buffer = await corrigirArquivo(await workbook.xlsx.writeBuffer(), { ignorarAvisos: true });
  const nome = `DRE auditoria - ${empresa} - ${dataBr(de).replace(/\//g, '-')} a ${dataBr(ate).replace(/\//g, '-')}.xlsx`;
  return { buffer, nome };
}

module.exports = { gerar };
