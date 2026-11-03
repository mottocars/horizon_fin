const pool = require('../../config/db');
const { executarVarredura } = require('../espiao-nfe-nfse/vinculacaoAutomatica');
const repassesCef = require('../repasses-cef/repassesCef.service');
const income = require('../income-sienge/income.service');
const outcome = require('../outcome-sienge/outcome.service');
const businessBudget = require('../business-budget-sienge/businessBudget.service');
const extratoContas = require('../extrato-contas-sienge/extratoContas.service');
const customers = require('../customers-sienge/customers.service');
const clusters = require('../cobranca-clusters/cobrancaClusters.service');
const itau = require('../integracoes-itau/itau.service');
const distribuicao = require('../regua-cobranca/distribuicao.service');
const prevision = require('../prevision-dashboards/prevision.service');
const centrosCusto = require('../centros-custo-sienge/centros.service');
const planosFinanceiros = require('../planos-financeiros-sienge/planos.service');

// Catálogo das atualizações que o Monitor de Integrações agenda e executa.
// Cada uma é a MESMA função que o botão da tela de origem já chamava — o
// monitor só passa a disparar em segundo plano, no horário, e registrar.
// A tela agrupa pelo SISTEMA de onde vem o dado (`integracao`: Sienge,
// Construtor de Vendas, Prevision, API Itaú, Horizon) — pedido do usuário: a
// mesma base atende várias telas, então `alimenta` lista as telas que usam o
// que a rotina atualiza. A ordem do catálogo é a da tela (ORDEM, no fim):
// dentro do Sienge, os cadastros antes das bases.
//
// executar({ empresaId, usuarioId, progresso, etapas }) → texto de resumo.
//   progresso({ texto, paginaAtual, totalPaginas }) — andamento pra barra;
//   etapas(lista) — log detalhado por etapa (só a vinculação do Espião usa).
// disponibilidade(empresaId) → null se dá pra rodar, ou o motivo de não dar
// (integração não configurada etc.) — a tela mostra e desabilita.

const temSienge = async (empresaId) =>
  (await pool.query('SELECT 1 FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE', [empresaId])).rowCount > 0;
const semSienge = async (empresaId) =>
  (await temSienge(empresaId)) ? null : 'Esta empresa não tem uma integração Sienge ativa (Integrações > Sienge).';

const porPagina = (progresso, texto) => (p) => progresso({ texto, paginaAtual: p.paginaAtual, totalPaginas: p.totalPaginas });
const n = (valor) => Number(valor || 0).toLocaleString('pt-BR');

