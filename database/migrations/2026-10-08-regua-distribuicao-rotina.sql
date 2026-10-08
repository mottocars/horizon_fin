-- Régua de Cobrança > Configurações Globais: "Distribuição da Rotina".
--   etapa      = cada etapa da régua tem o seu responsável (como sempre foi);
--   automatica = os clientes da Rotina de cada dia são distribuídos entre os
--                atendentes cadastrados aqui (ver distribuicao.service.js e a
--                página "Como funciona a distribuição", DistribuicaoExplicacaoPage.jsx).
-- Datas/horas gravadas pelo relógio da aplicação em TIMESTAMPTZ (mesma convenção do Monitor
-- de Integrações — o relógio do Postgres da VPS é deslocado, ver monitor-integracoes/executor.js).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-08-regua-distribuicao-rotina.sql

-- 1 linha por empresa. Sem linha = 'etapa' e liberação em 10 dias.
CREATE TABLE IF NOT EXISTS regua_cobranca_distribuicao_config (
    empresa_id      INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    modo            VARCHAR(20) NOT NULL DEFAULT 'etapa' CHECK (modo IN ('etapa', 'automatica')),
    -- Dias sem aparecer na Rotina até o cliente sair da carteira do atendente.
    dias_liberacao  INTEGER NOT NULL DEFAULT 10 CHECK (dias_liberacao BETWEEN 1 AND 365),
    atualizado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Atendentes que participam da distribuição. Pausado (férias) continua na
-- lista: os clientes dele são atendidos por outros como "cobertura" até
-- `pausado_ate` (inclusive), sem sair da carteira dele.
-- `placar_herdado_de`/`herdado_em`: numa substituição o novo atendente
-- herda a carteira e o placar do mês do anterior (a vaga continua, só muda
-- a pessoa) — ver distribuicao.service.js::carregarPlacar.
CREATE TABLE IF NOT EXISTS regua_cobranca_distribuicao_participantes (
    empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    pausado_ate        DATE,
    placar_herdado_de  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    herdado_em         DATE,
    entrou_em          DATE NOT NULL,
    criado_em          TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, usuario_id)
);

-- Carteira: de quem é cada cliente (continuidade). Sai daqui quando passa
-- `dias_liberacao` dias sem aparecer na Rotina, ou quando o dono deixa de
-- ser atendente e o cliente volta a aparecer (é redistribuído).
CREATE TABLE IF NOT EXISTS regua_cobranca_carteira (
    empresa_id       INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    client_id        BIGINT NOT NULL,
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    desde            DATE NOT NULL,
    ultima_aparicao  DATE NOT NULL,
    PRIMARY KEY (empresa_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_regua_carteira_usuario ON regua_cobranca_carteira (empresa_id, usuario_id);

-- Resultado gravado de cada dia: 1 linha por cliente. É o que a Rotina lê
-- pra saber de quem é cada item naquela data (histórico fiel, mesmo que a
-- carteira mude depois). `motivo`: continuidade | novo | liberado |
-- cobertura | transferido.
CREATE TABLE IF NOT EXISTS regua_cobranca_distribuicao_itens (
    empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    data         DATE NOT NULL,
    client_id    BIGINT NOT NULL,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    motivo       VARCHAR(20) NOT NULL CHECK (motivo IN ('continuidade', 'novo', 'liberado', 'cobertura', 'transferido')),
    faixa        VARCHAR(80),
    valor        NUMERIC(15, 2) NOT NULL DEFAULT 0,
    titulos      INTEGER NOT NULL DEFAULT 0,
    gerado_em    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (empresa_id, data, client_id)
);
CREATE INDEX IF NOT EXISTS idx_regua_distribuicao_itens_usuario ON regua_cobranca_distribuicao_itens (empresa_id, usuario_id, data);

-- Quem participou da distribuição de cada dia — base dos "dias trabalhados"
-- da média de valor do mês (quem estava pausado não conta o dia).
CREATE TABLE IF NOT EXISTS regua_cobranca_distribuicao_presencas (
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    data        DATE NOT NULL,
    usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (empresa_id, data, usuario_id)
);

-- Registro de tudo que mexe na distribuição: geração do dia, redistribuição,
-- entrada/saída/substituição/pausa de atendente, troca de modo.
CREATE TABLE IF NOT EXISTS regua_cobranca_distribuicao_log (
    id          SERIAL PRIMARY KEY,
    empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    acao        VARCHAR(30) NOT NULL,
    descricao   TEXT NOT NULL,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regua_distribuicao_log ON regua_cobranca_distribuicao_log (empresa_id, criado_em DESC);
