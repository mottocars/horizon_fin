-- Operações > DRE Gerencial > aba Plano de Contas: mesmo esquema do Plano Contas da DFC
-- (2026-10-13-dfc-plano-contas.sql + 2026-10-14-dfc-plano-contas-versoes.sql) — a Máscara DRE
-- (sempre de nível 2 — ver dre_mascaras) de cada conta analítica, num plano Global que vale pra
-- todos os centros de custo e em versões próprias por centro (criadas copiando o Global, o plano
-- de outro centro ou em branco). Linha só existe pra conta classificada: apagar a máscara na aba
-- Máscaras apaga a classificação junto (CASCADE).
--
-- "NÃO ENTRA NA DRE" (opção da combobox) também é classificação: linha com nao_entra = TRUE e
-- mascara_id NULL — a conta foi olhada e fica fora da DRE (diferente de conta sem linha, que ainda
-- não foi classificada). As duas colunas andam juntas (CHECK).
--
-- Antes a Máscara DRE ficava em planos_financeiros_sienge.classificacao_dre_id (um plano só). A
-- migração copia o que estiver lá pro plano Global; a coluna fica sem uso (não é apagada).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-22-dre-plano-contas.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dre_plano_contas (
    empresa_id     INTEGER NOT NULL,
    sienge_id      INTEGER NOT NULL,
    mascara_id     INTEGER NOT NULL REFERENCES dre_mascaras(id) ON DELETE CASCADE,
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES planos_financeiros_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_dre_plano_contas_atualizado_em ON dre_plano_contas;
CREATE TRIGGER trg_dre_plano_contas_atualizado_em
    BEFORE UPDATE ON dre_plano_contas
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Quais centros têm versão própria.
CREATE TABLE IF NOT EXISTS dre_plano_contas_versoes (
    empresa_id   INTEGER NOT NULL,
    centro_id    INTEGER NOT NULL,
    usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, centro_id),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

-- Máscara DRE de cada conta, na versão do centro (mesmo campo de dre_plano_contas).
CREATE TABLE IF NOT EXISTS dre_plano_contas_centro (
    empresa_id     INTEGER NOT NULL,
    centro_id      INTEGER NOT NULL,
    sienge_id      INTEGER NOT NULL,
    mascara_id     INTEGER NOT NULL REFERENCES dre_mascaras(id) ON DELETE CASCADE,
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, centro_id, sienge_id),
    FOREIGN KEY (empresa_id, centro_id) REFERENCES dre_plano_contas_versoes(empresa_id, centro_id) ON DELETE CASCADE,
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES planos_financeiros_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_dre_plano_contas_centro_atualizado_em ON dre_plano_contas_centro;
CREATE TRIGGER trg_dre_plano_contas_centro_atualizado_em
    BEFORE UPDATE ON dre_plano_contas_centro
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Classificação antiga (um plano só) → plano Global. Só máscara de nível 2 da mesma empresa e só
-- conta analítica (as únicas que a tela deixava classificar). Rodar de novo não duplica.
INSERT INTO dre_plano_contas (empresa_id, sienge_id, mascara_id)
SELECT p.empresa_id, p.sienge_id, p.classificacao_dre_id
  FROM planos_financeiros_sienge p
  JOIN dre_mascaras m ON m.id = p.classificacao_dre_id AND m.empresa_id = p.empresa_id AND m.parent_id IS NOT NULL
 WHERE p.tp_conta <> 'T'
ON CONFLICT (empresa_id, sienge_id) DO NOTHING;

-- NÃO ENTRA NA DRE (ver cabeçalho). ALTERs separados pra rodar de novo num banco que já tinha as
-- tabelas sem a coluna.
ALTER TABLE dre_plano_contas ALTER COLUMN mascara_id DROP NOT NULL;
ALTER TABLE dre_plano_contas ADD COLUMN IF NOT EXISTS nao_entra BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dre_plano_contas DROP CONSTRAINT IF EXISTS dre_plano_contas_mascara_ou_nao_entra;
ALTER TABLE dre_plano_contas ADD CONSTRAINT dre_plano_contas_mascara_ou_nao_entra
    CHECK ((mascara_id IS NULL) = nao_entra);

ALTER TABLE dre_plano_contas_centro ALTER COLUMN mascara_id DROP NOT NULL;
ALTER TABLE dre_plano_contas_centro ADD COLUMN IF NOT EXISTS nao_entra BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dre_plano_contas_centro DROP CONSTRAINT IF EXISTS dre_plano_contas_centro_mascara_ou_nao_entra;
ALTER TABLE dre_plano_contas_centro ADD CONSTRAINT dre_plano_contas_centro_mascara_ou_nao_entra
    CHECK ((mascara_id IS NULL) = nao_entra);

COMMIT;
