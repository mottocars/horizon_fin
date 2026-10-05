-- Home > Plano de Voo: quadro Kanban de atividades (cards, comentários, anexos e histórico).
-- Só cria tabelas novas.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-05-projetos-kanban.sql
BEGIN;

-- Card do Kanban. O bucket "Atrasado" NÃO é gravado: é calculado na hora (data_fim já passou e
-- o card não foi finalizado) — assim vira atrasado sozinho, sem rotina agendada. `status` guarda
-- só o que o responsável escolheu: AGUARDANDO, PROGRESSO ou FINALIZADO.
CREATE TABLE IF NOT EXISTS projetos_cards (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    assunto         VARCHAR(200) NOT NULL,
    descricao       TEXT,
    data_inicio     DATE NOT NULL,
    data_fim        DATE NOT NULL,
    responsavel_id  INTEGER NOT NULL REFERENCES usuarios(id),
    criador_id      INTEGER NOT NULL REFERENCES usuarios(id),
    status          VARCHAR(12) NOT NULL DEFAULT 'AGUARDANDO' CHECK (status IN ('AGUARDANDO', 'PROGRESSO', 'FINALIZADO')),
    finalizado_em   TIMESTAMP,
    criado_em       TIMESTAMP NOT NULL,
    atualizado_em   TIMESTAMP NOT NULL,
    CHECK (data_fim >= data_inicio)
);
CREATE INDEX IF NOT EXISTS idx_projetos_cards_responsavel ON projetos_cards (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_projetos_cards_criador ON projetos_cards (criador_id);

CREATE TABLE IF NOT EXISTS projetos_comentarios (
    id          SERIAL PRIMARY KEY,
    card_id     INTEGER NOT NULL REFERENCES projetos_cards(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    texto       TEXT NOT NULL,
    criado_em   TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projetos_comentarios_card ON projetos_comentarios (card_id);

-- Arquivo em backend/uploads/projetos/<card_id>/<arquivo_armazenado> (volume Docker em produção).
CREATE TABLE IF NOT EXISTS projetos_anexos (
    id                  SERIAL PRIMARY KEY,
    card_id             INTEGER NOT NULL REFERENCES projetos_cards(id) ON DELETE CASCADE,
    usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
    nome_original       VARCHAR(255) NOT NULL,
    arquivo_armazenado  VARCHAR(255) NOT NULL,
    mime                VARCHAR(150),
    tamanho             INTEGER NOT NULL,
    criado_em           TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projetos_anexos_card ON projetos_anexos (card_id);

-- Linha do tempo do card: criação, edição, movimentação entre buckets, anexo, comentário.
CREATE TABLE IF NOT EXISTS projetos_historico (
    id          SERIAL PRIMARY KEY,
    card_id     INTEGER NOT NULL REFERENCES projetos_cards(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id),
    acao        VARCHAR(20) NOT NULL,
    detalhe     VARCHAR(300),
    criado_em   TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projetos_historico_card ON projetos_historico (card_id);

COMMIT;