const CATALOGO = [
  {
    chave: 'sienge_centros_custo',
    alimenta: ['Cadastros › Centros de Custo', 'DFC Construtoras', 'DRE Gerencial', 'Cronogramas de Obras', 'Repasses CEF', 'Dashboards'],
    nome: 'Cadastro de centros de custo (Sienge)',
    descricao:
      'Traz do Sienge os centros de custo (empreendimentos) novos e atualiza nome, empresa, CNPJ e tipo dos existentes — o mesmo botão de Cadastros › Centros de Custo. Não mexe no que é do Horizon (apelido, natureza, Projeta DFC, Realiza DRE, pilar, responsável, cronograma). Centro que não estiver cadastrado fica fora do DFC e da DRE.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Buscando os centros de custo no Sienge' });
      const antes = (await pool.query('SELECT count(*)::int AS n FROM centros_custo_sienge WHERE empresa_id = $1', [empresaId])).rows[0].n;
      const r = await centrosCusto.gerar(empresaId);
      const depois = (await pool.query('SELECT count(*)::int AS n FROM centros_custo_sienge WHERE empresa_id = $1', [empresaId])).rows[0].n;
      return `${n(r.total_importado)} centro(s) de custo lido(s) do Sienge${depois > antes ? `; ${n(depois - antes)} novo(s)` : '; nenhum novo'}.`;
    },
  },
  {
    chave: 'sienge_plano_contas',
    alimenta: ['Cadastros › Planos Financeiros', 'DFC Construtoras', 'DRE Gerencial', 'Dashboards'],
    nome: 'Plano de contas (Sienge)',
    descricao:
      'Traz do Sienge as naturezas (plano financeiro) novas e atualiza nome, tipo e situação das existentes — o mesmo botão das abas Plano Contas. Mantém a classificação do Horizon (máscaras do DFC e da DRE, pacote, responsável). Natureza nova entra sem classificação: confira no Plano Contas do DFC e da DRE.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Buscando o plano de contas no Sienge' });
      const antes = (await pool.query('SELECT count(*)::int AS n FROM planos_financeiros_sienge WHERE empresa_id = $1', [empresaId])).rows[0].n;
      const r = await planosFinanceiros.gerar(empresaId);
      const depois = (await pool.query('SELECT count(*)::int AS n FROM planos_financeiros_sienge WHERE empresa_id = $1', [empresaId])).rows[0].n;
      return `${n(r.total_importado)} conta(s) lida(s) do Sienge${depois > antes ? `; ${n(depois - antes)} nova(s) — classifique no Plano Contas do DFC e da DRE` : '; nenhuma nova'}.`;
    },
  },
  {
    chave: 'espiao_vinculacao',
    alimenta: ['Espião NFe / NFS-e'],
    nome: 'Vinculação ao contas a pagar',
    descricao:
      'Procura no contas a pagar do Sienge o título de cada nota ainda sem vínculo (desde a primeira delas) e vincula as que conferem em CNPJ, data e nº.',
    integracao: 'sienge',
    async disponibilidade(empresaId) {
      const motivo = await semSienge(empresaId);
      if (motivo) return motivo;
      const { rows } = await pool.query(
        'SELECT codigo_documento_nfe, codigo_documento_nfse FROM espiao_configuracoes WHERE empresa_id = $1',
        [empresaId]
      );
      if (!rows[0]?.codigo_documento_nfe && !rows[0]?.codigo_documento_nfse) {
        return 'Falta configurar os códigos de documento do contas a pagar (Espião NFe/NFSe > Configurações).';
      }
      return null;
    },
    async executar({ empresaId, usuarioId, etapas, progresso }) {
      const { resumo } = await executarVarredura(empresaId, {
        usuarioId,
        aoAtualizarEtapas: (lista) => {
          etapas(lista);
          const atual = lista.find((e) => e.status === 'carregando');
          progresso(
            atual && { texto: atual.etapa ? `${atual.titulo} — ${atual.etapa}` : atual.titulo, paginaAtual: atual.paginaAtual, totalPaginas: atual.totalPaginas }
          );
        },
      });
      return resumo;
    },
  },
  {
    chave: 'repasses_contratos',
    alimenta: ['Repasses CEF', 'DRE Gerencial', 'Dashboard Demonstração do Resultado'],
    nome: 'Contratos de venda (Sienge)',
    descricao: 'Recarrega todos os contratos de venda do Sienge, que alimentam a etapa Contrato do kanban de Repasses CEF.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      const r = await repassesCef.sincronizarContratos(empresaId, porPagina(progresso, 'Buscando contratos no Sienge'));
      return `${n(r.total_importado)} contrato(s) importado(s).`;
    },
  },
  {
    chave: 'repasses_reservas',
    alimenta: ['Repasses CEF'],
    nome: 'Reservas (Construtor de Vendas)',
    descricao: 'Recarrega todas as reservas do Construtor de Vendas, que alimentam a etapa Reserva do kanban de Repasses CEF.',
    integracao: 'construtor-vendas',
    async disponibilidade(empresaId) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM integracoes_construtor_vendas WHERE empresa_id = $1 AND ativo = TRUE',
        [empresaId]
      );
      return rowCount ? null : 'Esta empresa não tem uma integração Construtor de Vendas ativa (Integrações > Construtor de Vendas).';
    },
    async executar({ empresaId, progresso }) {
      const r = await repassesCef.sincronizarReservas(empresaId, porPagina(progresso, 'Buscando reservas no Construtor de Vendas'));
      return `${n(r.total_importado)} reserva(s) importada(s).`;
    },
  },
  {
    chave: 'cobranca_base',
    alimenta: ['Gestão de Cobranças', 'DFC Construtoras', 'Aging List', 'DRE Gerencial', 'Dashboard Demonstração do Resultado'],
    nome: 'Base do contas a receber (Sienge)',
    descricao: 'Recarrega parcelas e recebimentos do contas a receber do Sienge — a base de toda a Gestão de Cobranças.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Buscando o contas a receber no Sienge (pode levar alguns minutos)' });
      const r = await income.sincronizar(empresaId, porPagina(progresso, 'Buscando o contas a receber no Sienge'));
      return `${n(r.total_importado)} parcela(s) importada(s).`;
    },
  },
  {
    chave: 'cobranca_clientes',
    alimenta: ['Gestão de Cobranças', 'Aging List'],
    nome: 'Clientes (Sienge)',
    descricao: 'Recarrega o cadastro de clientes do Sienge (dados pessoais, contatos e endereços).',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      const r = await customers.sincronizar(empresaId, porPagina(progresso, 'Buscando clientes no Sienge'));
      return `${n(r.total_importado)} cliente(s) importado(s).`;
    },
  },
  {
    chave: 'cobranca_clusters',
    alimenta: ['Gestão de Cobranças'],
    nome: 'Recálculo dos clusters',
    descricao:
      'Recalcula o cluster (bom pagador, duvidoso, mau pagador...) de cada cliente com a versão vigente do Motor de Risco. Agende depois da atualização da base.',
    integracao: 'horizon',
    async disponibilidade(empresaId) {
      const { rowCount } = await pool.query('SELECT 1 FROM motor_risco_versoes WHERE empresa_id = $1 LIMIT 1', [empresaId]);
      return rowCount ? null : 'Publique uma versão do Motor de Risco desta empresa antes (Gestão de Cobranças > Motor de Risco).';
    },
    async executar({ empresaId, usuarioId, progresso }) {
      progresso({ texto: 'Recalculando os clusters dos clientes' });
      const r = await clusters.recalcularClusters(empresaId, usuarioId);
      return `${n(r.total_clientes)} cliente(s) recalculado(s) com a versão ${r.versao_utilizada} do Motor de Risco.`;
    },
  },
  {
    chave: distribuicao.ROTINA_MONITOR,
    alimenta: ['Gestão de Cobranças'],
    nome: 'Distribuição da Rotina de Cobrança',
    descricao:
      'Distribui os clientes da Rotina do dia entre os atendentes (Distribuição automática da Régua de Cobrança): continuidade da carteira, faixas de atraso, quantidade e valor equilibrados. Agende depois da atualização da base e dos clusters.',
    integracao: 'horizon',
    disponibilidade: (empresaId) => distribuicao.motivoIndisponivel(empresaId),
    async executar({ empresaId, usuarioId, progresso }) {
      progresso({ texto: 'Distribuindo os clientes da Rotina de hoje' });
      const { resumo } = await distribuicao.distribuirDia(empresaId, { usuarioId });
      return resumo;
    },
  },
  {
    chave: 'itau_certificado',
    alimenta: ['Saldo Contas Bancárias'],
    nome: 'Renovação do certificado (API Itaú)',
    descricao:
      'Renova o certificado dinâmico das conexões API Itaú quando faltam 30 dias ou menos para vencer (o Itaú só aceita a renovação nessa janela). Fora dela, só confere a validade.',
    integracao: 'itau',
    async disponibilidade(empresaId) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM conexoes_itau WHERE empresa_id = $1 AND ativo = TRUE AND certificado_pem IS NOT NULL',
        [empresaId]
      );
      return rowCount ? null : 'Esta empresa não tem uma conexão API Itaú ativa com certificado gerado (Integrações > Contas Bancárias).';
    },
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Conferindo a validade dos certificados do Itaú' });
      return itau.renovarCertificadosDaEmpresa(empresaId);
    },
  },
  {
    chave: 'dfc_contas_pagar_base',
    alimenta: ['DFC Construtoras', 'Aging List', 'DRE Gerencial', 'Dashboard Demonstração do Resultado'],
    nome: 'Base do contas a pagar (Sienge)',
    descricao:
      'Recarrega parcelas, rateios e pagamentos do contas a pagar do Sienge (a base inteira, ou só os títulos emitidos nos últimos N dias com o parâmetro Dias retroativos) — a base do Aging a pagar nos Orçamentos do DFC Construtoras e do Aging List.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    parametros: [
      {
        chave: 'dias_retroativos',
        rotulo: 'Dias retroativos',
        tipo: 'inteiro',
        min: 1,
        max: 10000,
        vazio: 'Base inteira (todos os títulos)',
        ajuda:
          'Busca no Sienge só os títulos com data de emissão nos últimos N dias e mantém as demais parcelas já gravadas. Atenção: título emitido antes da janela não é atualizado — pagamento, baixa, cancelamento ou mudança de valor dele só entram rodando com o campo vazio. Empresa ainda sem base vem completa.',
      },
    ],
    async executar({ empresaId, progresso, parametros = {} }) {
      progresso({ texto: 'Buscando o contas a pagar no Sienge (pode levar alguns minutos)' });
      // A resposta é gravada enquanto chega: o progresso é a contagem de parcelas já gravadas.
      const r = await outcome.sincronizar(empresaId, (p) => progresso({ texto: `Gravando o contas a pagar do Sienge: ${n(p.lidas)} parcela(s)` }), {
        diasRetroativos: parametros.dias_retroativos || null,
      });
      const janela = r.desde
        ? ` Janela: títulos emitidos de ${r.desde.split('-').reverse().join('/')} em diante (últimos ${n(parametros.dias_retroativos)} dias; parcelas de títulos emitidos antes mantidas).`
        : r.completa
          ? ' A empresa ainda não tinha base: veio completa, sem a janela de Dias retroativos.'
          : '';
      return `${n(r.total_importado)} parcela(s) importada(s).${janela}`;
    },
  },
  {
    chave: 'dfc_orcamento_empresarial_base',
    alimenta: ['DFC Construtoras', 'Dashboard Fluxo de Caixa'],
    nome: 'Base do orçamento empresarial (Sienge)',
    descricao:
      'Recarrega o Orçamento Empresarial do Sienge (todas as versões) — a base das naturezas EMPRESARIAL DESEMBOLSO nos Orçamentos do DFC Construtoras, espalhadas pelo cronograma de desembolso de cada natureza.',
    integracao: 'sienge',
    disponibilidade: semSienge,
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Buscando o orçamento empresarial no Sienge (pode levar alguns minutos)' });
      const r = await businessBudget.sincronizar(empresaId, porPagina(progresso, 'Buscando o orçamento empresarial no Sienge'));
      return `${n(r.total_importado)} orçamento(s) importado(s), ${n(r.valores)} valor(es) mensal(is).`;
    },
  },
  {
    chave: 'dfc_saldos_contas',
    alimenta: ['DFC Construtoras', 'Dashboard Fluxo de Caixa', 'DRE Gerencial', 'Dashboard Demonstração do Resultado'],
    nome: 'Saldos das contas (Sienge)',
    descricao:
      'Busca o extrato até hoje (completo desde 01/01/2000, ou só os últimos N dias com o parâmetro Dias retroativos) de todas as contas bancárias — as com Projeta DFC formam o saldo e o realizado do fluxo de caixa do DFC Construtoras; as demais (mútuo etc.) servem pra herdar a natureza da outra perna do lançamento.',
    integracao: 'sienge',
    async disponibilidade(empresaId) {
      const motivo = await semSienge(empresaId);
      if (motivo) return motivo;
      const { rowCount } = await pool.query(
        'SELECT 1 FROM contas_bancarias_sienge WHERE empresa_id = $1 AND projeta_dfc LIMIT 1',
        [empresaId]
      );
      return rowCount ? null : 'Nenhuma conta com Projeta DFC marcado (DFC Construtoras > Contas Correntes).';
    },
    // Parâmetros editáveis no Monitor (por empresa). Vazio = o padrão.
    parametros: [
      {
        chave: 'dias_retroativos',
        rotulo: 'Dias retroativos',
        tipo: 'inteiro',
        min: 1,
        max: 10000,
        vazio: 'Todo o histórico (desde 01/01/2000)',
        ajuda:
          'Busca no Sienge só os lançamentos dos últimos N dias e mantém o histórico anterior já gravado. Mudanças no Sienge em datas mais antigas só entram se rodar com o campo vazio. Conta ainda sem extrato vem completa.',
      },
    ],
    async executar({ empresaId, progresso, parametros = {} }) {
      const r = await extratoContas.sincronizar(empresaId, progresso, { diasRetroativos: parametros.dias_retroativos || null });
      const ate = r.ate.split('-').reverse().join('/');
      const janela = r.desde
        ? ` Janela: ${r.desde.split('-').reverse().join('/')} a ${ate} (últimos ${n(parametros.dias_retroativos)} dias; histórico anterior mantido${
            r.completas ? `; ${n(r.completas)} conta(s) sem extrato vieram completas` : ''
          }).`
        : '';
      // Mesma conta em várias empresas (ex.: REAPROPFIN em cada SPE) aparece uma vez, com a contagem.
      const nomes = (lista) => {
        const cont = new Map();
        lista.forEach((f) => {
          const k = f.numero_conta + (f.nome ? ` (${f.nome})` : '');
          cont.set(k, (cont.get(k) || 0) + 1);
        });
        return [...cont].map(([k, q]) => (q > 1 ? `${k} em ${q} empresas` : k)).join(', ');
      };
      // Conta com Projeta DFC sem atualizar = saldo/realizado desatualizado: a rotina termina com erro
      // (as demais contas já foram gravadas). Conta só de apoio (mútuo etc.): aviso no resumo.
      const doDfc = r.falhas.filter((f) => f.projeta_dfc);
      const apoio = r.falhas.filter((f) => !f.projeta_dfc);
      if (doDfc.length) {
        const e = new Error(
          `O Sienge não devolveu o extrato de ${doDfc.length} conta(s) com Projeta DFC: ${nomes(doDfc)}. ` +
            `As demais ${n(r.contas - r.falhas.length)} contas foram atualizadas até ${ate}; essas mantêm o extrato anterior. ` +
            `Costuma ser instabilidade do Sienge — tente atualizar de novo em alguns minutos. (${doDfc[0].erro})`
        );
        e.expose = true;
        throw e;
      }
      return (
        `${n(r.contas - apoio.length)} conta(s), ${n(r.lancamentos)} lançamento(s) até ${ate}.${janela}` +
        (apoio.length ? ` Sem atualizar (instabilidade do Sienge; mantido o extrato anterior, não entram no saldo): ${nomes(apoio)}.` : '')
      );
    },
  },
  {
    chave: 'prevision_dashboards',
    alimenta: ['DFC Construtoras', 'Cronogramas de Obras'],
    nome: 'Avanço e curva S das obras (Prevision)',
    descricao:
      'Busca no Prevision o dashboard de cada obra com Código Prevision (aba Centros Custos) e atualiza o avanço previsto mês a mês (DFC Construtoras › Avanços, base da Projeção CEF) e a curva S de base que define os atrasos (Cronogramas Obras). A mesma sincronização de Integrações › Prevision.',
    integracao: 'prevision',
    async disponibilidade(empresaId) {
      const { rowCount } = await pool.query('SELECT 1 FROM integracoes_prevision WHERE empresa_id = $1 AND ativo = TRUE', [empresaId]);
      if (!rowCount) return 'Esta empresa não tem uma integração Prevision ativa (Integrações > Prevision).';
      const { rows } = await pool.query(
        "SELECT count(*)::int AS n FROM centros_custo_sienge WHERE empresa_id = $1 AND COALESCE(codigo_prevision, '') <> ''",
        [empresaId]
      );
      return rows[0].n ? null : 'Nenhum centro de custo desta empresa tem Código Prevision (Cadastros > Centros de Custos).';
    },
    async executar({ empresaId, progresso }) {
      progresso({ texto: 'Conectando ao Prevision' });
      const r = await prevision.sincronizar(empresaId, progresso);
      const obras = r.total_centros;
      // Obra com alguma visão sem atualizar = avanço/curva S desatualizados: termina com erro (as demais já
      // foram gravadas; a que falhou mantém os dados anteriores).
      const falhas = r.detalhes.filter((d) => !d.sucesso);
      const nomesFalha = [...new Set(falhas.map((f) => f.nome))];
      if (falhas.length) {
        const e = new Error(
          `O Prevision não devolveu ${nomesFalha.length} de ${n(obras)} obra(s): ${nomesFalha.join(', ')} — essas mantêm os dados anteriores; as demais foram atualizadas. (${falhas[0].erro})`
        );
        e.expose = true;
        throw e;
      }
      return `${n(obras)} obra(s) atualizada(s) no Prevision (visão primária e secundária): avanço previsto e curva S de base.`;
    },
  },
];

// Ordem na tela: por sistema e, dentro dele, na sequência em que faz sentido rodar (cadastros, bases,
// depois o que depende delas).
const ORDEM = [
  'sienge_centros_custo',
  'sienge_plano_contas',
  'cobranca_clientes',
  'cobranca_base',
  'dfc_contas_pagar_base',
  'dfc_saldos_contas',
  'repasses_contratos',
  'dfc_orcamento_empresarial_base',
  'espiao_vinculacao',
  'repasses_reservas',
  'prevision_dashboards',
  'itau_certificado',
  'cobranca_clusters',
  distribuicao.ROTINA_MONITOR,
];
const ROTINAS = [...CATALOGO].sort((a, b) => ORDEM.indexOf(a.chave) - ORDEM.indexOf(b.chave));

const ROTINA_POR_CHAVE = new Map(ROTINAS.map((r) => [r.chave, r]));

module.exports = { ROTINAS, ROTINA_POR_CHAVE };
