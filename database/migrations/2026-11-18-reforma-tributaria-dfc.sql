-- Operações > Reforma Tributária › Impacto DFC (pedido do usuário, 18/11/2026): o impacto da reforma no
-- fluxo de caixa projetado (DFC Construtoras, última versão salva do Orçamento). Os parâmetros do caixa
-- ficam na aba Configurações DFC; o regime de cada obra e as alíquotas são os mesmos do Impacto DRE.
-- Sem linha = vale o padrão do motor (backend/src/modules/reforma-tributaria/motor.js, DFC_PADRAO) e as
-- contas sugeridas pelo nome.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-18-reforma-tributaria-dfc.sql

BEGIN;

--   contas_receita       — naturezas dos recebimentos de venda (a base do imposto sobre a receita);
--   contas_custo         — naturezas dos pagamentos de custo de obra (geram crédito, no % de cada obra);
--   contas_ret           — naturezas onde o DFC projeta o RET de hoje (saem da base: o imposto é
--                          recalculado sobre os recebimentos nos dois cenários);
--   prazo_recolhimento   — meses entre o fato (recebimento/pagamento) e o pagamento do imposto;
--   split_inicio         — 'AAAA-MM' a partir do qual o imposto é retido no recebimento (split payment);
--                          NULL = desligado;
--   saldo_credor         — COMPENSAR (abate o imposto dos meses seguintes) ou RESSARCIR (volta ao caixa
--                          prazo_ressarcimento meses depois); com split payment é sempre ressarcido.
CREATE TABLE IF NOT EXISTS reforma_tributaria_dfc (
    empresa_id           INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    contas_receita       INTEGER[] NOT NULL DEFAULT '{}',
    contas_custo         INTEGER[] NOT NULL DEFAULT '{}',
    contas_ret           INTEGER[] NOT NULL DEFAULT '{}',
    prazo_recolhimento   SMALLINT NOT NULL CHECK (prazo_recolhimento BETWEEN 0 AND 12),
    split_inicio         VARCHAR(7) CHECK (split_inicio IS NULL OR split_inicio ~ '^\d{4}-\d{2}$'),
    saldo_credor         VARCHAR(10) NOT NULL CHECK (saldo_credor IN ('COMPENSAR', 'RESSARCIR')),
    prazo_ressarcimento  SMALLINT NOT NULL CHECK (prazo_ressarcimento BETWEEN 0 AND 24),
    usuario_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    atualizado_em        TIMESTAMPTZ NOT NULL
);

COMMIT;
