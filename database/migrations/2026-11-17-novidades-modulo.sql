-- Cadastros › Novidades: módulo do Horizon de que a novidade trata (ex.: "Gestão de Cobranças"),
-- escolhido na lista de telas do sistema (frontend/src/config/telasSistema.js) e mostrado ao lado
-- de "Novidade" na janela. Opcional. As 2 primeiras novidades são da Gestão de Cobranças.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-novidades-modulo.sql

BEGIN;

ALTER TABLE novidades ADD COLUMN IF NOT EXISTS modulo VARCHAR(100);

UPDATE novidades SET modulo = 'Gestão de Cobranças'
WHERE modulo IS NULL
  AND nome IN ('Seleção em massa de clientes na gestão de cobrança', 'Redistribuir clientes por atendente para administradores');

COMMIT;
