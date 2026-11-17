-- Aplicativos instalados por usuário (Loja de aplicativos → Instalar). O ícone do aplicativo vai para o
-- menu lateral, abaixo dos itens do Horizon, na ordem de instalação. Clicar abre o aplicativo dentro do
-- Horizon (/aplicativos/:id): até a primeira conexão (Login com Horizon — o parceiro recebeu a identidade
-- do usuário, ver backend/src/modules/parceiros/oidc.js), mostra a página com o botão Conectar.
-- Desinstalar apaga a linha (reinstalar mostra o Conectar de novo; o sub do usuário no parceiro não muda).
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-parceiros-instalacoes.sql

BEGIN;

CREATE TABLE IF NOT EXISTS parceiros_instalacoes (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    parceiro_id   INTEGER NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
    instalado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conectado_em  TIMESTAMPTZ,
    PRIMARY KEY (usuario_id, parceiro_id)
);
CREATE INDEX IF NOT EXISTS parceiros_instalacoes_parceiro ON parceiros_instalacoes (parceiro_id);

COMMIT;
