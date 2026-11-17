-- Permissões do navegador que cada aplicativo parceiro pode pedir quando roda dentro do Horizon
-- (iframe em /aplicativos/:id). Liberadas pelo administrador em Cadastros › Parceiros, uma a uma.
-- Por que por aplicativo: o navegador guarda a permissão (ex.: localização) em nome do Horizon, não do
-- aplicativo — liberada para todos, um "permitir" dado a um parceiro valeria para os outros.
-- Valores: 'localizacao' (iframe allow="geolocation"). Ver backend/src/modules/parceiros/parceiros.service.js.
-- Aplicar: psql -U postgres -d horizon_fin -v ON_ERROR_STOP=1 -f database/migrations/2026-11-17-parceiros-permissoes.sql

BEGIN;

ALTER TABLE parceiros ADD COLUMN IF NOT EXISTS permissoes TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
