-- Ajustes de lançamentos financeiros do Sienge — títulos do contas a receber / a pagar e movimentos
-- do extrato das contas —, sem mexer no original (sie_income / sie_outcome / sie_extrato_contas e o
-- rateio deles continuam como vieram da integração). Genérico — não é da DRE: hoje a DRE Gerencial ›
-- Financeiro usa, outras telas podem ler os mesmos ajustes depois.
--
-- lancamentos_ajustes — um por LINHA DE RATEIO ajustada: o lançamento (origem + chave) e o centro de
--   custo × natureza ORIGINAIS daquela linha (somadas as parcelas do título), com o centro, a natureza
--   e o valor que passam a valer no lugar dela. Valor positivo; quem lê aplica o sinal da linha
--   original (a pagar e saídas negativos).
--   chave: R/P = bill_id do título; E = id do lançamento no extrato do Sienge (sie_extrato_contas.id —
--   o registro_id é refeito a cada sincronização do extrato).
-- lancamentos_ajustes_historico — o log: cada gravação ou restauração de ajuste, com quem fez, quando e
--   o antes/depois (JSON); restaurar (apagar o ajuste) mantém o log. Também guarda o log dos lançamentos
--   criados à mão (origem M, chave = lancamentos_manuais.id — ver 2026-10-30-lancamentos-manuais.sql):
--   CRIOU / ALTEROU / EXCLUIU.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-30-lancamentos-ajustes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS lancamentos_ajustes (
    id                 SERIAL PRIMARY KEY,
    empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    origem             CHAR(1) NOT NULL CHECK (origem IN ('R', 'P', 'E')),  -- a receber, a pagar, movimento (extrato)
    chave              BIGINT NOT NULL,
    centro_original    INTEGER,         -- null = a linha original não tinha centro
    natureza_original  VARCHAR(20),     -- null = a linha original não tinha natureza
    centro_id          INTEGER NOT NULL,     -- centros_custo_sienge.sienge_id
    natureza_id        VARCHAR(20) NOT NULL, -- planos_financeiros_sienge.sienge_id, como texto
    valor              NUMERIC(18, 2) NOT NULL CHECK (valor > 0),
    observacao         TEXT,
    usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em          TIMESTAMP DEFAULT NOW(),
    atualizado_em      TIMESTAMP DEFAULT NOW()
);

-- Um ajuste por linha original (centro/natureza nulos contam como valor).
CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_ajustes_linha
    ON lancamentos_ajustes (empresa_id, origem, chave, COALESCE(centro_original, -1), COALESCE(natureza_original, ''));

DROP TRIGGER IF EXISTS trg_lancamentos_ajustes_atualizado_em ON lancamentos_ajustes;
CREATE TRIGGER trg_lancamentos_ajustes_atualizado_em
    BEFORE UPDATE ON lancamentos_ajustes
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TABLE IF NOT EXISTS lancamentos_ajustes_historico (
    id                 SERIAL PRIMARY KEY,
    empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    origem             CHAR(1) NOT NULL CONSTRAINT lancamentos_ajustes_historico_origem_check
                           CHECK (origem IN ('R', 'P', 'E', 'M')),  -- M = lançamento criado à mão
    chave              BIGINT NOT NULL,
    centro_original    INTEGER,
    natureza_original  VARCHAR(20),
    acao               VARCHAR(10) NOT NULL CONSTRAINT lancamentos_ajustes_historico_acao_check
                           CHECK (acao IN ('AJUSTOU', 'RESTAUROU', 'CRIOU', 'ALTEROU', 'EXCLUIU')),
    antes              JSONB,           -- ajuste: { centro_id, natureza_id, valor, observacao } antes (null = estava original);
                                        -- lançamento criado: os campos dele antes (null = não existia)
    depois             JSONB,           -- depois (null = voltou ao original / foi excluído)
    usuario_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_ajustes_historico_lancamento
    ON lancamentos_ajustes_historico (empresa_id, origem, chave, criado_em);

COMMIT;
