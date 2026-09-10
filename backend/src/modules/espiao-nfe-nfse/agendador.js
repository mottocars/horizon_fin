// Agendador real das "Consultas Automáticas" do Espião NFe/NFSe.
//
// Antes, o botão "Consultas Automáticas" só salvava o intervalo escolhido em
// espiao_agendamentos — nada nunca lia essa tabela pra disparar a consulta
// de verdade. Este módulo é o que faltava: de tempos em tempos (INTERVALO_
// VERIFICACAO_MS), verifica quais empresas já venceram o intervalo
// configurado e dispara a consulta de cada uma, uma de cada vez.
//
// O limite de 1 consulta/hora por CNPJ da Receita já é respeitado dentro de
// consultarPorCertificado (devolve ok:false sem lançar erro quando ainda não
// passou 1h) — então chamar consultarEmpresa aqui repetidamente é seguro,
// mesmo que o intervalo configurado seja menor que 1h.
const service = require('./espiao.service');

const INTERVALO_VERIFICACAO_MS = 15 * 60 * 1000; // checa a cada 15 min

let executando = false;
let timer = null;

async function executarTick() {
  // Evita rodar duas verificações ao mesmo tempo se uma consulta anterior
  // ainda estiver em andamento quando o próximo tick chegar.
  if (executando) return;
  executando = true;

  try {
    const pendentes = await service.listAgendamentosPendentes();
    for (const agendamento of pendentes) {
      try {
        const resultado = await service.consultarEmpresa(agendamento.empresa_id);
        const totalSalvas = resultado.resultados.reduce(
          (soma, r) => soma + (r.notasProdutosSalvas || 0) + (r.notasServicosSalvas || 0),
          0
        );
        console.log(
          `[agendador-espiao] empresa ${agendamento.empresa_id}: consulta automática concluída, ${totalSalvas} nota(s) nova(s).`
        );
      } catch (err) {
        // Uma empresa falhando (ex.: sem certificado válido) não pode
        // travar as próximas do mesmo tick.
        console.error(`[agendador-espiao] falha na consulta automática da empresa ${agendamento.empresa_id}:`, err.message);
      } finally {
        // Marca como executado mesmo em erro — senão uma empresa com
        // problema persistente (ex.: certificado vencido) seria retentada
        // a cada tick (15 min) pra sempre, martelando a Receita.
        await service.marcarAgendamentoExecutado(agendamento.empresa_id);
      }
    }
  } catch (err) {
    console.error('[agendador-espiao] falha ao verificar agendamentos pendentes:', err.message);
  } finally {
    executando = false;
  }
}

function iniciar() {
  if (timer) return; // já iniciado — evita duplicar o setInterval em hot-reload
  console.log(`[agendador-espiao] iniciado — verifica agendamentos pendentes a cada ${INTERVALO_VERIFICACAO_MS / 60000} min.`);
  timer = setInterval(executarTick, INTERVALO_VERIFICACAO_MS);
  // Roda uma vez logo na subida também, sem esperar o primeiro intervalo.
  executarTick();
}

function parar() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { iniciar, parar, executarTick };
