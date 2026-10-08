-- Cadastro de usuários: sai o perfil "Administrador" (global). Ficam só
--   MASTER → acesso total, todas as telas e empresas;
--   BASICO → só as telas em telas_permitidas, só as empresas vinculadas.
-- E cada tela liberada passa a ter um nível: Comum ou Administrador. As telas
-- em que o usuário é Administrador ficam em telas_administrador (sempre um
-- subconjunto de telas_permitidas). O que o Administrador de uma tela pode a
-- mais é decidido em cada tela (ex.: Gestão de Cobranças — filtrar a Rotina
-- por responsável e alterar a Distribuição da Rotina).
--
-- Quem era ADMINISTRADOR vira BASICO com TODAS as telas como Administrador
-- (mesmo acesso de antes, sem perder nada).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-08-permissao-por-tela.sql

BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telas_administrador TEXT[] NOT NULL DEFAULT '{}';

UPDATE usuarios
   SET permissao = 'BASICO',
       telas_permitidas = t.todas,
       telas_administrador = t.todas
  FROM (SELECT ARRAY[
          '/cadastros/empresas', '/cadastros/usuarios', '/cadastros/mascaras',
          '/cadastros/centros-de-custo', '/cadastros/planos-financeiros',
          '/operacoes/dre-gerencial', '/operacoes/espiao-nfe-nfse', '/operacoes/saldo-contas-bancarias',
          '/operacoes/repasses-cef', '/operacoes/gestao-de-cobrancas',
          '/integracoes/monitor', '/integracoes/portal-das-construtoras', '/integracoes/prevision',
          '/integracoes/sienge', '/integracoes/construtor-de-vendas', '/integracoes/certificados-digitais',
          '/integracoes/contas-bancarias', '/integracoes/z-api', '/integracoes/email', '/integracoes/mcp',
          '/integracoes/actioon', '/integracoes/banco-dados',
          '/relatorios/metricas-de-uso', '/relatorios/empreendimentos-masa', '/relatorios/notas-pendentes',
          '/relatorios/extratos-bancarios', '/relatorios/repasses-cef', '/relatorios/desempenho-cobranca',
          '/relatorios/etapas-dos-empreendimentos'
        ]::TEXT[] AS todas) t
 WHERE usuarios.permissao = 'ADMINISTRADOR';

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_permissao_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_permissao_check CHECK (permissao IN ('MASTER', 'BASICO'));

COMMIT;
