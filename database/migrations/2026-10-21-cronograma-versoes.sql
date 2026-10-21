-- Operações > Cronogramas Obras: versionamento do cronograma (pedido do usuário). Alterar as datas
-- das etapas de uma obra (Histórico de Etapas — na janela da aba Centros de Custos de Cronogramas
-- Obras ou no cadastro do centro de custo) não muda mais o cronograma na hora: a alteração fica
-- pendente (cronograma_pendencias) até alguém gravar uma nova versão (cronograma_versoes). Aí as
-- pendências entram no Histórico de Etapas de uma vez — até lá o cronograma, o dashboard e tudo o
-- que lê o Histórico continuam na versão anterior — e sai o comunicado de WhatsApp aos
-- destinatários da aba Configurações, com a planilha do cronograma novo e o link do dashboard.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-21-cronograma-versoes.sql

-- Uma linha por obra com alteração pendente; edições seguidas na mesma obra se somam.
CREATE TABLE IF NOT EXISTS cronograma_pendencias (
    empresa_id        INTEGER NOT NULL,
    sienge_id         INTEGER NOT NULL,
    -- inícios propostos por etapa: { "<mascara_item_id>": "AAAA-MM-DD" | null (tira a data) }
    datas             JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- término proposto (fim da última etapa) — só vale com termino_alterado
    termino_alterado  BOOLEAN NOT NULL DEFAULT FALSE,
    data_termino      DATE,
    atualizado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (empresa_id, sienge_id),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

-- As versões gravadas, numeradas por empresa (1, 2, 3…).
CREATE TABLE IF NOT EXISTS cronograma_versoes (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero        INTEGER NOT NULL,
    observacao    TEXT,
    -- o que mudou: [{ sienge_id, nome, etapas: [{ etapa_id, etapa, ultima, inicio_antes, inicio_depois, fim_antes, fim_depois }] }]
    alteracoes    JSONB NOT NULL,
    -- retrato do cronograma depois da versão (a lista de /cronograma-centros, só as obras) — a
    -- planilha de qualquer versão sai daqui
    cronograma    JSONB NOT NULL,
    -- resultado do comunicado: { status, enviados: [{ nome }], falhas: [{ nome, motivo }] }
    comunicado    JSONB,
    criado_por    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (empresa_id, numero)
);
