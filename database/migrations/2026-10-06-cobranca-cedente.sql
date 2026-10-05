-- Cobrança (retorno CNAB 240 CAIXA/SIGCB via VanPix) somada ao saldo na abertura do período.
-- Ver backend/src/modules/saldo-contas-bancarias/vanpix-sync.service.js e utils/cnab240.js.

-- Apelido VanPix do convênio de cobrança da conta (ex.: C3U1Y8) — tem que estar cadastrado
-- numa conexão VanPix com finalidade COBRANCA.
ALTER TABLE contas_bancarias_sienge ADD COLUMN IF NOT EXISTS codigo_cedente_cobranca VARCHAR(50);

-- Parte do saldo do dia que veio da cobrança (títulos com Dt Crédito = data). `saldo` é o total.
ALTER TABLE saldos_contas_bancarias ADD COLUMN IF NOT EXISTS saldo_cobranca NUMERIC(15,2);

-- 1 linha por título do retorno (par de segmentos T + U), com todos os campos e as linhas cruas.
-- A varredura dos últimos dias repete arquivos: o UNIQUE + upsert evita duplicar.
CREATE TABLE IF NOT EXISTS cobranca_titulos (
    id                   SERIAL PRIMARY KEY,
    empresa_id           INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    integracao_id        INTEGER REFERENCES integracoes_vanpix(id) ON DELETE SET NULL,
    apelido              VARCHAR(50) NOT NULL,
    beneficiario_codigo  VARCHAR(10),
    arquivo_nsa          VARCHAR(10),
    arquivo_gerado_em    TIMESTAMP,
    cod_movimento        VARCHAR(2) NOT NULL,
    nosso_numero         VARCHAR(20) NOT NULL,
    nosso_numero_dv      VARCHAR(1),
    carteira             VARCHAR(1),
    numero_documento     VARCHAR(15),
    ident_titulo_empresa VARCHAR(25),
    vencimento           DATE,
    valor_titulo         NUMERIC(15,2),
    banco_cobrador       VARCHAR(3),
    agencia_cobradora    VARCHAR(6),
    pagador_tipo         VARCHAR(1),
    pagador_documento    VARCHAR(15),
    pagador_nome         VARCHAR(40),
    valor_tarifa         NUMERIC(15,2),
    canal                VARCHAR(2),
    motivo_ocorrencia    VARCHAR(10),
    juros_multa          NUMERIC(15,2),
    desconto             NUMERIC(15,2),
    abatimento           NUMERIC(15,2),
    iof                  NUMERIC(15,2),
    valor_pago           NUMERIC(15,2),
    valor_creditado      NUMERIC(15,2),
    outras_despesas      NUMERIC(15,2),
    outros_creditos      NUMERIC(15,2),
    data_ocorrencia      DATE NOT NULL,
    data_credito         DATE,
    data_debito_tarifa   DATE,
    pagador_efetivo      VARCHAR(15),
    linha_t              VARCHAR(240) NOT NULL,
    linha_u              VARCHAR(240) NOT NULL,
    buscado_em           TIMESTAMP NOT NULL,
    UNIQUE (apelido, nosso_numero, cod_movimento, data_ocorrencia)
);
CREATE INDEX IF NOT EXISTS idx_cobranca_titulos_credito ON cobranca_titulos (apelido, data_credito);
