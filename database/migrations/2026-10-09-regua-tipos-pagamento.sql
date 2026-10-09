-- Régua de Cobrança > Configurações Globais: "Tipos de Pagamentos para Cobrança".
-- Os tipos de pagamento (sie_income.payment_term_description, do Sienge) que entram na
-- cobrança: só parcelas de um tipo listado aqui aparecem na Gestão das Parcelas, na Rotina
-- e no relatório Desempenho da Cobrança. Sem linha nenhuma = nenhuma parcela na cobrança
-- (pedido do usuário: começa tudo à esquerda; tipo novo que surgir no Sienge também fica
-- de fora até ser incluído). `descricao` é gravada sem espaços nas pontas (TRIM) — o
-- Sienge manda alguns tipos com espaço sobrando ('ATO  ').
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-09-regua-tipos-pagamento.sql

CREATE TABLE IF NOT EXISTS regua_cobranca_tipos_pagamento (
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    descricao       VARCHAR(255) NOT NULL,
    criado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (empresa_id, descricao)
);
