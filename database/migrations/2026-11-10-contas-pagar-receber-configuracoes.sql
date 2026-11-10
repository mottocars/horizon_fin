-- Cadastros > Contas Pagar / Receber > aba Configurações (pedido do usuário, 10/11/2026): o plano de contas
-- padrão de cada classificação da Projeção PLS CEF (Novo Registro, Medição e Crédito PJ), por empresa. É o que
-- a aba Rateios do título traz preenchido (sem configuração, vale a conta da Origem Projeção CEF do plano da DFC).
-- Contas = planos_financeiros_sienge.sienge_id (como texto). Data gravada com o relógio da aplicação.
-- Rodar depois de 2026-11-10-contas-pagar-receber.sql.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-10-contas-pagar-receber-configuracoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS cpr_configuracoes (
    empresa_id          INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    conta_novo_registro VARCHAR(20),
    conta_medicao       VARCHAR(20),
    conta_credito_pj    VARCHAR(20),
    atualizado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em       TIMESTAMP
);

COMMIT;
