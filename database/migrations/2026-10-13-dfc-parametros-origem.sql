-- DFC Construtoras > Parâmetros: de onde veio cada versão. MANUAL = "Publicar Versão" na tela;
-- DCD / GERAL = criada sozinha ao importar um DCD ou um Geral dos Empreendimentos do contrato
-- Caixa da obra (os parâmetros fixos vêm desses arquivos — ver dfcParametros.service.js).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-13-dfc-parametros-origem.sql

ALTER TABLE dfc_parametros_versoes
    ADD COLUMN IF NOT EXISTS origem VARCHAR(10) NOT NULL DEFAULT 'MANUAL'
    CHECK (origem IN ('MANUAL', 'DCD', 'GERAL'));
