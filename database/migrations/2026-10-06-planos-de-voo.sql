-- Home > Plano de Voo (aba "Plano de voo"): planos com macro tarefas, exibidos num Gantt. As
-- micro tarefas são os próprios cards do Kanban, ligados a uma macro tarefa (opcional). As
-- datas das macros não são digitadas: o Gantt calcula pelas datas dos cards.
-- Só cria tabelas novas e uma coluna opcional em projetos_cards.
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-06-planos-de-voo.sql
BEGIN;

CREATE TABLE IF NOT EXISTS projetos_planos (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome           VARCHAR(150) NOT NULL,
    criador_id     INTEGER NOT NULL REFERENCES usuarios(id),
    criado_em      TIMESTAMP NOT NULL,
    atualizado_em  TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projetos_planos_empresa ON projetos_planos (empresa_id);

-- Quem enxerga o plano (além de quem criou).
CREATE TABLE IF NOT EXISTS projetos_planos_membros (
    plano_id    INTEGER NOT NULL REFERENCES projetos_planos(id) ON DELETE CASCADE,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (plano_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_projetos_planos_membros_usuario ON projetos_planos_membros (usuario_id);

CREATE TABLE IF NOT EXISTS projetos_macros (
    id         SERIAL PRIMARY KEY,
    plano_id   INTEGER NOT NULL REFERENCES projetos_planos(id) ON DELETE CASCADE,
    nome       VARCHAR(150) NOT NULL,
    ordem      INTEGER NOT NULL DEFAULT 0,
    criado_em  TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projetos_macros_plano ON projetos_macros (plano_id);

-- Card (micro tarefa) → macro tarefa. O plano sai da macro. Excluir a macro (ou o plano) só
-- desliga o card do plano; o card continua no Kanban.
ALTER TABLE projetos_cards ADD COLUMN IF NOT EXISTS macro_id INTEGER REFERENCES projetos_macros(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projetos_cards_macro ON projetos_cards (macro_id);

COMMIT;
