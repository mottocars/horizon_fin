const pool = require('../../config/db');
const { executarVarredura } = require('../espiao-nfe-nfse/vinculacaoAutomatica');
const repassesCef = require('../repasses-cef/repassesCef.service');
const income = require('../income-sienge/income.service');
const customers = require('../customers-sienge/customers.service');
const clusters = require('../cobranca-clusters/cobrancaClusters.service');
const itau = require('../integracoes-itau/itau.service');
const distribuicao = require('../regua-cobranca/distribuicao.service');

// Catálogo das atualizações que o Monitor de Integrações agenda e executa.
// Cada uma é a MESMA função que o botão da tela de origem já chamava — o
// monitor só passa a disparar em segundo plano, no horário, e registrar.
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

const ROTINAS = [
  {
    chave: 'espiao_vinculacao',
    modulo: 'Espião NFe / NFS-e',
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
    modulo: 'Repasses CEF',
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
    modulo: 'Repasses CEF',
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
    modulo: 'Gestão de Cobranças',
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
    modulo: 'Gestão de Cobranças',
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
    modulo: 'Gestão de Cobranças',
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
    modulo: 'Gestão de Cobranças',
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
    modulo: 'Contas Bancárias',
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
];

const ROTINA_POR_CHAVE = new Map(ROTINAS.map((r) => [r.chave, r]));

module.exports = { ROTINAS, ROTINA_POR_CHAVE };
