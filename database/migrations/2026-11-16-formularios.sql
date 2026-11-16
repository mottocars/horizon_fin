-- Cadastros › Formulários: pesquisas montadas no estilo Google Forms, em três modalidades:
--   PUBLICO              → qualquer pessoa com o link (/f/<token_publico>) responde, sem login;
--   PRIVADO              → aparece numa janela ao entrar no sistema para os usuários do público-alvo;
--                          dá para fechar, e a janela volta a cada entrada até a pessoa responder;
--   PRIVADO_OBRIGATORIO  → mesma janela, sem fechar: o usuário só navega depois de responder.
-- As perguntas ficam em JSON (cada uma com um `id` estável gerado na tela), assim a montagem é salva de
-- uma vez e as respostas guardam { <id da pergunta>: valor }. Ver backend/src/modules/formularios.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-16-formularios.sql

CREATE TABLE IF NOT EXISTS formularios (
    id                       SERIAL PRIMARY KEY,
    titulo                   VARCHAR(200) NOT NULL DEFAULT 'Formulário sem título',
    descricao                TEXT NOT NULL DEFAULT '',
    modalidade               VARCHAR(30) NOT NULL DEFAULT 'PUBLICO'
                             CHECK (modalidade IN ('PUBLICO', 'PRIVADO', 'PRIVADO_OBRIGATORIO')),
    status                   VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO'
                             CHECK (status IN ('RASCUNHO', 'PUBLICADO', 'ENCERRADO')),
    perguntas                JSONB NOT NULL DEFAULT '[]'::jsonb,
    cor_tema                 VARCHAR(7) NOT NULL DEFAULT '#2563eb',
    mensagem_final           TEXT NOT NULL DEFAULT '',
    -- Só PRIVADO / PRIVADO_OBRIGATORIO: quem precisa responder.
    publico_alvo             VARCHAR(20) NOT NULL DEFAULT 'TODOS'
                             CHECK (publico_alvo IN ('TODOS', 'EMPRESAS', 'USUARIOS')),
    empresa_ids              INTEGER[] NOT NULL DEFAULT '{}',
    usuario_ids              INTEGER[] NOT NULL DEFAULT '{}',
    -- Só PRIVADO / PRIVADO_OBRIGATORIO: o nome de quem respondeu não aparece nos resultados.
    anonimo                  BOOLEAN NOT NULL DEFAULT FALSE,
    -- Só PUBLICO: o navegador que já respondeu vê "já respondido" (controle pelo navegador).
    uma_resposta_por_pessoa  BOOLEAN NOT NULL DEFAULT TRUE,
    -- Período opcional em que o formulário aceita respostas (datas inclusivas).
    inicio_em                DATE,
    fim_em                   DATE,
    token_publico            VARCHAR(40) NOT NULL UNIQUE,
    publicado_em             TIMESTAMP,
    criado_por               INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_por           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em                TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em            TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (fim_em IS NULL OR inicio_em IS NULL OR fim_em >= inicio_em)
);

CREATE TABLE IF NOT EXISTS formularios_respostas (
    id             SERIAL PRIMARY KEY,
    formulario_id  INTEGER NOT NULL REFERENCES formularios(id) ON DELETE CASCADE,
    -- NULL nas respostas do link público.
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    respostas      JSONB NOT NULL DEFAULT '{}'::jsonb,
    origem         VARCHAR(20) NOT NULL CHECK (origem IN ('PUBLICO', 'SISTEMA')),
    ip             VARCHAR(64),
    user_agent     TEXT,
    enviado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS formularios_respostas_formulario_idx ON formularios_respostas (formulario_id, enviado_em DESC);
-- Uma resposta por usuário em cada formulário privado.
CREATE UNIQUE INDEX IF NOT EXISTS formularios_respostas_usuario_uniq
    ON formularios_respostas (formulario_id, usuario_id) WHERE usuario_id IS NOT NULL;
