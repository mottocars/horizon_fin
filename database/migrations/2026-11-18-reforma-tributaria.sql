-- Operações > Reforma Tributária (pedido do usuário, 18/11/2026): o impacto da reforma do consumo
-- (LC 214/2025: CBS e IBS) na DRE projetada de cada obra. A tela lê a Projeção da DRE (a mesma da coluna
-- Projetado da aba DRE) e refaz, do mês 2027-01 em diante, o imposto sobre a receita e o crédito sobre o
-- custo das obras pelo regime escolhido para cada centro de custo (RET de transição ou regime regular).
-- O cálculo fica em backend/src/modules/reforma-tributaria/motor.js e é refeito a cada leitura.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-18-reforma-tributaria.sql

BEGIN;

-- Aba Alíquotas: os parâmetros da empresa. Sem linha = vale o padrão do motor (motor.PADRAO).
--   aliquotas            — { "2027": { "cbs": 11.2, "ibs": 0.1 }, ... } em % (a cobrada no ano; um ano sem
--                          linha usa o último ano anterior que tiver);
--   reducao_imoveis      — % de redução das alíquotas na venda de imóveis (regime regular);
--   redutor_residencial  — redutor social por unidade residencial nova (R$);
--   redutor_lote         — redutor social por lote residencial (R$);
--   ret_ibs_cbs / ret_irpj_csll — o RET de transição em % da receita (IBS/CBS e IRPJ/CSLL).
CREATE TABLE IF NOT EXISTS reforma_tributaria_config (
    empresa_id           INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    aliquotas            JSONB NOT NULL,
    reducao_imoveis      NUMERIC(7,4) NOT NULL,
    redutor_residencial  NUMERIC(16,2) NOT NULL,
    redutor_lote         NUMERIC(16,2) NOT NULL,
    ret_ibs_cbs          NUMERIC(7,4) NOT NULL,
    ret_irpj_csll        NUMERIC(7,4) NOT NULL,
    usuario_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    -- Relógio da aplicação (o do Postgres da VPS é deslocado).
    atualizado_em        TIMESTAMPTZ NOT NULL
);

-- Aba Centros de Custos: o regime de cada obra na reforma. Sem linha = não configurado (a obra fica como
-- está na projeção, sem impacto).
--   RET      — RET de transição (afetação com opção até 31/12/2028): a alíquota da aba Alíquotas sobre a
--              receita, sem crédito e sem redutores;
--   REGULAR  — IBS/CBS com a redução dos imóveis, a base abatida pelos redutores (terreno + unidades
--              residenciais e lotes × redutor social), o crédito sobre a parte do custo de obra que gera
--              crédito (perc_custo_credito) e o IRPJ/CSLL fora do RET (irpj_csll, % da receita).
CREATE TABLE IF NOT EXISTS reforma_tributaria_centros (
    empresa_id             INTEGER NOT NULL,
    centro_id              INTEGER NOT NULL,
    regime                 VARCHAR(10) NOT NULL CHECK (regime IN ('RET', 'REGULAR')),
    valor_terreno          NUMERIC(16,2),
    unidades_residenciais  INTEGER,
    lotes                  INTEGER,
    perc_custo_credito     NUMERIC(7,4),
    irpj_csll              NUMERIC(7,4),
    usuario_id             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em          TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (empresa_id, centro_id),
    FOREIGN KEY (centro_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE
);

COMMIT;
