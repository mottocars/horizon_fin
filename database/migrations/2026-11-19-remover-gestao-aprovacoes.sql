-- Operações > Gestão Aprovações saiu do sistema (pedido do usuário, 19/11/2026: "não usaremos mais"). O módulo
-- nunca foi publicado na VPS; aqui só apaga as tabelas dele onde a migration 2026-11-10-gestao-aprovacoes.sql
-- (removida) chegou a ser aplicada. No lugar, Operações › Workflows (2026-11-19-workflows.sql).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-11-19-remover-gestao-aprovacoes.sql

BEGIN;

DROP TABLE IF EXISTS apr_notificacao, apr_notif_config, apr_baixa, apr_lote_baixa, apr_comentario, apr_evento, apr_tarefa,
    apr_item, apr_sincronizacao, apr_delegacao, apr_grupo_usuario, apr_grupo, apr_raci, apr_regra, apr_etapa, apr_tipo CASCADE;

-- A tela sai das permissões dos usuários.
UPDATE usuarios SET telas_permitidas = array_remove(telas_permitidas, '/operacoes/gestao-aprovacoes')
 WHERE '/operacoes/gestao-aprovacoes' = ANY(telas_permitidas);
UPDATE usuarios SET telas_administrador = array_remove(telas_administrador, '/operacoes/gestao-aprovacoes')
 WHERE '/operacoes/gestao-aprovacoes' = ANY(telas_administrador);

COMMIT;
