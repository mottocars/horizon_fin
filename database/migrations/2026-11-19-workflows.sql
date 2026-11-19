-- Operações > Workflows (pedido do usuário, 19/11/2026 — "algo parecido com o Power Automate"): automações
-- por empresa — um GATILHO (evento do sistema) e uma AÇÃO. Primeiros gatilhos: DRE › versão salva e DRE ›
-- versão aprovada; primeira ação: enviar WhatsApp por uma conexão Z-API da empresa (mensagem digitada, com
-- variáveis, e opcionalmente o Excel de auditoria da DRE anexo). Catálogo e motor em
-- backend/src/modules/workflows.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-19-workflows.sql

BEGIN;

CREATE TABLE IF NOT EXISTS workflows (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome           VARCHAR(120) NOT NULL,
    -- catalogo.GATILHOS (ex.: DRE_VERSAO_SALVA, DRE_VERSAO_APROVADA).
    gatilho        VARCHAR(40) NOT NULL,
    ativo          BOOLEAN NOT NULL DEFAULT TRUE,
    -- A ação: { tipo: 'WHATSAPP', conexao_id, destinatarios: { modo: 'APROVADOR' | 'USUARIOS', usuarios: [ids] },
    --          mensagem, anexar_excel_dre }.
    acao           JSONB NOT NULL,
    criado_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    criado_em      TIMESTAMPTZ NOT NULL,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS workflows_empresa_gatilho ON workflows (empresa_id, gatilho) WHERE ativo;

-- Cada vez que um workflow roda: o evento (contexto), a situação e o resultado por destinatário.
CREATE TABLE IF NOT EXISTS workflow_execucoes (
    id            SERIAL PRIMARY KEY,
    workflow_id   INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    gatilho       VARCHAR(40) NOT NULL,
    -- O evento: ex.: { versao: 5, usuario: 'Bruno Motta' }.
    contexto      JSONB,
    -- EXECUTANDO, SUCESSO (todos receberam), PARCIAL, ERRO, IGNORADO (ex.: sem aprovador na matriz).
    status        VARCHAR(12) NOT NULL,
    -- { enviados: [{ nome }], falhas: [{ nome, motivo }], motivo, anexo }.
    resultado     JSONB,
    iniciado_em   TIMESTAMPTZ NOT NULL,
    concluido_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS workflow_execucoes_empresa ON workflow_execucoes (empresa_id, iniciado_em DESC);

COMMIT;
