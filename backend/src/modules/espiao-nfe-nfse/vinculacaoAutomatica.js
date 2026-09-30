const pool = require('../../config/db');
const { vincularAutomaticamente } = require('./vinculo.service');

// Varredura de vínculo automático nota ↔ título do contas a pagar (Sienge),
// por empresa. Sempre olha desde a PRIMEIRA nota ainda sem vínculo até hoje
// (não usa o período da tela) e vincula o que casar 3/3 de forma inequívoca
// (ver vinculo.service.js::vincularAutomaticamente).
//
// Quem roda isto em segundo plano, guarda o log, o histórico e o horário
// agendado é o Monitor de Integrações (monitor-integracoes/, rotina
// 'espiao_vinculacao') — tanto o botão da tela do Espião quanto a rotina
// agendada passam por lá. Aqui fica só a varredura em si, que vai contando o
// andamento em `etapas` (o log por etapa que a janela do Espião mostra).

const FUSO = 'America/Sao_Paulo';

function hojeSaoPaulo(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(data); // YYYY-MM-DD
}

function formatarDataBr(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

const ETAPAS_INICIAIS = () => [
  { chave: 'notas', titulo: 'Notas sem vínculo', status: 'carregando' },
  { chave: 'NFE', titulo: 'Notas de produto (NF-e)', status: 'aguardando' },
  { chave: 'NFSE', titulo: 'Notas de serviço (NFS-e)', status: 'aguardando' },
  { chave: 'vinculacao', titulo: 'Conferência e vínculo', status: 'aguardando' },
];

// `aoAtualizarEtapas(etapas)` é chamado a cada mudança do log. Devolve
// { resumo (texto curto pro histórico), resultado }. Lança em caso de falha
// — com a etapa em andamento já marcada como erro.
async function executarVarredura(empresaId, { usuarioId = null, aoAtualizarEtapas = () => {} } = {}) {
  let etapas = ETAPAS_INICIAIS();
  const atualizar = (chave, dados) => {
    etapas = etapas.map((etapa) => (etapa.chave === chave ? { ...etapa, ...dados } : etapa));
    aoAtualizarEtapas(etapas);
  };
  aoAtualizarEtapas(etapas);

  try {
    const { rows } = await pool.query(
      `SELECT min(data_emissao)::date::text AS desde, count(*)::int AS total
       FROM espiao_notas n
       WHERE empresa_id = $1 AND inativa = FALSE AND apenas_resumo = FALSE
         AND situacao_categoria IS DISTINCT FROM 'cancelada'
         AND NOT EXISTS (SELECT 1 FROM espiao_notas_vinculos v WHERE v.nota_id = n.id)`,
      [empresaId]
    );
    const { desde, total } = rows[0];

    if (!total) {
      atualizar('notas', { status: 'sucesso', detalhe: 'Todas as notas já estão vinculadas.' });
      atualizar('NFE', { status: 'ignorado', detalhe: 'Nada a vincular.' });
      atualizar('NFSE', { status: 'ignorado', detalhe: 'Nada a vincular.' });
      atualizar('vinculacao', { status: 'sucesso', detalhe: 'Nenhum vínculo novo.' });
      return { resumo: 'Todas as notas já estavam vinculadas.', resultado: { vinculados: 0, ambiguos: 0, notasAnalisadas: 0 } };
    }

    atualizar('notas', { status: 'sucesso', detalhe: `${total} nota(s) sem vínculo, desde ${formatarDataBr(desde)} até hoje.` });

    const concluidos = new Set();
    const resultado = await vincularAutomaticamente(empresaId, {
      dataInicio: desde,
      dataFim: hojeSaoPaulo(),
      usuarioId,
      simular: false,
      aoProgredir: (tipo, dados) => {
        const detalhe =
          dados.status === 'ignorado'
            ? 'Nenhuma nota sem vínculo deste tipo.'
            : dados.status === 'sem_configuracao'
              ? `${dados.notas} nota(s) sem vínculo, mas falta configurar o código do documento (aba Configurações).`
              : dados.status === 'sucesso'
                ? `${dados.titulos} título(s) no Sienge conferidos.`
                : undefined;
        atualizar(tipo, { ...dados, ...(detalhe ? { detalhe } : {}) });
        if (dados.status !== 'carregando') concluidos.add(tipo);
        if (concluidos.size === 2) atualizar('vinculacao', { status: 'carregando' });
      },
    });

    const vinculados = resultado.vinculos.length;
    const ambiguos = resultado.ambiguos.length;
    atualizar('vinculacao', {
      status: 'sucesso',
      detalhe:
        `${vinculados} nota(s) vinculada(s) automaticamente` +
        (ambiguos ? ` · ${ambiguos} caso(s) ambíguo(s) ficaram para conferência manual.` : '.'),
    });
    return {
      resumo: `${vinculados} nota(s) vinculada(s) de ${total} sem vínculo` + (ambiguos ? ` · ${ambiguos} ambígua(s)` : ''),
      resultado: { vinculados, ambiguos, notasAnalisadas: total },
    };
  } catch (err) {
    const emAndamento = etapas.find((e) => e.status === 'carregando');
    if (emAndamento) atualizar(emAndamento.chave, { status: 'erro', detalhe: err.message || 'Falha na varredura.' });
    throw err;
  }
}

module.exports = { executarVarredura, hojeSaoPaulo };
