const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const { z, falha, br, quando, isoDe, carregar, resolverObra } = require('./base');

// obras_versoes — o versionamento do cronograma (Operações › Cronogramas Obras): cada versão gravada
// (número, quando, quem, observação, as obras alteradas com as datas antes → depois e o comunicado de
// WhatsApp) e as alterações pendentes, que ainda não valem (só entram quando uma nova versão é gravada).

function mudancas(alt) {
  return (alt.etapas || []).flatMap((m) => {
    const out = [];
    if (m.inicio_antes !== m.inicio_depois) out.push(`${m.etapa}: início ${br(m.inicio_antes) || '—'} → ${br(m.inicio_depois) || '—'}`);
    if (m.ultima && m.fim_antes !== m.fim_depois) out.push(`${m.etapa}: término ${br(m.fim_antes) || '—'} → ${br(m.fim_depois) || '—'}`);
    return out;
  });
}
const comunicado = (c) =>
  !c
    ? 'sem registro'
    : {
        status: c.status,
        enviados_para: (c.enviados || []).map((e) => e.nome),
        falhas: (c.falhas || []).map((f) => (typeof f === 'string' ? f : `${f.nome || ''}: ${f.erro || f.motivo || JSON.stringify(f)}`)),
      };

const versoesTool = {
  name: 'obras_versoes',
  description:
    'Histórico das mudanças do cronograma das obras (versões gravadas em Operações › Cronogramas Obras). Sem número: a lista das versões (número, data, quem gravou, observação, ' +
    'obras alteradas e se o comunicado de WhatsApp foi enviado) e as alterações PENDENTES (datas já editadas que ainda não valem — só entram quando alguém grava uma nova versão). ' +
    'Com numero: o detalhe da versão, obra a obra, com cada data antes → depois. Com obra: todas as versões que mexeram nessa obra. Use para "o que mudou no cronograma", ' +
    '"quando o lançamento do X foi adiado", "quem alterou".',
  inputSchema: {
    numero: z.number().int().positive().optional().describe('Número da versão.'),
    obra: z.string().optional().describe('Só as versões que alteraram esta obra (código, apelido ou nome).'),
    limite: z.number().int().positive().max(50).optional().describe('Quantas versões listar (padrão 10).'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const d = await carregar(empresaId);
    let obra = null;
    if (args.obra) obra = resolverObra(d.obras, args.obra);
    const { rows } = await pool.query(
      `SELECT v.numero, v.criado_em, v.observacao, v.alteracoes, v.comunicado, u.nome AS por
         FROM cronograma_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por
        WHERE v.empresa_id = $1 AND ($2::int IS NULL OR v.numero = $2)
        ORDER BY v.numero DESC`,
      [empresaId, args.numero ?? null]
    );
    if (args.numero && !rows.length) throw falha(`A versão ${args.numero} não existe. Use obras_versoes sem número para ver a lista.`);
    const doFiltro = (v) => (obra ? (v.alteracoes || []).filter((a) => Number(a.sienge_id) === obra.id) : v.alteracoes || []);
    const lista = rows.filter((v) => doFiltro(v).length || (!obra && !(v.alteracoes || []).length)).slice(0, args.numero ? 1 : args.limite || 10);
    const etapaNome = new Map(d.etapas.map((e) => [String(e.id), e.descricao]));
    const nomeDe = new Map(d.obras.map((o) => [o.id, o.nome]));
    return {
      empresa: d.empresa,
      total_de_versoes: rows.length && !args.numero ? rows[0].numero : undefined,
      versoes: lista.map((v) => ({
        versao: v.numero,
        gravada_em: quando(v.criado_em),
        por: v.por,
        observacao: v.observacao,
        obras_alteradas: doFiltro(v).map((a) => ({
          obra: nomeDe.get(Number(a.sienge_id)) || a.nome,
          ...(args.numero || obra ? { mudancas: mudancas(a) } : {}),
        })),
        comunicado_whatsapp: comunicado(v.comunicado),
      })),
      pendentes: d.obras
        .filter((o) => o.pendencia && (!obra || o.id === obra.id))
        .map((o) => ({
          obra: o.nome,
          por: o.pendencia.por,
          em: quando(o.pendencia.atualizado_em),
          novos_inicios: Object.fromEntries(Object.entries(o.pendencia.datas || {}).map(([k, v]) => [etapaNome.get(k) || k, v ? br(v) : 'apagar a etapa'])),
          novo_termino: o.pendencia.termino_alterado ? br(isoDe(o.pendencia.data_termino)) : undefined,
        })),
      observacao: 'Alteração pendente não vale ainda: o cronograma, o dashboard e o Excel continuam na última versão gravada até alguém gravar uma nova.',
    };
  }),
};

module.exports = { versoesTool };
