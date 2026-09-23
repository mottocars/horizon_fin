-- Horizon Fin — schema inicial
-- Executar: psql -U postgres -f database/schema.sql

CREATE DATABASE horizon_fin;

\c horizon_fin;

CREATE TABLE usuarios (
    id                SERIAL PRIMARY KEY,
    nome              VARCHAR(150) NOT NULL,
    email             VARCHAR(150) UNIQUE NOT NULL,
    -- Nome de usuário usado para login (não é mais o e-mail). Único.
    username          VARCHAR(50) UNIQUE NOT NULL,
    senha_hash        VARCHAR(255) NOT NULL,
    -- Foto do usuário — guardada como data URI (base64), já redimensionada
    -- e comprimida no navegador antes do envio. TEXT porque uma imagem em
    -- base64 estoura fácil os 255 caracteres de um VARCHAR comum.
    avatar_url        TEXT,
    telefone_ddd      VARCHAR(3),
    telefone_numero   VARCHAR(20),
    -- MASTER: acesso total, todas as telas, sem restrição nem de empresa.
    -- ADMINISTRADOR: acesso a todas as telas, restrito à empresa vinculada.
    -- BASICO: acesso só às telas listadas em telas_permitidas, dentro da
    -- empresa vinculada.
    permissao         VARCHAR(20) NOT NULL DEFAULT 'BASICO'
                        CHECK (permissao IN ('MASTER', 'ADMINISTRADOR', 'BASICO')),
    -- As empresas do usuário (um usuário pode pertencer a mais de uma) ficam
    -- na tabela usuarios_empresas, criada mais abaixo — não existe mais um
    -- único empresa_id aqui. MASTER não tem vínculo nenhum (acesso total).
    -- Só usado quando permissao = 'BASICO' — lista de rotas/telas liberadas
    -- (ex.: '/cadastros/empresas'). Vazio para MASTER/ADMINISTRADOR, que já
    -- têm acesso implícito a tudo.
    telas_permitidas  TEXT[] NOT NULL DEFAULT '{}',
    -- TRUE até o usuário completar a tela obrigatória de primeiro acesso
    -- (confirmar e-mail, confirmar celular, trocar senha e enviar foto).
    -- Usuários criados pelo cadastro de usuários já nascem com TRUE — o
    -- seed do administrador inicial é a única exceção (ver seed.js).
    primeiro_acesso   BOOLEAN NOT NULL DEFAULT TRUE,
    ativo             BOOLEAN DEFAULT TRUE,
    criado_em         TIMESTAMP DEFAULT NOW(),
    atualizado_em     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE clientes (
    id            SERIAL PRIMARY KEY,
    nome          VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    telefone      VARCHAR(30),
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_clientes_nome ON clientes (nome);

CREATE TABLE empresas (
    id                     SERIAL PRIMARY KEY,
    cnpj                   VARCHAR(14) UNIQUE NOT NULL,
    razao_social           VARCHAR(255) NOT NULL,
    nome_fantasia          VARCHAR(255),
    cep                    VARCHAR(8),
    logradouro             VARCHAR(255),
    numero                 VARCHAR(20),
    complemento            VARCHAR(120),
    bairro                 VARCHAR(120),
    cidade                 VARCHAR(120),
    estado                 VARCHAR(2),
    telefone               VARCHAR(20),
    situacao_cadastral     VARCHAR(50),
    data_inicio_atividade  DATE,
    ativo                  BOOLEAN DEFAULT TRUE,
    criado_em              TIMESTAMP DEFAULT NOW(),
    atualizado_em          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_empresas_razao_social ON empresas (razao_social);

-- Vínculo N:N entre usuários e empresas — um usuário (Administrador ou
-- Básico) pode pertencer a mais de uma empresa. MASTER não tem linhas aqui
-- (acesso total, sem vínculo de empresa nenhum).
CREATE TABLE usuarios_empresas (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, empresa_id)
);

CREATE TABLE integracoes_sienge (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tenant         VARCHAR(100) NOT NULL,
    username       VARCHAR(150) NOT NULL,
    password_enc   TEXT NOT NULL,
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_sienge_empresa ON integracoes_sienge (empresa_id);

-- Diferente de integracoes_sienge (1 registro por empresa, na prática): uma
-- empresa pode ter mais de uma conexão Z-API (números de WhatsApp
-- diferentes por setor, por exemplo) — por isso `nome_conexao`, pra
-- distinguir cada uma na listagem, sem UNIQUE em empresa_id.
CREATE TABLE integracoes_zapi (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome_conexao        VARCHAR(150) NOT NULL,
    instance_id         VARCHAR(150) NOT NULL,
    instance_token_enc  TEXT NOT NULL,
    client_token_enc    TEXT NOT NULL,
    ativo               BOOLEAN DEFAULT TRUE,
    criado_em           TIMESTAMP DEFAULT NOW(),
    atualizado_em       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_zapi_empresa ON integracoes_zapi (empresa_id);

-- Conexão com a VanPix (tela Integrações > Convênios Bancários — hoje o único "tipo" de
-- conexão dessa tela, mas o combobox de tipo já é pensado pra ganhar outros no futuro; cada
-- tipo terá sua própria tabela, mesmo padrão de integracoes_sienge/integracoes_zapi). Uma
-- conexão reúne 1+ convênios/cedentes (ver integracoes_vanpix_convenios) que compartilham a
-- mesma Service Key/Client Secret — é o caso comum: 1 cliente VanPix com várias contas/
-- convênios na Caixa, autenticando com as mesmas credenciais.
CREATE TABLE integracoes_vanpix (
    id                 SERIAL PRIMARY KEY,
    empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome_conexao       VARCHAR(150) NOT NULL,
    service_key_enc    TEXT NOT NULL,
    client_secret_enc  TEXT NOT NULL,
    ativo              BOOLEAN DEFAULT TRUE,
    criado_em          TIMESTAMP DEFAULT NOW(),
    atualizado_em      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_vanpix_empresa ON integracoes_vanpix (empresa_id);

-- 1 linha por "apelido" (o identificador de convênio/cedente que a VanPix usa pra saber qual
-- conta consultar, ex. "ABPFJR") dentro de uma conexão — uma conexão pode ter vários. Único
-- só DENTRO da mesma conexão (não impede o mesmo apelido em conexões diferentes de propósito
-- — não temos garantia de que o código nunca se repete entre clientes/empresas diferentes).
CREATE TABLE integracoes_vanpix_convenios (
    id             SERIAL PRIMARY KEY,
    integracao_id  INTEGER NOT NULL REFERENCES integracoes_vanpix(id) ON DELETE CASCADE,
    apelido        VARCHAR(50) NOT NULL,
    UNIQUE (integracao_id, apelido)
);

-- Conectores MCP remotos (Model Context Protocol) — permitem que o Claude
-- (claude.ai/Desktop, via "custom connector") consulte, só leitura, os
-- dados de cobrança/contas a receber desta empresa (ver
-- backend/src/modules/integracoes-mcp). Mesmo motivo de nome_conexao acima:
-- uma empresa pode ter mais de um conector nomeado (ex.: "Diretoria",
-- "Financeiro"), cada um com seu próprio token — revogar/regenerar 1 não
-- afeta os outros.
CREATE TABLE integracoes_mcp (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome_conector       VARCHAR(150) NOT NULL,
    -- SHA-256 hex do token em claro (64 chars) — lookup O(1) no endpoint
    -- público /api/mcp/:token, sem decriptar linha por linha.
    token_hash          VARCHAR(64) NOT NULL UNIQUE,
    -- Token cifrado (AES-256-GCM, backend/src/utils/crypto.js) — só para
    -- remontar a URL completa e reexibi-la na tela (fica sempre visível,
    -- não é reveal-once); nunca usado para autenticar a chamada MCP em si.
    token_enc           TEXT NOT NULL,
    ativo               BOOLEAN DEFAULT TRUE,
    ultimo_uso_em       TIMESTAMP,
    criado_em           TIMESTAMP DEFAULT NOW(),
    atualizado_em       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_mcp_empresa ON integracoes_mcp (empresa_id);

-- Mesmo motivo de nome_conexao acima: uma empresa pode ter mais de uma
-- caixa de e-mail configurada (financeiro@, cobranca@ etc.).
CREATE TABLE integracoes_email (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome_conexao   VARCHAR(150) NOT NULL,
    driver         VARCHAR(30) NOT NULL DEFAULT 'smtp',
    host           VARCHAR(255) NOT NULL,
    porta          INTEGER NOT NULL,
    encriptacao    VARCHAR(20) NOT NULL DEFAULT 'tls',
    email          VARCHAR(255) NOT NULL,
    senha_enc      TEXT NOT NULL,
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_email_empresa ON integracoes_email (empresa_id);

CREATE TABLE integracoes_construtor_vendas (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tenant         VARCHAR(100) NOT NULL DEFAULT '',
    email          VARCHAR(150) NOT NULL,
    senha_enc      TEXT NOT NULL,
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_construtor_vendas_empresa ON integracoes_construtor_vendas (empresa_id);

-- Reservas puxadas da API "cvdw" do Construtor de Vendas (CVCRM) — endpoint
-- /api/v1/cvdw/reservas, que devolve um registro já achatado por reserva
-- (sem objetos aninhados de titular/associados/comissões/contratos, ao
-- contrário do endpoint /comercial/reservas usado antes). Alimenta o bucket
-- "Reserva" do Kanban de Repasses CEF. A sincronização é sempre "apagar
-- tudo da empresa e reinserir" (ver repasses-cef.service.js) — cada clique
-- em "Atualizar" zera e repõe, nunca duplica. Nada de coluna JSON: cada
-- campo do payload da API vira coluna de verdade, batizada com o mesmo
-- nome que a API usa.
CREATE TABLE construtor_vendas_reservas (
    id                                      SERIAL PRIMARY KEY,
    empresa_id                              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    idreserva                               INTEGER NOT NULL,

    referencia                              VARCHAR(255),
    referencia_data                         TIMESTAMP,
    ativo                                   VARCHAR(20),
    data_cad                                TIMESTAMP,
    codigointerno                           VARCHAR(255),
    numero_venda                            VARCHAR(255),
    aprovada                                VARCHAR(20),
    data_venda                              TIMESTAMP,
    situacao                                VARCHAR(255),
    idsituacao                              INTEGER,
    situacao_comercial                      VARCHAR(255),
    idempreendimento                        INTEGER,
    codigointerno_empreendimento            VARCHAR(255),
    empreendimento                          VARCHAR(255),
    data_entrega_chaves_contrato_cliente    TIMESTAMP,
    etapa                                   VARCHAR(255),
    bloco                                   VARCHAR(255),
    unidade                                 VARCHAR(255),
    regiao                                  VARCHAR(255),
    venda                                   VARCHAR(20),
    idcliente                               INTEGER,
    documento_cliente                       VARCHAR(30),
    cliente                                 VARCHAR(255),
    email                                   VARCHAR(255),
    cidade                                  VARCHAR(255),
    cep_cliente                             VARCHAR(20),
    renda                                   NUMERIC(15,2),
    sexo                                    VARCHAR(20),
    idade                                   INTEGER,
    estado_civil                            VARCHAR(100),
    idcorretor                              INTEGER,
    corretor                                VARCHAR(255),
    idimobiliaria                           INTEGER,
    imobiliaria                             VARCHAR(255),
    valor_contrato                          NUMERIC(15,2),
    valor_contrato_com_juros                NUMERIC(15,2),
    vencimento                              TIMESTAMP,
    campanha                                VARCHAR(255),
    cessao                                  VARCHAR(20),
    motivo_cancelamento                     TEXT,
    data_cancelamento                       TIMESTAMP,
    espacos_complementares                  TEXT,
    idlead                                  VARCHAR(255),
    data_ultima_alteracao_situacao          TIMESTAMP,
    idempresa_correspondente                INTEGER,
    empresa_correspondente                  VARCHAR(255),
    valor_fgts                              NUMERIC(15,2),
    valor_financiamento                     NUMERIC(15,2),
    valor_subsidio                          NUMERIC(15,2),
    nome_usuario                            VARCHAR(255),
    idunidade                               INTEGER,
    idprecadastro                           INTEGER,
    idmidia                                 INTEGER,
    midia                                   VARCHAR(255),
    descricao_motivo_cancelamento           TEXT,
    idsituacao_anterior                     INTEGER,
    situacao_anterior                       VARCHAR(255),
    idtabela                                INTEGER,
    nometabela                              VARCHAR(255),
    codigointernotabela                     VARCHAR(255),
    idtipo_tabela                           INTEGER,
    tipo_tabela                             VARCHAR(255),
    data_contrato                           TIMESTAMP,
    valor_proposta                          NUMERIC(15,2),
    vpl_reserva                             NUMERIC(15,2),
    valor_liquido_com_juros                 NUMERIC(15,2),
    valor_liquido_sem_juros                 NUMERIC(15,2),
    vgv_tabela                              NUMERIC(15,2),
    vpl_tabela                              NUMERIC(15,2),
    usuario_aprovacao                       VARCHAR(255),
    data_aprovacao                          TIMESTAMP,
    juros_condicao_aprovada                 NUMERIC(12,6),
    juros_apos_entrega_condicao_aprovada    NUMERIC(12,6),
    idtabela_condicao_aprovada              INTEGER,
    data_primeira_aprovacao                 TIMESTAMP,
    aprovacao_absoluto                      NUMERIC(15,2),
    aprovacao_vpl_valor                     NUMERIC(15,2),
    idtipovenda                             INTEGER,
    tipovenda                               VARCHAR(255),
    idgrupo                                 INTEGER,
    grupo                                   VARCHAR(255),
    data_modificacao                        TIMESTAMP,
    idgestor_time                           INTEGER,
    nome_time                               VARCHAR(255),
    juros_apos_entrega_cadastro             NUMERIC(12,6),
    juros_cadastro_fixa_adicional           NUMERIC(12,6),
    juros_cadastro                          NUMERIC(12,6),
    data_entrega                            TIMESTAMP,
    idtipo_reserva                          INTEGER,
    tipo_reserva                            VARCHAR(255),
    vgv_tabela_minima                       NUMERIC(15,2),
    vpl_tabela_minima                       NUMERIC(15,2),
    idtime                                  INTEGER,

    criado_em                               TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, idreserva)
);

CREATE INDEX idx_construtor_vendas_reservas_empresa ON construtor_vendas_reservas (empresa_id);

-- Máscaras de classificação (DRE, DFC, Pacotes, Unidades de Negócio, Etapas do
-- Centro de Custo, Tipo de Projeção), cadastro manual por empresa (sistema
-- multiempresa). Sequência automática por ordem de criação.
-- `grupo` só é usado pelo tipo REPASSES, para separar os itens (micro
-- etapas) por macro etapa fixa (RESERVA, VENDA, CONTRATO, ASSINATURA,
-- REGISTRO — ver mascaras.controller.js). Nos demais tipos fica '' e a
-- sequência é única por (tipo, empresa_id) como sempre foi. Definida antes
-- dos itens de Repasses CEF logo abaixo, que referenciam esta tabela por FK.
CREATE TABLE mascara_itens (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo          VARCHAR(30) NOT NULL,
    grupo         VARCHAR(50) NOT NULL DEFAULT '',
    sequencia     INTEGER NOT NULL,
    descricao     VARCHAR(255) NOT NULL DEFAULT '',
    -- Só usado em tipo='REPASSES' (micro etapa) — prazo esperado, em dias,
    -- pra essa etapa. NULL nos demais tipos (DRE, DFC, PACOTES...), que não
    -- representam um passo de funil com prazo.
    sla_dias      INTEGER,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE (tipo, empresa_id, grupo, sequencia)
);

CREATE INDEX idx_mascara_itens_tipo ON mascara_itens (tipo);
CREATE INDEX idx_mascara_itens_empresa ON mascara_itens (empresa_id);

-- Filtros de visualização do bucket "Reserva" do Kanban de Repasses CEF
-- ("Configurar Filtros de Visualização" — engrenagem ao lado do botão
-- Atualizar). Um registro por empresa; array vazio = sem filtro (mostra
-- tudo). Multi-seleção guardada como array nativo do Postgres, não JSON.
-- Em `tipovenda`, '' representa a opção "Não informado" (tipovenda NULL na
-- tabela de reservas) — nunca aparece um valor real vazio lá, então não há
-- ambiguidade.
CREATE TABLE repasses_cef_filtros_reserva (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    tipovenda      TEXT[] NOT NULL DEFAULT '{}',
    situacao       TEXT[] NOT NULL DEFAULT '{}',
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

-- Cor escolhida (no seletor do "Configurar Filtros de Visualização") pra
-- cada valor de tipovenda/situação — é essa cor que aparece no badge do
-- card da reserva. Uma linha por valor, não por empresa (diferente da
-- tabela de filtros acima), porque cada valor tem sua própria cor.
CREATE TABLE repasses_cef_cores_reserva (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    campo         VARCHAR(20) NOT NULL,
    valor         VARCHAR(255) NOT NULL,
    cor           VARCHAR(7) NOT NULL,
    UNIQUE (empresa_id, campo, valor)
);

-- Histórico de movimentações de micro etapas, registrado manualmente pelo
-- usuário no modal "Histórico de Etapas" do Kanban de Repasses CEF. As
-- micro etapas em si são as já cadastradas em Máscaras (mascara_itens,
-- tipo='REPASSES', grupo=macro etapa). Ancorado sempre por
-- (empresa_id, idreserva) — o identificador estável da jornada do cliente,
-- que não muda quando o card troca de bucket — e por
-- centro_custo_sienge_id, garantindo que a movimentação nunca se perde nem
-- duplica ao longo do funil. Sem FK formal pro centro de custo (mesmo
-- critério de unidades_sienge/centro_custo_etapas_historico — o Sienge não
-- garante ordem de sincronização).
CREATE TABLE repasses_cef_historico_microetapas (
    id                     SERIAL PRIMARY KEY,
    empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    idreserva              INTEGER NOT NULL,
    centro_custo_sienge_id INTEGER NOT NULL,
    macro_etapa            VARCHAR(20) NOT NULL,
    mascara_item_id        INTEGER NOT NULL REFERENCES mascara_itens(id),
    data_movimentacao      DATE NOT NULL,
    descricao              TEXT,
    usuario_id             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em              TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_repasses_hist_micro_reserva
    ON repasses_cef_historico_microetapas (empresa_id, idreserva);

-- Anexos de cada movimentação — tabela filha própria (não coluna JSON),
-- pra permitir vários arquivos por movimentação.
CREATE TABLE repasses_cef_historico_microetapas_anexos (
    id                  SERIAL PRIMARY KEY,
    historico_id        INTEGER NOT NULL REFERENCES repasses_cef_historico_microetapas(id) ON DELETE CASCADE,
    nome_original       VARCHAR(255),
    arquivo_armazenado  VARCHAR(500) NOT NULL,
    tamanho_bytes       INTEGER,
    criado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_repasses_hist_micro_anexos_historico
    ON repasses_cef_historico_microetapas_anexos (historico_id);

-- Contratos (endpoint /sales-contracts do Sienge) que alimentam o bucket
-- "Contrato" do Kanban de Repasses CEF. Campos achatados 1:1 com o nome do
-- campo da API (camelCase original -> snake_case), sem colunas JSON — os
-- dados aninhados (compradores) viram tabela filha cascateada por FK.
CREATE TABLE sie_sales_contracts (
    sienge_contract_id             BIGINT NOT NULL,
    empresa_id                     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    company_id                     BIGINT,
    internal_company_id            BIGINT,
    company_name                   VARCHAR(255),
    enterprise_id                  BIGINT,
    internal_enterprise_id         BIGINT,
    enterprise_name                VARCHAR(255),
    receivable_bill_id             BIGINT,
    cancellation_payable_bill_id   BIGINT,
    contract_date                  TIMESTAMP,
    issue_date                     TIMESTAMP,
    accounting_date                TIMESTAMP,
    expected_delivery_date         TIMESTAMP,
    keys_delivered_at              TIMESTAMP,
    number                         VARCHAR(100),
    external_id                    VARCHAR(100),
    correction_type                VARCHAR(50),
    situation                      VARCHAR(50),
    discount_type                  VARCHAR(50),
    discount_percentage            NUMERIC(10,4),
    value                          NUMERIC(18,2),
    total_selling_value            NUMERIC(18,2),
    cancellation_date              TIMESTAMP,
    total_cancellation_amount      NUMERIC(18,2),
    cancellation_reason            TEXT,
    financial_institution_number   VARCHAR(100),
    financial_institution_date     TIMESTAMP,
    pro_rata_indexer               BIGINT,
    interest_type                  VARCHAR(50),
    interest_percentage            NUMERIC(10,4),
    fine_rate                      NUMERIC(10,4),
    late_interest_calculation_type VARCHAR(50),
    daily_late_interest_value      NUMERIC(18,2),
    contains_remade_installments   BOOLEAN,
    special_clause                 TEXT,
    criado_em                      TIMESTAMP DEFAULT NOW(),
    atualizado_em                  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (sienge_contract_id, empresa_id)
);

CREATE INDEX idx_sie_sales_contracts_empresa ON sie_sales_contracts (empresa_id);
CREATE INDEX idx_sie_sales_contracts_situation ON sie_sales_contracts (situation);

-- Compradores (salesContractCustomers) de cada contrato — o marcado como
-- `main = TRUE` é o titular mostrado no card.
CREATE TABLE sie_sales_contracts_customers (
    id                        SERIAL PRIMARY KEY,
    sienge_contract_id        BIGINT NOT NULL,
    empresa_id                INTEGER NOT NULL,
    customer_id                BIGINT,
    name                       VARCHAR(255),
    main                       BOOLEAN,
    spouse                     BOOLEAN,
    participation_percentage  NUMERIC(10,4),
    FOREIGN KEY (sienge_contract_id, empresa_id)
        REFERENCES sie_sales_contracts (sienge_contract_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_sales_contracts_customers_contract
    ON sie_sales_contracts_customers (sienge_contract_id, empresa_id);

CREATE TABLE integracoes_prevision (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    api_key_enc    TEXT NOT NULL,
    company_id     VARCHAR(50),
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_integracoes_prevision_empresa ON integracoes_prevision (empresa_id);

-- Planos de contas (payment-categories) importados do Sienge por empresa.
-- Chave composta (sienge_id, empresa_id): reimportações fazem upsert nos campos
-- vindos da API, sem apagar linhas — permitindo enriquecer o cadastro depois
-- com colunas adicionais que a sincronização não sobrescreve.
CREATE TABLE planos_financeiros_sienge (
    sienge_id              INTEGER NOT NULL,
    empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    name                   VARCHAR(255) NOT NULL,
    tp_conta               VARCHAR(5),
    fl_redutora            VARCHAR(1),
    fl_ativa               VARCHAR(1),
    fl_adiantamento        VARCHAR(1),
    fl_imposto             VARCHAR(1),
    criado_em              TIMESTAMP DEFAULT NOW(),
    atualizado_em          TIMESTAMP DEFAULT NOW(),
    classificacao_dre_id   INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    classificacao_dfc_id   INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    submascara_dre_id      INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    submascara_dfc_id      INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    projeta_mes_atual_dfc  BOOLEAN,
    -- Quantidade de dígitos do sienge_id que pertence a cada nível (1 a 7),
    -- definida pelo usuário ao gerar o plano financeiro. Usada para exibir o
    -- código separado por pontos (ex.: nível 1 = 2 dígitos, nível 2 = 2
    -- dígitos → "10.00..."). Um nível em branco encerra a divisão: os
    -- dígitos restantes ficam colados no último segmento, sem mais pontos.
    mascara_nivel_1        INTEGER,
    mascara_nivel_2        INTEGER,
    mascara_nivel_3        INTEGER,
    mascara_nivel_4        INTEGER,
    mascara_nivel_5        INTEGER,
    mascara_nivel_6        INTEGER,
    mascara_nivel_7        INTEGER,
    pacote_id              INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    tipo_projecao          VARCHAR(30),
    quantidade_meses       INTEGER,
    gera_orcamento         BOOLEAN,
    fonte_dados            VARCHAR(30),
    regra_calculo          VARCHAR(40),
    incremento_jan         NUMERIC(6,2),
    incremento_fev         NUMERIC(6,2),
    incremento_mar         NUMERIC(6,2),
    incremento_abr         NUMERIC(6,2),
    incremento_mai         NUMERIC(6,2),
    incremento_jun         NUMERIC(6,2),
    incremento_jul         NUMERIC(6,2),
    incremento_ago         NUMERIC(6,2),
    incremento_set         NUMERIC(6,2),
    incremento_out         NUMERIC(6,2),
    incremento_nov         NUMERIC(6,2),
    incremento_dez         NUMERIC(6,2),
    PRIMARY KEY (sienge_id, empresa_id)
);

CREATE INDEX idx_planos_fin_sienge_empresa ON planos_financeiros_sienge (empresa_id);

-- Centros de custo (enterprises) importados do Sienge por empresa.
-- Mesma lógica de chave composta e upsert do plano de contas.
CREATE TABLE centros_custo_sienge (
    sienge_id                  INTEGER NOT NULL,
    empresa_id                 INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    name                       VARCHAR(255) NOT NULL,
    commercial_name            VARCHAR(255),
    enterprise_observation     TEXT,
    cnpj                       VARCHAR(20),
    tipo                       VARCHAR(5),
    endereco                   VARCHAR(255),
    data_criacao               VARCHAR(50),
    data_modificacao           VARCHAR(50),
    criado_por                 VARCHAR(150),
    modificado_por             VARCHAR(150),
    company_id                 INTEGER,
    company_name               VARCHAR(255),
    cost_database_id           INTEGER,
    cost_database_description  VARCHAR(255),
    building_type_id           INTEGER,
    building_type_description  VARCHAR(255),
    criado_em                  TIMESTAMP DEFAULT NOW(),
    atualizado_em              TIMESTAMP DEFAULT NOW(),
    -- Campos de enriquecimento (cadastro manual, nunca sobrescritos pela sincronização com o Sienge)
    status                     VARCHAR(10) NOT NULL DEFAULT 'ATIVO',
    apelido                    VARCHAR(150),
    unidade_negocio_id         INTEGER REFERENCES mascara_itens(id) ON DELETE SET NULL,
    numero_unidades            INTEGER,
    codigo_prevision           VARCHAR(50),
    -- TRUE = Primário, FALSE = Secundário. Corresponde ao campo primary_view
    -- usado nas tabelas prevision_dashboard_* para saber qual visão de
    -- orçamento (dashboard) deste projeto Prevision deve ser considerada.
    prevision_primary_view     BOOLEAN NOT NULL DEFAULT TRUE,
    codigo_construtor_vendas   VARCHAR(50),
    codigo_contrato_caixa      VARCHAR(50),
    cep                        VARCHAR(8),
    cidade_enriquecida         VARCHAR(120),
    estado_enriquecido         VARCHAR(2),
    valor_geral_vendas         NUMERIC(14,2),
    faixa                      VARCHAR(10),
    PRIMARY KEY (sienge_id, empresa_id)
);

CREATE INDEX idx_centros_custo_sienge_empresa ON centros_custo_sienge (empresa_id);

-- Dados de dashboard (curva S, avanço mensal, pacotes de trabalho, evolução por
-- pavimento) sincronizados da API do Prevision, por centro de custo. A
-- sincronização é on-demand (reimporta com delete+insert por
-- empresa_id+sienge_id+primary_view) e usa como project_id o
-- centros_custo_sienge.codigo_prevision.
CREATE TABLE prevision_dashboard_general_info (
    id                SERIAL PRIMARY KEY,
    empresa_id        INTEGER NOT NULL,
    sienge_id         INTEGER NOT NULL,
    project_id        VARCHAR(50) NOT NULL,
    company_id        VARCHAR(50),
    primary_view      BOOLEAN NOT NULL,
    start_at          DATE,
    end_at            DATE,
    days_since_start  INTEGER,
    days_to_end       INTEGER,
    delay             NUMERIC(12,4),
    idp               NUMERIC(12,4),
    cost              NUMERIC(15,2),
    realized          NUMERIC(12,4),
    expected          NUMERIC(12,4),
    realized_cost     NUMERIC(15,2),
    last_measurement  VARCHAR(50),
    importado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em     TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE,
    UNIQUE (empresa_id, sienge_id, primary_view)
);

CREATE TABLE prevision_dashboard_scurve (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL,
    sienge_id     INTEGER NOT NULL,
    primary_view  BOOLEAN NOT NULL,
    data          DATE NOT NULL,
    base          NUMERIC(12,4),
    expected      NUMERIC(12,4),
    realized      NUMERIC(12,4),
    measured      NUMERIC(12,4),
    importado_em  TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_prevision_scurve_centro ON prevision_dashboard_scurve (empresa_id, sienge_id, primary_view);

CREATE TABLE prevision_dashboard_monthly_progress (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER NOT NULL,
    sienge_id     INTEGER NOT NULL,
    primary_view  BOOLEAN NOT NULL,
    data          DATE NOT NULL,
    base          NUMERIC(12,4),
    expected      NUMERIC(12,4),
    realized      NUMERIC(12,4),
    importado_em  TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_prevision_monthly_centro ON prevision_dashboard_monthly_progress (empresa_id, sienge_id, primary_view);

CREATE TABLE prevision_dashboard_work_packages (
    id                    SERIAL PRIMARY KEY,
    empresa_id            INTEGER NOT NULL,
    sienge_id             INTEGER NOT NULL,
    primary_view          BOOLEAN NOT NULL,
    service_id            VARCHAR(50),
    nome                  VARCHAR(255),
    posicao               INTEGER,
    cor                   VARCHAR(20),
    custo_total           NUMERIC(15,2),
    custo_base            NUMERIC(15,2),
    data_inicio_base      DATE,
    data_fim_base         DATE,
    data_inicio_prevista  DATE,
    data_fim_prevista     DATE,
    base                  NUMERIC(12,4),
    previsto              NUMERIC(12,4),
    realizado             NUMERIC(12,4),
    idp                   NUMERIC(12,4),
    duracao_base          INTEGER,
    duracao_prevista      INTEGER,
    atraso                NUMERIC(12,4),
    delta                 NUMERIC(12,4),
    importado_em          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_prevision_wp_centro ON prevision_dashboard_work_packages (empresa_id, sienge_id, primary_view);

CREATE TABLE prevision_dashboard_floor_evolution (
    id                    SERIAL PRIMARY KEY,
    empresa_id            INTEGER NOT NULL,
    sienge_id             INTEGER NOT NULL,
    primary_view          BOOLEAN NOT NULL,
    floor_id              VARCHAR(50),
    nome                  VARCHAR(255),
    posicao               INTEGER,
    grupo_replicacao      VARCHAR(100),
    custo_total           NUMERIC(15,2),
    custo_base            NUMERIC(15,2),
    data_inicio_base      DATE,
    data_fim_base         DATE,
    data_inicio_prevista  DATE,
    data_fim_prevista     DATE,
    base                  NUMERIC(12,4),
    previsto              NUMERIC(12,4),
    realizado             NUMERIC(12,4),
    idp                   NUMERIC(12,4),
    duracao_base          INTEGER,
    duracao_prevista      INTEGER,
    atraso                NUMERIC(12,4),
    delta                 NUMERIC(12,4),
    importado_em          TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge (sienge_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_prevision_floor_centro ON prevision_dashboard_floor_evolution (empresa_id, sienge_id, primary_view);

-- Unidades (imóveis) de cada centro de custo, importadas do endpoint
-- /units do Sienge. enterprise_id corresponde ao centros_custo_sienge.sienge_id
-- da mesma empresa (sem FK formal pois o Sienge não garante a ordem de sincronização).
CREATE TABLE unidades_sienge (
    sienge_unit_id                  BIGINT NOT NULL,
    empresa_id                      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    enterprise_id                   BIGINT,
    contract_id                     BIGINT,
    indexer_id                      BIGINT,
    name                            VARCHAR(200),
    property_type                   VARCHAR(100),
    note                            TEXT,
    commercial_stock                VARCHAR(20),
    latitude                        VARCHAR(100),
    longitude                       VARCHAR(100),
    legal_registration_number       VARCHAR(200),
    floor                           VARCHAR(50),
    contract_number                 VARCHAR(200),
    delivery_date                   DATE,
    scheduled_delivery_date         DATE,
    private_area                    NUMERIC(12,4),
    common_area                     NUMERIC(12,4),
    terrain_area                    NUMERIC(12,4),
    non_proportional_common_area    NUMERIC(12,4),
    ideal_fraction                  NUMERIC(15,8),
    ideal_fraction_square_meter     NUMERIC(12,4),
    general_sale_value_fraction     NUMERIC(12,4),
    terrain_value                   NUMERIC(18,2),
    indexed_quantity                NUMERIC(12,4),
    prized_compliance               VARCHAR(200),
    usable_area                     NUMERIC(12,4),
    iptu_value                      NUMERIC(18,2),
    real_estate_registration        VARCHAR(200),
    evaluation_date                 DATE,
    evaluation_price                NUMERIC(18,2),
    sale_value_date                 DATE,
    sale_value_price                NUMERIC(18,2),
    -- Valor de venda tal como veio do Sienge na última sincronização — nunca
    -- é sobrescrito por edição manual (sale_value_price é o valor "corrente",
    -- editável pela tela do Mapa de Unidades).
    sale_value_price_original       NUMERIC(18,2),
    -- Valor e situação do contrato de venda vinculado (endpoint
    -- /sales-contracts do Sienge, casado pelo contract_id já presente em
    -- cada unidade) — fonte usada para o VGV Vendido, já que
    -- evaluation.saleValuePrice normalmente vem vazio.
    contract_sale_value             NUMERIC(18,2),
    contract_situation              VARCHAR(30),
    contract_date                   DATE,
    child_units                     JSONB,
    groupings                       JSONB,
    special_values                  JSONB,
    criado_em                       TIMESTAMP DEFAULT NOW(),
    atualizado_em                   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (sienge_unit_id, empresa_id)
);

CREATE INDEX idx_unidades_sienge_enterprise ON unidades_sienge (empresa_id, enterprise_id);

-- Histórico de etapas de cada centro de custo (datas não podem se sobrepor,
-- validado na aplicação). As etapas disponíveis vêm da máscara "Etapas do
-- Centro de Custo" (mascara_itens.tipo = 'ETAPAS_CENTRO_CUSTO') da empresa.
CREATE TABLE centro_custo_etapas_historico (
    id              SERIAL PRIMARY KEY,
    sienge_id       INTEGER NOT NULL,
    empresa_id      INTEGER NOT NULL,
    mascara_item_id INTEGER NOT NULL REFERENCES mascara_itens(id) ON DELETE RESTRICT,
    data_inicio     DATE NOT NULL,
    data_fim        DATE,
    criado_em       TIMESTAMP DEFAULT NOW(),
    atualizado_em   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (sienge_id, empresa_id) REFERENCES centros_custo_sienge(sienge_id, empresa_id) ON DELETE CASCADE,
    CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX idx_cc_etapas_hist_centro ON centro_custo_etapas_historico (sienge_id, empresa_id);

-- Contas bancárias (checking-accounts) importadas do Sienge por empresa.
-- Mesma lógica de chave composta e upsert do plano de contas e centros de custo.
-- company_id entra na chave porque alguns códigos (ex.: "CAIXA", "EMISSAOCHQ")
-- são contas virtuais repetidas uma vez por empresa (companyId) do Sienge.
CREATE TABLE contas_bancarias_sienge (
    numero_conta   VARCHAR(20) NOT NULL,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    company_id     INTEGER NOT NULL,
    nome           VARCHAR(255),
    tipo_id        VARCHAR(5),
    tipo_descricao VARCHAR(50),
    agencia        VARCHAR(20),
    banco_numero   VARCHAR(20),
    banco_nome     VARCHAR(120),
    company_name   VARCHAR(255),
    status         VARCHAR(20),
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    banco_enriquecido    VARCHAR(120), -- código COMPE do banco (3 dígitos), escolhido na lista da BrasilAPI
    agencia_enriquecida  VARCHAR(20),
    conta_enriquecida    VARCHAR(20),
    digito               VARCHAR(5),
    projeta_saldo        BOOLEAN,
    saldo_inicial        NUMERIC(15,2),
    data_saldo_inicial   DATE,
    -- Texto livre, mas só pode ser um `nome` já cadastrado em classificacoes_bancarias para
    -- esta mesma empresa (validado na aplicação, sem FK — mesmo espírito de banco_enriquecido).
    classificacao        VARCHAR(50),
    PRIMARY KEY (numero_conta, empresa_id, company_id)
);

CREATE INDEX idx_contas_bancarias_sienge_empresa ON contas_bancarias_sienge (empresa_id);

-- Classificações bancárias cadastráveis por empresa (antes era uma lista fixa de 6 valores
-- global pro sistema inteiro) — cada uma define a prioridade a seguir quando a busca
-- automática de saldo (VanPix) não retorna nada pra aquele dia: repetir o saldo do dia
-- anterior (SALDO_ANTERIOR) ou deixar sem saldo nenhum (SEM_SALDO). `contas_bancarias_sienge.
-- classificacao` referencia o `nome` daqui por texto (empresa nova nasce sem nenhuma linha —
-- o combobox de classificação do cadastro de contas fica vazio até serem cadastradas).
CREATE TABLE classificacoes_bancarias (
    id                     SERIAL PRIMARY KEY,
    empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome                   VARCHAR(50) NOT NULL,
    prioridade_sem_saldo   VARCHAR(20) NOT NULL DEFAULT 'SEM_SALDO'
        CHECK (prioridade_sem_saldo IN ('SALDO_ANTERIOR', 'SEM_SALDO')),
    criado_em              TIMESTAMP DEFAULT NOW(),
    atualizado_em          TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, nome)
);

-- Saldo de cada conta bancária em cada dia, informado à mão na tela Operações >
-- Saldo Contas Bancárias. Uma linha por (conta, dia): limpar a célula na tela apaga
-- a linha (dia sem linha = saldo não informado, que é diferente de saldo zero).
CREATE TABLE saldos_contas_bancarias (
    empresa_id     INTEGER NOT NULL,
    company_id     INTEGER NOT NULL,
    numero_conta   VARCHAR(20) NOT NULL,
    data           DATE NOT NULL,
    saldo          NUMERIC(15,2) NOT NULL,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, company_id, numero_conta, data),
    FOREIGN KEY (numero_conta, empresa_id, company_id)
        REFERENCES contas_bancarias_sienge (numero_conta, empresa_id, company_id) ON DELETE CASCADE
);

CREATE INDEX idx_saldos_contas_bancarias_data ON saldos_contas_bancarias (empresa_id, data);

-- Histórico dos dias liberados pra lançar saldo na tela Operações > Saldo Contas Bancárias
-- (o cadeado) — 1 linha por dia que já foi aberto alguma vez, nunca apagada. status=ABERTO é
-- o dia liberado AGORA (só esse aceita gravação em salvarSaldos; ver saldos.service.js); sem
-- nenhuma linha ABERTO pra uma empresa = cadeado trancado, nada é editável. status=ENCERRADO
-- é um dia que já foi usado e fechado — abrir de novo o mesmo dia pede confirmação na tela
-- ("já foi encerrado, deseja reabrir?"). Índice único parcial garante no máximo 1 ABERTO por
-- empresa de cada vez (regra do usuário: não dá pra abrir outro sem encerrar o atual).
CREATE TABLE saldos_periodos (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    data           DATE NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'ABERTO', -- ABERTO ou ENCERRADO
    aberto_por     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    aberto_em      TIMESTAMP DEFAULT NOW(),
    encerrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    encerrado_em   TIMESTAMP,
    UNIQUE (empresa_id, data)
);

CREATE UNIQUE INDEX idx_saldos_periodos_aberto_unico ON saldos_periodos (empresa_id) WHERE status = 'ABERTO';

-- Logomarca customizada de um banco (cadastro de Bancos, aba Bancos de Operações > Saldo
-- Contas Bancárias) — sobrepõe a logo oficial da BrasilAPI pra aquele código enquanto
-- existir uma linha aqui. Data URI (base64), já redimensionada no navegador antes de
-- enviar; sem linha = usa a logo oficial (ou nenhuma, se a BrasilAPI também não tiver).
CREATE TABLE bancos_logos (
    codigo        VARCHAR(3) PRIMARY KEY,
    logo          TEXT NOT NULL,
    criado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Portal das Construtoras — EPR (Extrato de Unidades de Empreendimento / CAIXA).
-- Um empreendimento por (empresa_id, contrato_mestre_obra); reimportar o mesmo
-- contrato substitui integralmente os mutuários daquele contrato (delete + insert).
CREATE TABLE epr_empreendimentos (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    contrato_mestre_obra    VARCHAR(20) NOT NULL,
    arquivo_original        VARCHAR(255),
    arquivo_armazenado      VARCHAR(500),
    nome_empreendimento     VARCHAR(255),
    uno                     VARCHAR(10),
    unidade_financeira      VARCHAR(10),
    data_inicio_obra        DATE,
    data_fim_obra           DATE,
    data_emissao_extrato    DATE,
    seguro_sgc_numero       VARCHAR(50),
    seguro_sgc_vigencia     DATE,
    seguro_sre_numero       VARCHAR(50),
    seguro_sre_vigencia     DATE,
    seguro_sgp_numero       VARCHAR(50),
    seguro_sgp_vigencia     DATE,
    seguro_sgt_numero       VARCHAR(50),
    seguro_sgt_vigencia     DATE,
    quantidade_mutuarios    INTEGER DEFAULT 0,
    enviado_por_usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    importado_em            TIMESTAMP DEFAULT NOW(),
    atualizado_em           TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, contrato_mestre_obra)
);

CREATE INDEX idx_epr_empreendimentos_empresa ON epr_empreendimentos (empresa_id);

CREATE TABLE epr_mutuarios (
    id                          SERIAL PRIMARY KEY,
    empresa_id                  INTEGER NOT NULL,
    contrato_mestre_obra        VARCHAR(20) NOT NULL,
    contrato_mutuario           VARCHAR(20) NOT NULL,
    nome_mutuario                VARCHAR(255),
    uno                          VARCHAR(10),
    orr                          VARCHAR(10),
    to_codigo                    VARCHAR(5),
    cod                          VARCHAR(10),
    data_assinatura               DATE,
    tipo_unidade                 VARCHAR(5),
    garantia_automatica          VARCHAR(5),
    data_inclusao_contrato       DATE,
    data_inclusao_registro       DATE,
    valor_retido                 NUMERIC(14,2) DEFAULT 0,
    valor_amortizado             NUMERIC(14,2) DEFAULT 0,
    amortizado                   BOOLEAN DEFAULT FALSE,
    importado_em                  TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, contrato_mestre_obra)
      REFERENCES epr_empreendimentos (empresa_id, contrato_mestre_obra) ON DELETE CASCADE
);

CREATE INDEX idx_epr_mutuarios_contrato ON epr_mutuarios (empresa_id, contrato_mestre_obra);

-- Portal das Construtoras — DCD (Demonstrativo de Cronograma de Desembolso / CAIXA).
-- Um contrato por (empresa_id, numero_contrato); reimportar substitui integralmente
-- os cronogramas daquele contrato (delete + insert), igual ao EPR.
CREATE TABLE dcd_contratos (
    id                                      SERIAL PRIMARY KEY,
    empresa_id                              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero_contrato                         VARCHAR(20) NOT NULL,
    arquivo_original                        VARCHAR(255),
    arquivo_armazenado                      VARCHAR(500),
    emitente                                VARCHAR(50),
    nome_empreendimento                     VARCHAR(255),
    origem_recurso                          VARCHAR(20),
    numero_pedido                           VARCHAR(20),
    codigo_pedido                           VARCHAR(20),
    linha_financiamento                     VARCHAR(20),
    numero_empreendimento                   VARCHAR(20),
    situacao_pedido                         VARCHAR(30),
    tipo_financiamento                      VARCHAR(20),
    quantidade_parcelas                     INTEGER,
    data_termino_suspensiva                 DATE,
    regencia_critica                        VARCHAR(20),
    numero_apf                              VARCHAR(20),
    data_inicio_rotina_atraso_obra          DATE,
    prazo_obra_atual                        INTEGER,
    codigo_seguradora_sgc                   VARCHAR(20),
    apolice_seguro_sgc                      VARCHAR(20),
    prazo_obra_original                     INTEGER,
    codigo_seguradora_sre                   VARCHAR(20),
    apolice_seguro_sre                      VARCHAR(20),
    percentual_minimo_obra                  NUMERIC(9,2),
    codigo_seguradora_sgp                   VARCHAR(20),
    apolice_seguro_sgp                      VARCHAR(20),
    adiantamento_defasagem_obra             VARCHAR(80),
    codigo_seguradora_sgt                   VARCHAR(20),
    apolice_seguro_sgt                      VARCHAR(20),
    tipo_rotina                             VARCHAR(80),
    quantidade_unidades                     INTEGER,
    quantidade_unidades_financiadas         INTEGER,
    quantidade_unidades_comercializadas     INTEGER,
    valor_custo_obra                        NUMERIC(15,2),
    total_financiamento                     NUMERIC(15,2),
    despesa_legal_terreno_financiamento     NUMERIC(15,2),
    orcamento_compra_venda                  NUMERIC(15,2),
    total_fgts                              NUMERIC(15,2),
    despesa_legal_terreno_fgts              NUMERIC(15,2),
    valor_compra_venda_unidade              NUMERIC(15,2),
    total_recurso_proprio_mutuario          NUMERIC(15,2),
    despesa_legal_terreno_recurso_proprio   NUMERIC(15,2),
    valor_compra_venda_terreno              NUMERIC(15,2),
    percentual_obra_executada               NUMERIC(9,2),
    valor_financiamento_outro_agente        NUMERIC(15,2),
    saldo_mutuario_pf                       NUMERIC(15,2),
    data_assinatura                         DATE,
    valor_terreno_outro_agente              NUMERIC(15,2),
    saldo_aporte_construtora                NUMERIC(15,2),
    data_inicio_obra                        DATE,
    valor_aporte_construtora                NUMERIC(15,2),
    saldo_mutuario_pj                       NUMERIC(15,2),
    data_termino_obra_original              DATE,
    valor_financiamento_pj                  NUMERIC(15,2),
    saldo_devedor_pj                        NUMERIC(15,2),
    data_termino_obra_atual                 DATE,
    garantia_termino_obra                   NUMERIC(15,2),
    subsidio_resolucao_460                  NUMERIC(15,2),
    subsidio_convenios                      NUMERIC(15,2),
    custo_terreno                           NUMERIC(15,2),
    total_suplementacao_pj                  NUMERIC(15,2),
    maximo_liberacao_geral_pj               NUMERIC(15,2),
    reducao_maxima_geral_pj                 NUMERIC(15,2),
    valor_minimo_garantia_hipotecaria       NUMERIC(15,2),
    maximo_liberacao_etapa_pj               NUMERIC(15,2),
    reducao_maxima_etapa_pj                 NUMERIC(15,2),
    recomposicao_etapa_pj                   NUMERIC(15,2),
    amortizacao_recomposicao_etapa_pj       NUMERIC(15,2),
    recomposicao_sem_registro_etapa_pj      NUMERIC(15,2),
    percentual_antecipacao_pj               NUMERIC(9,2),
    valor_total_antecipacao_pj              NUMERIC(15,2),
    enviado_por_usuario_id                  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    importado_em                            TIMESTAMP DEFAULT NOW(),
    atualizado_em                           TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, numero_contrato)
);

CREATE INDEX idx_dcd_contratos_empresa ON dcd_contratos (empresa_id);

CREATE TABLE dcd_cronograma_fisico_financeiro (
    id                              SERIAL PRIMARY KEY,
    empresa_id                      INTEGER NOT NULL,
    numero_contrato                 VARCHAR(20) NOT NULL,
    parcela                         VARCHAR(10),
    data_parcela                    DATE,
    percentual_etapa                NUMERIC(9,2),
    percentual_acumulado            NUMERIC(9,2),
    valor_compra_venda              NUMERIC(15,2),
    valor_fgts                      NUMERIC(15,2),
    valor_rp_mutuario                NUMERIC(15,2),
    valor_rp_aportado                NUMERIC(15,2),
    valor_desconto                  NUMERIC(15,2),
    valor_financiamento_mutuario    NUMERIC(15,2),
    valor_rp_construtora             NUMERIC(15,2),
    valor_financiamento_construtora NUMERIC(15,2),
    importado_em                    TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, numero_contrato)
      REFERENCES dcd_contratos (empresa_id, numero_contrato) ON DELETE CASCADE
);

CREATE INDEX idx_dcd_crono_ff_contrato ON dcd_cronograma_fisico_financeiro (empresa_id, numero_contrato);

CREATE TABLE dcd_cronograma_liberacao (
    id                          SERIAL PRIMARY KEY,
    empresa_id                  INTEGER NOT NULL,
    numero_contrato              VARCHAR(20) NOT NULL,
    parcela                      VARCHAR(10),
    data_parcela                 DATE,
    status                       VARCHAR(10),
    fgts                         NUMERIC(15,2),
    rp_mutuario                   NUMERIC(15,2),
    desconto                     NUMERIC(15,2),
    financiamento_mutuario       NUMERIC(15,2),
    aporte_construtora_ci        NUMERIC(15,2),
    aporte_terreno               NUMERIC(15,2),
    financiamento_construtora    NUMERIC(15,2),
    recomposicao_pj              NUMERIC(15,2),
    remuneracao                  NUMERIC(15,2),
    importado_em                 TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, numero_contrato)
      REFERENCES dcd_contratos (empresa_id, numero_contrato) ON DELETE CASCADE
);

CREATE INDEX idx_dcd_crono_lib_contrato ON dcd_cronograma_liberacao (empresa_id, numero_contrato);

CREATE TABLE extrato_empreendimentos (
    id                          SERIAL PRIMARY KEY,
    empresa_id                  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    contrato_empreendimento     VARCHAR(20) NOT NULL,
    nome_empreendimento         VARCHAR(255),
    entidade_organizadora       VARCHAR(255),
    cnpj_entidade_organizadora  VARCHAR(20),
    identificacao_empreendimento VARCHAR(30),
    apf                         VARCHAR(20),
    unidade_federacao           VARCHAR(2),
    municipio                   VARCHAR(120),
    arquivo_original            VARCHAR(255),
    arquivo_armazenado          VARCHAR(500),
    enviado_por_usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    importado_em                TIMESTAMP DEFAULT NOW(),
    atualizado_em                TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, contrato_empreendimento)
);

CREATE TABLE extrato_unidades (
    id                            SERIAL PRIMARY KEY,
    empresa_id                    INTEGER NOT NULL,
    contrato_empreendimento       VARCHAR(20) NOT NULL,
    tipo_unidade                  VARCHAR(30),
    numero_contrato_unidade       VARCHAR(20) NOT NULL,
    nome_mutuario                 VARCHAR(255),
    cpf_cnpj_mutuario              VARCHAR(20),
    data_assinatura_contrato      DATE,
    data_inclusao_dados_registro_cri DATE,
    valor_financiamento           NUMERIC(15,2),
    valor_financiamento_terreno   NUMERIC(15,2),
    valor_desconto_subsidio_complementar NUMERIC(15,2),
    valor_fgts                    NUMERIC(15,2),
    valor_recursos_proprios       NUMERIC(15,2),
    valor_compra_venda            NUMERIC(15,2),
    valor_avaliacao_imovel        NUMERIC(15,2),
    fracao_ideal                  NUMERIC(15,6),
    data_inicio_atraso_obra       DATE,
    unidade_desligada             VARCHAR(5),
    importado_em                  TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, contrato_empreendimento)
      REFERENCES extrato_empreendimentos (empresa_id, contrato_empreendimento) ON DELETE CASCADE
);

CREATE INDEX idx_extrato_unidades_contrato ON extrato_unidades (empresa_id, contrato_empreendimento);

CREATE TABLE extrato_cronograma (
    id                       SERIAL PRIMARY KEY,
    empresa_id               INTEGER NOT NULL,
    contrato_empreendimento  VARCHAR(20) NOT NULL,
    data_evento              DATE,
    origem                   VARCHAR(60),
    evento                   VARCHAR(120),
    parcela                  VARCHAR(10),
    valor                    NUMERIC(15,2),
    importado_em             TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, contrato_empreendimento)
      REFERENCES extrato_empreendimentos (empresa_id, contrato_empreendimento) ON DELETE CASCADE
);

CREATE INDEX idx_extrato_cronograma_contrato ON extrato_cronograma (empresa_id, contrato_empreendimento);

CREATE TABLE extrato_proximos_eventos (
    id                       SERIAL PRIMARY KEY,
    empresa_id               INTEGER NOT NULL,
    contrato_empreendimento  VARCHAR(20) NOT NULL,
    data_evento              DATE,
    origem                   VARCHAR(60),
    evento                   VARCHAR(120),
    parcela                  VARCHAR(10),
    valor                    NUMERIC(15,2),
    importado_em             TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (empresa_id, contrato_empreendimento)
      REFERENCES extrato_empreendimentos (empresa_id, contrato_empreendimento) ON DELETE CASCADE
);

CREATE INDEX idx_extrato_proximos_eventos_contrato ON extrato_proximos_eventos (empresa_id, contrato_empreendimento);

CREATE TABLE curva_obras_calibragem_manual (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sienge_id       INTEGER NOT NULL,
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL,
    avanco_mes      NUMERIC(9,2) NOT NULL,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em       TIMESTAMP DEFAULT NOW(),
    atualizado_em   TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, sienge_id, ano, mes)
);

CREATE INDEX idx_curva_calibragem_centro ON curva_obras_calibragem_manual (empresa_id, sienge_id);

-- Previsto (R$) da Curva de Vendas, editável manualmente pelo usuário apenas
-- para o mês atual e meses futuros. Mês sem ajuste aqui é tratado como 0.
CREATE TABLE curva_vendas_previsto_manual (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sienge_id       INTEGER NOT NULL,
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL,
    valor_previsto  NUMERIC(18,2) NOT NULL,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em       TIMESTAMP DEFAULT NOW(),
    atualizado_em   TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, sienge_id, ano, mes)
);

CREATE INDEX idx_curva_vendas_previsto_centro ON curva_vendas_previsto_manual (empresa_id, sienge_id);

-- Unidades disponíveis "reservadas" para o Previsto de um mês específico da
-- Curva de Vendas (escolhidas na janela de unidades disponíveis). Uma unidade
-- só pode estar alocada a um único mês por vez (chave única sem ano/mes),
-- para não ser contada em dois meses ao mesmo tempo.
CREATE TABLE curva_vendas_previsto_unidades (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    sienge_id       INTEGER NOT NULL,
    ano             INTEGER NOT NULL,
    mes             INTEGER NOT NULL,
    sienge_unit_id  BIGINT NOT NULL,
    criado_em       TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, sienge_id, sienge_unit_id)
);

CREATE INDEX idx_curva_vendas_previsto_unidades_mes ON curva_vendas_previsto_unidades (empresa_id, sienge_id, ano, mes);

CREATE TABLE periodos (
    id                     SERIAL PRIMARY KEY,
    empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    data_inicio            DATE NOT NULL,
    data_fim               DATE NOT NULL,
    criado_por_usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em              TIMESTAMP DEFAULT NOW(),
    atualizado_em          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_periodos_empresa ON periodos (empresa_id);

-- Operações escolhidas para o período (ex.: CURVA_OBRAS, CURVA_VENDAS) — as
-- mesmas chaves usadas no menu Operações do frontend.
CREATE TABLE periodo_operacoes (
    id          SERIAL PRIMARY KEY,
    periodo_id  INTEGER NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
    operacao    VARCHAR(40) NOT NULL,
    UNIQUE (periodo_id, operacao)
);

-- Certificados digitais (.pfx) de uma empresa — uma empresa pode ter vários.
-- O arquivo em si fica no disco (backend/uploads/certificados/<empresaId>/...);
-- aqui só ficam os metadados e a senha criptografada (utils/crypto.js).
CREATE TABLE certificados_digitais (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome                VARCHAR(255) NOT NULL,
    arquivo_original    VARCHAR(255) NOT NULL,
    arquivo_armazenado  VARCHAR(255) NOT NULL,
    senha_enc           TEXT NOT NULL,
    validade_ate        DATE,
    criado_em           TIMESTAMP DEFAULT NOW(),
    atualizado_em       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_certificados_digitais_empresa ON certificados_digitais (empresa_id);

-- Estado de consulta NF-e/NFS-e por certificado (cada certificado = um CNPJ).
-- Guarda o último NSU de cada serviço para continuar de onde parou, e quando
-- foi a última consulta (usado para respeitar o limite de 1 consulta/hora por
-- CNPJ imposto pela Receita Federal).
CREATE TABLE espiao_certificado_estado (
    certificado_id      INTEGER PRIMARY KEY REFERENCES certificados_digitais(id) ON DELETE CASCADE,
    cnpj                 VARCHAR(14),
    ultima_consulta_em   TIMESTAMP,
    ultimo_nsu_nfe       VARCHAR(20) DEFAULT '000000000000000',
    ultimo_nsu_nfse      BIGINT DEFAULT 0,
    criado_em            TIMESTAMP DEFAULT NOW(),
    atualizado_em        TIMESTAMP DEFAULT NOW()
);

-- Notas fiscais (NF-e de produtos e NFS-e de serviços) encontradas para a
-- empresa. O XML de cada nota é salvo em disco (mesmo padrão de dcd/extrato).
CREATE TABLE espiao_notas (
    id                  SERIAL PRIMARY KEY,
    empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    -- RESTRICT (não SET NULL): excluir um certificado não pode nunca
    -- desvincular as notas já encontradas com ele — o cadastro de
    -- certificados só permite substituir, nunca excluir, por causa disso.
    certificado_id      INTEGER REFERENCES certificados_digitais(id) ON DELETE RESTRICT,
    tipo                VARCHAR(10) NOT NULL,
    chave_acesso        VARCHAR(60) NOT NULL,
    emissor              VARCHAR(255),
    destinatario         VARCHAR(255),
    data_emissao         TIMESTAMP,
    -- Número e série da nota (não a chave de acesso) — extraídos do XML
    -- (<nNF>/<serie> na NF-e, <nNFSe>/<serie> da DPS na NFS-e). Quando o
    -- documento é um resNFe (resumo) sem esses campos soltos, são derivados
    -- das posições fixas da própria chave de 44 dígitos.
    numero_nota          VARCHAR(20),
    serie_nota           VARCHAR(10),
    arquivo_armazenado   VARCHAR(255),
    -- Atualizada quando chega um evento (resEvento/procEventoNFe da NF-e ou
    -- <evento> da NFS-e) referenciando esta nota — ex. "Cancelamento de
    -- NFS-e". Sempre reflete só a ÚLTIMA etapa; o histórico completo (toda
    -- etapa, uma linha cada) fica em espiao_notas_eventos.
    situacao             VARCHAR(100) NOT NULL DEFAULT 'Emitida',
    -- Classificação da situação em 3 grupos pra exibição (badge azul/
    -- vermelho/verde na tela): 'emitida' (nenhum evento ainda), 'cancelada'
    -- (a nota perdeu o valor fiscal — definitivo, nunca volta pra outra
    -- categoria mesmo com eventos posteriores, ver registrarEvento) e
    -- 'complementada' (qualquer outro evento — autorização de CT-e,
    -- registro de passagem, comprovante de entrega etc.).
    situacao_categoria   VARCHAR(20) NOT NULL DEFAULT 'emitida',
    -- Inativação manual (usuário marca notas e explica o motivo). Nota
    -- inativa some da tela comum e passa a aparecer só na tela de notas
    -- inativadas, com o log de quem inativou e por quê.
    inativa              BOOLEAN NOT NULL DEFAULT FALSE,
    inativada_por        INTEGER REFERENCES usuarios(id),
    inativada_em         TIMESTAMP,
    motivo_inativacao    TEXT,
    -- Ciência manual (usuário marca notas como já revisadas, sem inativar)
    -- — controla a aba "Cientes" da tela; NULL = ainda cai na aba "Novas".
    -- Diferente de `situacao` (evento oficial da Receita): ciência é uma
    -- marcação interna de quem já revisou a nota, não muda o status fiscal.
    ciente_por           INTEGER REFERENCES usuarios(id),
    ciente_em            TIMESTAMP,
    -- TRUE quando o XML salvo é só o resumo (resNFe) que a SEFAZ distribui
    -- pra quem não é o emitente — sem itens/produtos, sem valor de
    -- auditoria nenhum. Nota com apenas_resumo = TRUE fica escondida de
    -- toda listagem (ver espiao.service.js::montarFiltrosNotas e as
    -- funções list*) até a SEFAZ eventualmente distribuir a versão
    -- completa (procNFe/nfeProc) da mesma chave, que sobrescreve o XML e
    -- vira FALSE (ver salvarNota). NFS-e não tem esse conceito de resumo —
    -- sempre chega completa, então fica FALSE.
    apenas_resumo        BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em            TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, chave_acesso)
);

CREATE INDEX idx_espiao_notas_empresa ON espiao_notas (empresa_id, data_emissao);
CREATE INDEX idx_espiao_notas_inativa ON espiao_notas (empresa_id, inativa);

-- Histórico de etapas de cada nota do Espião — uma linha por evento
-- recebido (nunca sobrescreve, ao contrário de espiao_notas.situacao). A
-- 1ª linha de toda nota é sempre "Emitida" (criada junto com a nota, ver
-- espiao.service.js::salvarNota); as seguintes vêm de eventos reais da
-- SEFAZ/ADN (cancelamento, autorização de CT-e, registro de passagem
-- etc. — ver registrarEvento). Alimenta a janela de "histórico de etapas"
-- da tela.
CREATE TABLE espiao_notas_eventos (
    id            SERIAL PRIMARY KEY,
    nota_id       INTEGER NOT NULL REFERENCES espiao_notas(id) ON DELETE CASCADE,
    descricao     VARCHAR(255) NOT NULL,
    categoria     VARCHAR(20) NOT NULL,
    -- Data/hora do evento em si, extraída do XML da SEFAZ quando disponível
    -- (ver extrairEventoNfe/extrairEventoNfse) — null quando o tipo de
    -- evento não carrega essa tag; nesse caso a ordem de exibição usa `id`
    -- (ordem de chegada), não esta coluna.
    data_evento   TIMESTAMP,
    criado_em     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_espiao_notas_eventos_nota ON espiao_notas_eventos (nota_id);

-- Agendamento de consulta automática — um por empresa do sistema (não por
-- certificado), para não criar centenas de rotinas quando a empresa tiver
-- muitos certificados. Quando a rotina dispara, ela varre todos os
-- certificados válidos daquela empresa.
CREATE TABLE espiao_agendamentos (
    empresa_id         INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    intervalo_horas    INTEGER NOT NULL,
    -- Controle do agendador (backend/src/modules/espiao-nfe-nfse/agendador.js):
    -- quando NOW() - ultima_execucao_em >= intervalo_horas, dispara a
    -- consulta automática dessa empresa (todos os certificados válidos).
    ultima_execucao_em TIMESTAMP,
    criado_em          TIMESTAMP DEFAULT NOW(),
    atualizado_em      TIMESTAMP DEFAULT NOW()
);

-- Motor de Risco (Operações — Gestão de Cobranças) — parâmetros de contagem,
-- escalas/pesos dos indicadores e faixas de corte usados para classificar o
-- cliente em Bom pagador / Duvidoso / Mau pagador. Sempre versionado: cada
-- "Salvar nova versão" na tela INSERE uma linha nova aqui, nunca faz UPDATE
-- — por isso não tem atualizado_em/trigger, só criado_em. A versão de maior
-- número de cada empresa é a vigente; as demais ficam disponíveis só pra
-- consulta no combobox "Versão" da tela.
CREATE TABLE motor_risco_versoes (
    id                         SERIAL PRIMARY KEY,
    empresa_id                 INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    versao                     INTEGER NOT NULL,
    tolerancia_dias            INTEGER NOT NULL,
    janela_observacao_meses    INTEGER NOT NULL,
    gatilho_reincidencia_dias  INTEGER NOT NULL,
    minimo_parcelas            INTEGER NOT NULL,
    dia_recalculo              INTEGER NOT NULL,
    trava_subida_parcelas      INTEGER NOT NULL,
    -- Regra dura da régua de cobrança: qualquer parcela em aberto vencida há
    -- mais dias que este valor força o cliente pra Mau pagador na hora,
    -- ignorando o score (ver cobranca_clientes_clusters) — é o parâmetro que
    -- o pipeline real usa (o gatilho por protesto/acordo/execução planejado
    -- originalmente nunca foi implementado, pois o Sienge não fornece esse dado).
    dias_vencidos_regua_cobranca INTEGER NOT NULL,
    corte_bom_pagador          INTEGER NOT NULL,
    corte_pagador_duvidoso     INTEGER NOT NULL,
    criado_por_usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em                  TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, versao)
);

CREATE INDEX idx_motor_risco_versoes_empresa ON motor_risco_versoes (empresa_id);

-- Escala (nota 0 = pior valor aceitável, nota 100 = valor ideal) e peso de
-- cada indicador do score, uma linha por indicador dentro de cada versão.
-- `indicador` é um dos 5 códigos fixos do motor (ver motorRisco.controller.js):
-- pct_em_dia, atraso_medio, maior_atraso, reincidencia, relacionamento.
CREATE TABLE motor_risco_indicadores (
    id         SERIAL PRIMARY KEY,
    versao_id  INTEGER NOT NULL REFERENCES motor_risco_versoes(id) ON DELETE CASCADE,
    indicador  VARCHAR(30) NOT NULL,
    nota_0     NUMERIC(10,2) NOT NULL,
    nota_100   NUMERIC(10,2) NOT NULL,
    peso       INTEGER NOT NULL,
    UNIQUE (versao_id, indicador)
);

-- Parcelas do contas a receber (endpoint bulk-data/v1/income do Sienge) —
-- base bruta usada pra clusterizar o cliente no Motor de Risco e, no
-- futuro, montar a régua de cobrança (Operações — Gestão de Cobranças).
-- Sincronização por empresa: cada "Sincronizar" apaga e reinsere tudo
-- daquela empresa (mesmo critério do sie_sales_contracts), identificando a
-- parcela por billId+installmentId dentro do tenant Sienge da empresa.
-- Campos achatados 1:1 com o nome do campo da API (camelCase -> snake_case),
-- sem coluna JSON — as listas aninhadas (categorias, recebimentos,
-- movimentos bancários, categorias do movimento) viram tabelas filhas
-- cascateadas por FK. O objeto `paymentTerm` (não é lista) entra achatado
-- direto nas duas colunas payment_term_*: a API devolve o campo da
-- descrição com o nome "descrition" (com esse erro de digitação mesmo,
-- confirmado testando a API ao vivo — o Swagger da documentação mostra
-- "description", mas não é isso que a API manda de verdade).
CREATE TABLE sie_income (
    bill_id                       BIGINT NOT NULL,
    installment_id                BIGINT NOT NULL,
    empresa_id                    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    company_id                    BIGINT,
    company_name                  VARCHAR(255),
    business_area_id              BIGINT,
    business_area_name            VARCHAR(255),
    project_id                    BIGINT,
    project_name                  VARCHAR(255),
    group_company_id              BIGINT,
    group_company_name            VARCHAR(255),
    holding_id                    BIGINT,
    holding_name                  VARCHAR(255),
    subsidiary_id                 BIGINT,
    subsidiary_name               VARCHAR(255),
    business_type_id              BIGINT,
    business_type_name            VARCHAR(255),
    client_id                     BIGINT,
    client_name                   VARCHAR(255),
    document_identification_id    VARCHAR(50),
    document_identification_name  VARCHAR(255),
    document_number               VARCHAR(100),
    document_forecast             VARCHAR(20),
    origin_id                     VARCHAR(50),
    original_amount               NUMERIC(18,2),
    discount_amount                NUMERIC(18,2),
    tax_amount                     NUMERIC(18,2),
    indexer_id                     BIGINT,
    indexer_name                   VARCHAR(255),
    due_date                       DATE,
    issue_date                     DATE,
    bill_date                      DATE,
    installment_base_date          DATE,
    balance_amount                 NUMERIC(18,2),
    corrected_balance_amount       NUMERIC(18,2),
    periodicity_type               VARCHAR(50),
    embedded_interest_amount       NUMERIC(18,2),
    interest_type                  VARCHAR(50),
    interest_rate                  NUMERIC(10,4),
    correction_type                VARCHAR(50),
    -- Vem como "string" solto na API (não como data formatada, diferente de
    -- due_date/issue_date/etc.) — guardado como texto de propósito.
    interest_base_date             VARCHAR(20),
    defaulter_situation            VARCHAR(50),
    sub_judicie                    VARCHAR(10),
    main_unit                      VARCHAR(100),
    installment_number             VARCHAR(20),
    payment_term_id                VARCHAR(50),
    payment_term_description       VARCHAR(255),
    bearer_id                      BIGINT,
    criado_em                      TIMESTAMP DEFAULT NOW(),
    atualizado_em                  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (bill_id, installment_id, empresa_id)
);

CREATE INDEX idx_sie_income_empresa ON sie_income (empresa_id);
CREATE INDEX idx_sie_income_client ON sie_income (empresa_id, client_id);
CREATE INDEX idx_sie_income_due_date ON sie_income (empresa_id, due_date);
CREATE INDEX idx_sie_income_defaulter ON sie_income (empresa_id, defaulter_situation);

-- Rateio por categoria financeira/centro de custo (receiptsCategories) de
-- cada parcela — uma parcela pode ratear entre mais de um.
CREATE TABLE sie_income_categorias (
    id                          SERIAL PRIMARY KEY,
    bill_id                     BIGINT NOT NULL,
    installment_id              BIGINT NOT NULL,
    empresa_id                  INTEGER NOT NULL,
    business_type_id            BIGINT,
    business_type_name          VARCHAR(255),
    business_area_id            BIGINT,
    business_area_name          VARCHAR(255),
    cost_center_id               BIGINT,
    cost_center_name             VARCHAR(255),
    financial_category_id        VARCHAR(50),
    financial_category_name      VARCHAR(255),
    financial_category_reducer   VARCHAR(20),
    financial_category_type      VARCHAR(50),
    financial_category_rate      NUMERIC(10,4),
    project_id                   BIGINT,
    project_name                 VARCHAR(255),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_income (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_income_categorias_parcela ON sie_income_categorias (bill_id, installment_id, empresa_id);

-- Recebimentos (receipts) já baixados/quitados de cada parcela — o
-- histórico real de pagamento (valor pago, data do pagamento) que alimenta
-- o cálculo de atraso/pontualidade do Motor de Risco.
CREATE TABLE sie_income_recebimentos (
    id                           SERIAL PRIMARY KEY,
    bill_id                      BIGINT NOT NULL,
    installment_id               BIGINT NOT NULL,
    empresa_id                   INTEGER NOT NULL,
    operation_type_id             BIGINT,
    operation_type_name           VARCHAR(255),
    gross_amount                  NUMERIC(18,2),
    monetary_correction_amount    NUMERIC(18,2),
    interest_amount                NUMERIC(18,2),
    fine_amount                    NUMERIC(18,2),
    discount_amount                NUMERIC(18,2),
    tax_amount                     NUMERIC(18,2),
    net_amount                     NUMERIC(18,2),
    addition_amount                NUMERIC(18,2),
    insurance_amount               NUMERIC(18,2),
    due_adm_amount                 NUMERIC(18,2),
    calculation_date                DATE,
    payment_date                    DATE,
    -- Não está no exemplo do Swagger da API, mas a resposta real devolve
    -- (testado ao vivo) — mantido por fidelidade 1:1 com o que a API manda.
    credit_date                     DATE,
    account_company_id              BIGINT,
    account_number                  VARCHAR(50),
    account_type                    VARCHAR(50),
    sequencial_number                INTEGER,
    indexer_id                       BIGINT,
    embedded_interest_amount         NUMERIC(18,2),
    pro_rata                         NUMERIC(10,4),
    FOREIGN KEY (bill_id, installment_id, empresa_id)
        REFERENCES sie_income (bill_id, installment_id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_income_recebimentos_parcela ON sie_income_recebimentos (bill_id, installment_id, empresa_id);
CREATE INDEX idx_sie_income_recebimentos_pagamento ON sie_income_recebimentos (empresa_id, payment_date);

-- Movimentos bancários (bankMovements) de cada recebimento — a baixa em si,
-- com o valor de fato movimentado na conta.
CREATE TABLE sie_income_recebimentos_movimentos (
    id                  SERIAL PRIMARY KEY,
    recebimento_id       INTEGER NOT NULL REFERENCES sie_income_recebimentos(id) ON DELETE CASCADE,
    -- Id do movimento no Sienge — guardado só por fidelidade com a API (é o
    -- mesmo valor que aparece em bank_movement_id nas categorias abaixo);
    -- quem garante unicidade/integridade aqui é o id (SERIAL) da própria linha.
    bank_movement_id      BIGINT,
    bank_movement_date     DATE,
    sequencial_number       INTEGER,
    amount                   NUMERIC(18,2),
    historic_id              BIGINT,
    historic_name            VARCHAR(255),
    operation_id             BIGINT,
    operation_name           VARCHAR(255),
    operation_type           VARCHAR(50),
    reconcile                VARCHAR(10),
    corrected_amount         NUMERIC(18,2),
    origin_id                VARCHAR(50)
);

CREATE INDEX idx_sie_income_recebimentos_movimentos_recebimento
    ON sie_income_recebimentos_movimentos (recebimento_id);

-- Rateio por categoria financeira do movimento bancário (financialCategories
-- dentro de bankMovements) — mesmo formato de sie_income_categorias (a API
-- devolve os mesmos campos aqui também, não só o subconjunto do Swagger),
-- só que na baixa, mais bank_movement_id por fidelidade com a API.
CREATE TABLE sie_income_recebimentos_movimentos_categorias (
    id                          SERIAL PRIMARY KEY,
    movimento_id                 INTEGER NOT NULL REFERENCES sie_income_recebimentos_movimentos(id) ON DELETE CASCADE,
    business_type_id             BIGINT,
    business_type_name           VARCHAR(255),
    business_area_id             BIGINT,
    business_area_name           VARCHAR(255),
    cost_center_id                BIGINT,
    cost_center_name              VARCHAR(255),
    financial_category_id         VARCHAR(50),
    financial_category_name       VARCHAR(255),
    financial_category_reducer    VARCHAR(20),
    financial_category_type       VARCHAR(50),
    financial_category_rate       NUMERIC(10,4),
    project_id                    BIGINT,
    project_name                  VARCHAR(255),
    bank_movement_id              BIGINT
);

CREATE INDEX idx_sie_income_recebimentos_movimentos_categorias_movimento
    ON sie_income_recebimentos_movimentos_categorias (movimento_id);

-- Clientes (customers) do Sienge — public/api/v1/customers, diferente da
-- bulk-data do income (essa aqui pagina de verdade por limit/offset, ver
-- customersSienge-api.client.js). Mesmo padrão de sie_income: grava o
-- empresa_id de quem sincronizou, apaga tudo da empresa e reinsere inteiro
-- a cada "Atualizar Clientes" (ver customersSienge.service.js::sincronizar).
CREATE TABLE sie_customers (
    id                              BIGINT NOT NULL,
    empresa_id                      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    person_type                     VARCHAR(20),
    foreigner                       VARCHAR(5),
    international_id                VARCHAR(60),
    -- created_at/modified_at* vêm como texto solto na API (não como data
    -- formatada) — guardados como texto de propósito, mesmo critério de
    -- interest_base_date em sie_income.
    created_at                      VARCHAR(40),
    modified_at                     VARCHAR(40),
    modified_at_date_time           VARCHAR(40),
    issuing_body                    VARCHAR(60),
    name                            VARCHAR(255),
    social_name                     VARCHAR(255),
    email                           VARCHAR(255),
    birth_date                      VARCHAR(20),
    birth_place                     VARCHAR(120),
    civil_status                    VARCHAR(40),
    cpf                             VARCHAR(20),
    father_name                     VARCHAR(255),
    mother_name                     VARCHAR(255),
    sex                             VARCHAR(20),
    issue_date_identity_card        VARCHAR(20),
    matrimonial_regime              VARCHAR(60),
    marriage_date                   VARCHAR(20),
    nationality                     VARCHAR(60),
    number_identity_card            VARCHAR(40),
    profession                      VARCHAR(120),
    mailing_address                 VARCHAR(5),
    license_number                  VARCHAR(40),
    license_issuing_body            VARCHAR(60),
    license_issue_date              VARCHAR(20),
    city_registration_number        VARCHAR(60),
    cnae_number                     VARCHAR(20),
    cnpj                            VARCHAR(20),
    contact_name                    VARCHAR(255),
    crea_number                     VARCHAR(40),
    establishment_date              VARCHAR(20),
    fantasy_name                    VARCHAR(255),
    note                            TEXT,
    site                            VARCHAR(255),
    share_capital                   NUMERIC(18,2),
    state_registration_number       VARCHAR(60),
    technical_manager               VARCHAR(255),
    client_type                     VARCHAR(60),
    activity_id                     BIGINT,
    activity_description            VARCHAR(255),
    government_entity_id            BIGINT,
    government_entity_description   VARCHAR(255),
    criado_em                       TIMESTAMP DEFAULT NOW(),
    atualizado_em                   TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, empresa_id)
);

CREATE INDEX idx_sie_customers_empresa ON sie_customers (empresa_id);
CREATE INDEX idx_sie_customers_cpf_cnpj ON sie_customers (empresa_id, cpf, cnpj);

-- Subtipos do cliente (subTypes[]) — ex.: comprador, fiador, procurador.
CREATE TABLE sie_customers_sub_types (
    id             SERIAL PRIMARY KEY,
    customer_id    BIGINT NOT NULL,
    empresa_id     INTEGER NOT NULL,
    sub_type_id    BIGINT,
    description    VARCHAR(255),
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_customers_sub_types_cliente ON sie_customers_sub_types (customer_id, empresa_id);

-- Telefones do cliente (phones[], nível raiz — diferente dos telefones do
-- procurador, ver sie_customers_procurator_phones abaixo).
CREATE TABLE sie_customers_phones (
    id             SERIAL PRIMARY KEY,
    customer_id    BIGINT NOT NULL,
    empresa_id     INTEGER NOT NULL,
    number         VARCHAR(40),
    main           BOOLEAN,
    type           VARCHAR(60),
    note           VARCHAR(255),
    idd            VARCHAR(10),
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_customers_phones_cliente ON sie_customers_phones (customer_id, empresa_id);

-- Endereços do cliente (addresses[], nível raiz).
CREATE TABLE sie_customers_addresses (
    id              SERIAL PRIMARY KEY,
    customer_id     BIGINT NOT NULL,
    empresa_id      INTEGER NOT NULL,
    type            VARCHAR(60),
    street_name     VARCHAR(255),
    number          VARCHAR(20),
    complement      VARCHAR(255),
    neighborhood    VARCHAR(120),
    city_id         BIGINT,
    city            VARCHAR(120),
    state           VARCHAR(10),
    zip_code        VARCHAR(20),
    mail            BOOLEAN,
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_customers_addresses_cliente ON sie_customers_addresses (customer_id, empresa_id);

-- Agentes vinculados ao cliente (agents[] — a API só devolve o id).
CREATE TABLE sie_customers_agents (
    id             SERIAL PRIMARY KEY,
    customer_id    BIGINT NOT NULL,
    empresa_id     INTEGER NOT NULL,
    agent_id       BIGINT,
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_customers_agents_cliente ON sie_customers_agents (customer_id, empresa_id);

-- Renda familiar declarada (familyIncome[]) — usado em financiamento de
-- imóvel, quando aplicável.
CREATE TABLE sie_customers_family_income (
    id             SERIAL PRIMARY KEY,
    customer_id    BIGINT NOT NULL,
    empresa_id     INTEGER NOT NULL,
    kins_name      VARCHAR(255),
    kinship        VARCHAR(120),
    income_value   NUMERIC(18,2),
    observation    VARCHAR(255),
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_sie_customers_family_income_cliente ON sie_customers_family_income (customer_id, empresa_id);

-- Procurador do cliente (procurators — objeto único na API, não lista; 1
-- linha por cliente quando existir). `proxy_*` é o sub-objeto `proxy`
-- (dados da procuração) achatado com prefixo.
CREATE TABLE sie_customers_procurators (
    id                     SERIAL PRIMARY KEY,
    customer_id            BIGINT NOT NULL,
    empresa_id             INTEGER NOT NULL,
    cpf                    VARCHAR(20),
    email                  VARCHAR(255),
    name                   VARCHAR(255),
    profession             VARCHAR(120),
    civil_status           VARCHAR(40),
    nationality            VARCHAR(60),
    number_identity_card   VARCHAR(40),
    proxy_book             VARCHAR(40),
    proxy_date             VARCHAR(20),
    proxy_expiration_date  VARCHAR(20),
    proxy_district         VARCHAR(120),
    proxy_registry         VARCHAR(120),
    proxy_sheet            VARCHAR(40),
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE,
    UNIQUE (customer_id, empresa_id)
);

-- Endereços do procurador (procurators.addresses[] — sem cityId/mail,
-- diferente do endereço raiz do cliente).
CREATE TABLE sie_customers_procurator_addresses (
    id              SERIAL PRIMARY KEY,
    procurator_id   INTEGER NOT NULL REFERENCES sie_customers_procurators (id) ON DELETE CASCADE,
    type            VARCHAR(60),
    street_name     VARCHAR(255),
    number          VARCHAR(20),
    complement      VARCHAR(255),
    neighborhood    VARCHAR(120),
    city            VARCHAR(120),
    state           VARCHAR(10),
    zip_code        VARCHAR(20)
);

CREATE INDEX idx_sie_customers_procurator_addresses_procurador
    ON sie_customers_procurator_addresses (procurator_id);

-- Telefones do procurador (procurators.phones[]).
CREATE TABLE sie_customers_procurator_phones (
    id              SERIAL PRIMARY KEY,
    procurator_id   INTEGER NOT NULL REFERENCES sie_customers_procurators (id) ON DELETE CASCADE,
    number          VARCHAR(40),
    main            BOOLEAN,
    type            VARCHAR(60),
    note            VARCHAR(255),
    idd             VARCHAR(10)
);

CREATE INDEX idx_sie_customers_procurator_phones_procurador
    ON sie_customers_procurator_phones (procurator_id);

-- Cônjuge do cliente (spouse — objeto único na API; o endereço dele
-- (spouse.addresses) também é um objeto único, não lista, por isso vem
-- achatado aqui mesmo com prefixo `endereco_`, sem tabela filha própria.
CREATE TABLE sie_customers_spouse (
    id                        SERIAL PRIMARY KEY,
    customer_id               BIGINT NOT NULL,
    empresa_id                INTEGER NOT NULL,
    cpf                       VARCHAR(20),
    name                      VARCHAR(255),
    email                     VARCHAR(255),
    sex                       VARCHAR(20),
    foreigner                 VARCHAR(5),
    international_id          VARCHAR(60),
    civil_status              VARCHAR(40),
    birth_date                VARCHAR(20),
    number_identity_card      VARCHAR(40),
    issue_date_identity_card  VARCHAR(20),
    profession                VARCHAR(120),
    nationality               VARCHAR(60),
    birth_place               VARCHAR(120),
    father_name               VARCHAR(255),
    mother_name               VARCHAR(255),
    cellphone_number          VARCHAR(40),
    business_phone            VARCHAR(40),
    company                   VARCHAR(255),
    endereco_city             VARCHAR(120),
    endereco_complement       VARCHAR(255),
    endereco_neighborhood     VARCHAR(120),
    endereco_number           VARCHAR(20),
    endereco_street_name      VARCHAR(255),
    endereco_zip_code         VARCHAR(20),
    FOREIGN KEY (customer_id, empresa_id) REFERENCES sie_customers (id, empresa_id) ON DELETE CASCADE,
    UNIQUE (customer_id, empresa_id)
);

-- Flag "Comunicar" da aba Clientes — SEM FK pra sie_customers de propósito:
-- essa tabela apaga e reinsere tudo a cada "Atualizar clientes" (ver
-- customers.service.js::sincronizar), então uma FK com ON DELETE CASCADE
-- apagaria a marcação escolhida pelo usuário a cada sincronização nova.
-- Fica com vida própria, só ligada por client_id + empresa_id. Sem linha =
-- TRUE (mesmo "sem linha = valor padrão" usado em outras tabelas da régua
-- de cobrança) — por padrão, todo cliente ativo entra na comunicação;
-- desmarcar é a exceção.
CREATE TABLE sie_customers_comunicar (
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    client_id      BIGINT NOT NULL,
    comunicar      BOOLEAN NOT NULL DEFAULT TRUE,
    atualizado_em  TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, client_id)
);

-- Estado oficial atual do cluster de cada cliente (Novo cliente / Bom
-- pagador / Pagador duvidoso / Mau pagador), calculado pelo pipeline real do
-- Motor de Risco (backend/src/modules/cobranca-clusters) a partir de
-- sie_income + sie_income_recebimentos, aplicando a versão vigente de
-- motor_risco_versoes. Uma linha por cliente — cada "Recalcular clusters"
-- faz UPSERT aqui (nunca duplica). `cluster` usa o mesmo vocabulário do
-- `tom` do simulador (novo/bom/duvidoso/mau). Piorar é sempre imediato;
-- melhorar respeita a trava de subida (trava_subida_parcelas) — por isso o
-- cluster aqui pode não bater com o que o score "bruto" indicaria; o motivo
-- fica registrado em cobranca_clientes_clusters_historico.
CREATE TABLE cobranca_clientes_clusters (
    id                        SERIAL PRIMARY KEY,
    empresa_id                INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    client_id                 BIGINT NOT NULL,
    client_name                VARCHAR(255),
    cluster                    VARCHAR(10) NOT NULL, -- novo | bom | duvidoso | mau
    score                      NUMERIC(5,2),
    motivo_tipo                VARCHAR(20) NOT NULL, -- score | novo_cliente | regra_dura
    regra_dura_ativa           BOOLEAN NOT NULL DEFAULT FALSE,
    parcelas_em_dia_seguidas   INTEGER NOT NULL DEFAULT 0,
    versao_motor_risco_id      INTEGER REFERENCES motor_risco_versoes(id) ON DELETE SET NULL,
    -- Mesmo objeto { indicadores, contexto } gravado em
    -- cobranca_clientes_clusters_historico.indicadores_detalhe (ver lá) —
    -- duplicado aqui pra listar o rastreio do score direto na tela de
    -- clientes do cluster (nível 2), sem precisar de join com o histórico.
    indicadores_detalhe          JSONB,
    mes_referencia              DATE NOT NULL,
    calculado_em                TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, client_id)
);

CREATE INDEX idx_cobranca_clientes_clusters_empresa ON cobranca_clientes_clusters (empresa_id, cluster);

-- Log append-only de cada reclassificação (nunca UPDATE fora do upsert por
-- competência — clicar em "Recalcular" mais de uma vez dentro do mesmo
-- mes_referencia atualiza a mesma linha, não duplica; uma competência nova
-- sempre insere linha nova). É a base auditável de "por que este cliente
-- está neste cluster": guarda o breakdown completo por indicador (nota,
-- peso, pontos) e o detalhe da regra dura (qual parcela disparou, quantos
-- dias de atraso), igual à tabela "Como o score foi formado" do simulador.
CREATE TABLE cobranca_clientes_clusters_historico (
    id                        SERIAL PRIMARY KEY,
    empresa_id                 INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    client_id                  BIGINT NOT NULL,
    client_name                 VARCHAR(255),
    mes_referencia               DATE NOT NULL,
    cluster_anterior             VARCHAR(10),
    cluster_novo                 VARCHAR(10) NOT NULL,
    score                        NUMERIC(5,2),
    indicadores_detalhe           JSONB,
    regra_dura_disparada           BOOLEAN NOT NULL DEFAULT FALSE,
    regra_dura_detalhe             JSONB,
    subiu_bloqueado_por_trava       BOOLEAN NOT NULL DEFAULT FALSE,
    parcelas_em_dia_seguidas        INTEGER NOT NULL DEFAULT 0,
    versao_motor_risco_id            INTEGER REFERENCES motor_risco_versoes(id) ON DELETE SET NULL,
    criado_por_usuario_id             INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em                          TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, client_id, mes_referencia)
);

CREATE INDEX idx_cobranca_clusters_historico_cliente
    ON cobranca_clientes_clusters_historico (empresa_id, client_id, mes_referencia DESC);

-- Biblioteca de templates da aba Comunicação — nome/descrição pra achar o
-- template, assunto + corpo (com variáveis tipo @nome_cliente, substituídas
-- na hora de enviar/pré-visualizar), se manda o boleto junto e em quais
-- clusters da régua ele pode ser escolhido (mesmo vocabulário de
-- novo/bom/duvidoso/mau/inad usado em regua_cobranca_etapas.cluster).
-- Definida antes de regua_cobranca_etapas por causa da FK abaixo.
CREATE TABLE comunicacao_templates (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome           VARCHAR(150) NOT NULL DEFAULT 'Novo template',
    descricao      VARCHAR(255) NOT NULL DEFAULT '',
    assunto        VARCHAR(255) NOT NULL DEFAULT '',
    corpo          TEXT NOT NULL DEFAULT '',
    enviar_boleto  BOOLEAN NOT NULL DEFAULT FALSE,
    clusters       VARCHAR(20)[] NOT NULL DEFAULT '{}',
    criado_em      TIMESTAMP DEFAULT NOW(),
    atualizado_em  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comunicacao_templates_empresa ON comunicacao_templates (empresa_id);

-- Régua de Cobrança: etapas de contato configuradas por empresa + cluster.
-- "inad" (Inadimplência) é um 5º cluster que existe só aqui, dentro da
-- régua — não é uma categoria em cobranca_clientes_clusters (que continua
-- só com novo/bom/duvidoso/mau; a regra dura por dias vencidos já cai em
-- "mau" lá, ver cobrancaClusters.service.js). A régua só LÊ o parâmetro
-- dias_vencidos_regua_cobranca da versão vigente do Motor de Risco (pra
-- mostrar a fronteira D+N e validar o intervalo de dias de cada etapa),
-- nunca escreve nele.
CREATE TABLE regua_cobranca_etapas (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cluster                 VARCHAR(20) NOT NULL CHECK (cluster IN ('novo','bom','duvidoso','mau','inad')),
    nome                    VARCHAR(150) NOT NULL DEFAULT 'Nova etapa',
    -- Relativo ao vencimento: negativo = antes, 0 = no dia, positivo = depois.
    -- NULL = etapa recém-criada, ainda não configurada (nasce em branco e
    -- inativa — ver reguaCobranca.service.js::criarEtapa; o front mostra
    -- esse e os demais campos obrigatórios em âmbar enquanto vazios).
    dias                    INTEGER,
    canal_whatsapp          BOOLEAN NOT NULL DEFAULT TRUE,
    canal_email             BOOLEAN NOT NULL DEFAULT FALSE,
    canal_ligacao           BOOLEAN NOT NULL DEFAULT FALSE,
    -- Referência a um template da biblioteca de Comunicação (mesma
    -- empresa). Só pode apontar pra um template cujo `clusters` inclua este
    -- `cluster` — validado no backend (ver
    -- reguaCobranca.service.js::garantirTemplateElegivel), não só escondido
    -- no combobox do front. Template excluído solta a etapa (SET NULL) em
    -- vez de bloquear a exclusão.
    template_id             INTEGER REFERENCES comunicacao_templates(id) ON DELETE SET NULL,
    responsavel_usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    ativa                   BOOLEAN NOT NULL DEFAULT TRUE,
    -- Independente de `ativa`: uma etapa pode estar ativa (configurada,
    -- contada nos badges/desenho da régua) sem ainda estar liberada pra
    -- rotina automática de disparo (ver aba Rotinas) pegar e disparar de
    -- verdade — dá pra revisar/testar a etapa sem risco de já sair
    -- mensagem pro cliente. Nasce desligada, mesmo critério de `ativa`
    -- (ver reguaCobranca.service.js::criarEtapa).
    rotina_habilitada       BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em               TIMESTAMP DEFAULT NOW(),
    atualizado_em           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_regua_cobranca_etapas_empresa_cluster ON regua_cobranca_etapas (empresa_id, cluster);

-- Histórico de etapas é escopado POR PARCELA (bill_id+installment_id), não
-- por cliente: um mesmo cliente pode ter parcelas diferentes em etapas
-- diferentes da mesma régua ao mesmo tempo (ex.: uma parcela em D+15 e
-- outra em D+60), e cada uma tem sua própria jornada. Diferente da 1ª
-- versão deste desenho, NÃO existe mais uma tabela de "rastro" persistido:
-- pra 1 parcela só, a data em que ela alcançou cada etapa é 100%
-- determinística (`due_date + etapa.dias` dias), então a timeline inteira
-- (passado E futuro) é calculada na hora, direto de regua_cobranca_etapas +
-- sie_income.due_date (ver historicoCliente.service.js::
-- montarTimelineParcela) — nada pra reconciliar ou manter sincronizado.
-- Só o que não dá pra derivar — observações manuais do responsável e, no
-- futuro, o rastro de disparos automáticos de verdade (tipo='automatico',
-- usuario_id NULL) — precisa ser de fato persistido, na tabela abaixo.
CREATE TABLE regua_cobranca_historico_registros (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    bill_id        BIGINT NOT NULL,
    installment_id BIGINT NOT NULL,
    tipo           VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (tipo IN ('manual', 'automatico')),
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    canal          VARCHAR(20) CHECK (canal IN ('whatsapp', 'email', 'ligacao')),
    descricao      TEXT NOT NULL DEFAULT '',
    data_registro  DATE NOT NULL,
    criado_em      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_regua_historico_registros ON regua_cobranca_historico_registros (empresa_id, bill_id, installment_id, data_registro);

-- Anexos de 1 registro — mesmo padrão de armazenamento de
-- repasses_cef_historico_microetapas_anexos (arquivo em disco, só o
-- metadado aqui).
CREATE TABLE regua_cobranca_historico_anexos (
    id                  SERIAL PRIMARY KEY,
    registro_id         INTEGER NOT NULL REFERENCES regua_cobranca_historico_registros(id) ON DELETE CASCADE,
    nome_original       VARCHAR(255) NOT NULL,
    arquivo_armazenado  VARCHAR(255) NOT NULL,
    tamanho_bytes       INTEGER,
    criado_em           TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_regua_historico_anexos ON regua_cobranca_historico_anexos (registro_id);

-- Registra QUANDO uma tentativa de envio (hoje só WhatsApp, via Z-API —
-- ver historicoCliente.service.js::registrarObservacao) falhou de verdade
-- (telefone sem WhatsApp, conexão Z-API fora do ar, etc.) — diferente de
-- `regua_cobranca_historico_registros`, que só existe pra tentativa BEM
-- SUCEDIDA (nada é gravado lá quando falha, de propósito). É o que
-- distingue, na tela de Rotinas, "ainda não tentei" (pendente) de "tentei
-- e não consegui" (erro) — ver rotinas.service.js. 1 linha por
-- parcela+canal+data (UNIQUE): tentar de novo na mesma data só atualiza a
-- mensagem/hora, não acumula; um envio bem-sucedido depois apaga esta
-- linha (a falha "para de existir" assim que resolve).
CREATE TABLE regua_cobranca_envios_falhos (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    bill_id         BIGINT NOT NULL,
    installment_id  BIGINT NOT NULL,
    canal           VARCHAR(20) NOT NULL CHECK (canal IN ('whatsapp', 'email')),
    data_registro   DATE NOT NULL,
    mensagem_erro   TEXT,
    criado_em       TIMESTAMP DEFAULT NOW(),
    UNIQUE (empresa_id, bill_id, installment_id, canal, data_registro)
);
CREATE INDEX idx_regua_envios_falhos ON regua_cobranca_envios_falhos (empresa_id, bill_id, installment_id, data_registro);

-- Parâmetros de disparo diário das etapas ativas, 1 linha por
-- empresa+cluster (cada cluster tem os próprios parâmetros, ver
-- ConfiguracoesGlobaisPainel.jsx). Sem linha = 09:00 e nenhuma conexão
-- selecionada — só grava quando o usuário mexe em algum campo.
CREATE TABLE regua_cobranca_horario_disparo (
    empresa_id           INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cluster              VARCHAR(20) NOT NULL CHECK (cluster IN ('novo','bom','duvidoso','mau','inad')),
    horario              TIME NOT NULL DEFAULT '09:00:00',
    -- Qual conexão (de qual integração) dispara as mensagens deste cluster.
    -- NULL = nenhuma selecionada ainda (não impede o horário/canal de
    -- serem configurados antes da conexão existir). Perde a referência
    -- (SET NULL) se a conexão for excluída, não bloqueia a exclusão.
    zapi_integracao_id   INTEGER REFERENCES integracoes_zapi(id) ON DELETE SET NULL,
    email_integracao_id  INTEGER REFERENCES integracoes_email(id) ON DELETE SET NULL,
    atualizado_em        TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (empresa_id, cluster)
);

-- Parametrização da "data de hoje" usada pelos disparos da régua — 1 linha
-- por empresa. Sem linha = usar_data_real TRUE (default abaixo). Com
-- usar_data_real desligado, data_ficticia substitui a data real do dia em
-- todos os cálculos de disparo, pra simular datas em teste sem esperar o
-- calendário andar.
CREATE TABLE regua_cobranca_data_sistema (
    empresa_id      INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    usar_data_real  BOOLEAN NOT NULL DEFAULT TRUE,
    data_ficticia   DATE,
    atualizado_em   TIMESTAMP DEFAULT NOW()
);

-- Flag "Ativar Comunicação Automática" (Configurações Globais) — 1 linha
-- por empresa. Sem linha = desligada (mesmo critério de "nasce desligada"
-- de rotina_habilitada: ligada de propósito, não por padrão). Desligada é
-- o estado real hoje mesmo (ainda não existe nenhum job de disparo de
-- verdade rodando) — enquanto isso, WhatsApp/E-mail na Rotina do dia viram
-- checkbox manual, igual à Ligação (ver rotinas.service.js). Ligada é só a
-- preparação pro dia em que esse job existir — status de leitura, como já
-- é hoje.
CREATE TABLE regua_cobranca_comunicacao_automatica (
    empresa_id      INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    ativa           BOOLEAN NOT NULL DEFAULT FALSE,
    atualizado_em   TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_usuarios_atualizado_em
BEFORE UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_clientes_atualizado_em
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_empresas_atualizado_em
BEFORE UPDATE ON empresas
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_integracoes_sienge_atualizado_em
BEFORE UPDATE ON integracoes_sienge
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_integracoes_construtor_vendas_atualizado_em
BEFORE UPDATE ON integracoes_construtor_vendas
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_planos_fin_sienge_atualizado_em
BEFORE UPDATE ON planos_financeiros_sienge
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_centros_custo_sienge_atualizado_em
BEFORE UPDATE ON centros_custo_sienge
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_unidades_sienge_atualizado_em
BEFORE UPDATE ON unidades_sienge
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_certificados_digitais_atualizado_em
BEFORE UPDATE ON certificados_digitais
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_espiao_certificado_estado_atualizado_em
BEFORE UPDATE ON espiao_certificado_estado
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_espiao_agendamentos_atualizado_em
BEFORE UPDATE ON espiao_agendamentos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_mascara_itens_atualizado_em
BEFORE UPDATE ON mascara_itens
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_cc_etapas_hist_atualizado_em
BEFORE UPDATE ON centro_custo_etapas_historico
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_contas_bancarias_sienge_atualizado_em
BEFORE UPDATE ON contas_bancarias_sienge
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_saldos_contas_bancarias_atualizado_em
BEFORE UPDATE ON saldos_contas_bancarias
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_bancos_logos_atualizado_em
BEFORE UPDATE ON bancos_logos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_sie_sales_contracts_atualizado_em
BEFORE UPDATE ON sie_sales_contracts
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_periodos_atualizado_em
BEFORE UPDATE ON periodos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_epr_empreendimentos_atualizado_em
BEFORE UPDATE ON epr_empreendimentos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_dcd_contratos_atualizado_em
BEFORE UPDATE ON dcd_contratos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_extrato_empreendimentos_atualizado_em
BEFORE UPDATE ON extrato_empreendimentos
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_curva_calibragem_atualizado_em
BEFORE UPDATE ON curva_obras_calibragem_manual
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_curva_vendas_previsto_atualizado_em
BEFORE UPDATE ON curva_vendas_previsto_manual
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_regua_cobranca_etapas_atualizado_em
BEFORE UPDATE ON regua_cobranca_etapas
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_regua_cobranca_horario_disparo_atualizado_em
BEFORE UPDATE ON regua_cobranca_horario_disparo
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_regua_cobranca_data_sistema_atualizado_em
BEFORE UPDATE ON regua_cobranca_data_sistema
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_regua_cobranca_comunicacao_automatica_atualizado_em
BEFORE UPDATE ON regua_cobranca_comunicacao_automatica
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_sie_customers_comunicar_atualizado_em
BEFORE UPDATE ON sie_customers_comunicar
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_comunicacao_templates_atualizado_em
BEFORE UPDATE ON comunicacao_templates
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

CREATE TRIGGER trg_integracoes_mcp_atualizado_em
BEFORE UPDATE ON integracoes_mcp
FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();

-- Views usadas SOMENTE pela ferramenta de SQL livre do servidor MCP
-- (backend/src/modules/integracoes-mcp/tools/consultaSql.js). Cada uma já
-- filtra a empresa sozinha, lendo de `current_setting('app.empresa_id')` —
-- que o handler da ferramenta define via `SELECT set_config(...)` dentro da
-- MESMA transação, antes de rodar a consulta montada pelo Claude. Isso
-- torna estruturalmente impossível vazar dado de outra empresa nessa
-- ferramenta, mesmo que a consulta "esqueça" o filtro: a query do Claude só
-- enxerga estas views (nunca as tabelas reais), e a view já vem pré-filtrada
-- pelo próprio Postgres. `current_setting(..., true)` com o 2º argumento
-- `true` faz devolver NULL (em vez de erro) quando a config não foi
-- setada — nesse caso a comparação com empresa_id nunca bate e a view
-- devolve 0 linhas, nunca "todas as empresas".
CREATE VIEW mcp_sie_income AS
    SELECT * FROM sie_income
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_sie_income_categorias AS
    SELECT * FROM sie_income_categorias
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_sie_income_recebimentos AS
    SELECT * FROM sie_income_recebimentos
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_sie_customers AS
    SELECT * FROM sie_customers
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_sie_customers_phones AS
    SELECT * FROM sie_customers_phones
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_cobranca_clientes_clusters AS
    SELECT * FROM cobranca_clientes_clusters
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

CREATE VIEW mcp_regua_cobranca_historico_registros AS
    SELECT * FROM regua_cobranca_historico_registros
    WHERE empresa_id = current_setting('app.empresa_id', true)::int;

-- Logs de acesso às telas do sistema — cada linha é uma visita a uma tela
-- (ver frontend/src/hooks/useLogAcesso.js), usada pelo dashboard de
-- Relatórios > Métricas de Uso. `tela` guarda o caminho canônico da tela
-- (ex.: '/operacoes/espiao-nfe-nfse'), não a URL completa — uma rota de
-- detalhe como /cadastros/empresas/42 é normalizada pro path da tela-mãe
-- antes de chegar aqui, senão a métrica por tela ficaria fragmentada por
-- registro em vez de agregada por tela.
CREATE TABLE logs_acesso (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tela         VARCHAR(120) NOT NULL,
    criado_em    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_logs_acesso_usuario ON logs_acesso (usuario_id);
CREATE INDEX idx_logs_acesso_tela ON logs_acesso (tela);
CREATE INDEX idx_logs_acesso_criado_em ON logs_acesso (criado_em);
