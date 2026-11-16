-- Formulários: logomarca opcional no centro do cabeçalho (entre a da empresa, à esquerda, e a do Horizon, à direita).
-- Data URI PNG já redimensionada no navegador; NULL = sem logomarca central.
ALTER TABLE formularios ADD COLUMN IF NOT EXISTS logo_central TEXT;
