-- Saldo Contas Bancárias: parâmetro "Gerar Rotinas" (responsáveis por classificação/banco, aba
-- Rotinas e encerramento da rotina por responsável). Só cria tabelas novas.
-- Aplicar na VPS: docker exec -i horizonhub-db-1 psql -U postgres -d horizon_fin < database/migrations/2026-10-05-saldos-rotinas.sql
BEGIN;

CREATE TABLE IF NOT EXISTS saldos_rotinas_config (
    empresa_id      INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    gerar_rotinas   BOOLEAN NOT NULL DEFAULT FALSE,
    dividir_por     VARCHAR(15) NOT NULL DEFAULT 'CLASSIFICACAO' CHECK (dividir_por IN ('CLASSIFICACAO', 'BANCO')),
    atualizado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saldos_rotinas_responsaveis (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo        VARCHAR(15) NOT NULL CHECK (tipo IN ('CLASSIFICACAO', 'BANCO')),
    chave       VARCHAR(50) NOT NULL,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (empresa_id, tipo, chave)
);

CREATE TABLE IF NOT EXISTS saldos_rotinas_encerramentos (
    periodo_id    INTEGER NOT NULL REFERENCES saldos_periodos(id) ON DELETE CASCADE,
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    encerrado_em  TIMESTAMP NOT NULL,
    PRIMARY KEY (periodo_id, usuario_id)
);

COMMIT;
