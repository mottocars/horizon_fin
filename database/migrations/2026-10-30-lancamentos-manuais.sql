-- Lançamentos financeiros criados à mão (não vêm do Sienge) — hoje pela DRE Gerencial › Financeiro
-- ("Novo lançamento"), entram na listagem como movimento, com o status "Criado". Genérico, não é da
-- DRE: outras telas podem ler. O log (criou / alterou / excluiu, com quem e quando) fica em
-- lancamentos_ajustes_historico, origem 'M' e chave = id daqui. Excluir apaga a linha; o log fica.
-- Rodar depois de 2026-10-30-lancamentos-ajustes.sql.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-lancamentos-manuais.sql

BEGIN;

CREATE TABLE IF NOT EXISTS lancamentos_manuais (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo           VARCHAR(7) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
    data           DATE NOT NULL,
    documento      VARCHAR(50),
    historico      VARCHAR(255) NOT NULL,
    centro_id      INTEGER NOT NULL,      -- centros_custo_sienge.sienge_id
    natureza_id    VARCHAR(20) NOT NULL,  -- planos_financeiros_sienge.sienge_id, como texto
    valor          NUMERIC(18, 2) NOT NULL CHECK (valor > 0),  -- positivo; o tipo dá o sinal
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_manuais_data ON lancamentos_manuais (empresa_id, data);

DROP TRIGGER IF EXISTS trg_lancamentos_manuais_atualizado_em ON lancamentos_manuais;
CREATE TRIGGER trg_lancamentos_manuais_atualizado_em
    BEFORE UPDATE ON lancamentos_manuais
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

COMMIT;
