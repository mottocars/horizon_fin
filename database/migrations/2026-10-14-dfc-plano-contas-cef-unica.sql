-- DFC Construtoras > Plano Contas: cada Origem Projeção "CEF - ..." só pode estar em UMA conta por
-- empresa (a Projeção CEF lança o valor nessa conta). Trocar de conta = transferir (a tela avisa
-- antes e o backend tira da conta antiga — ver dfcPlanoContas.service.js).
-- Aplicar: psql -U postgres -d horizon_fin -f database/migrations/2026-10-14-dfc-plano-contas-cef-unica.sql

CREATE UNIQUE INDEX IF NOT EXISTS uq_dfc_plano_contas_origem_cef
    ON dfc_plano_contas (empresa_id, origem_projecao)
    WHERE origem_projecao LIKE 'CEF\_%';
