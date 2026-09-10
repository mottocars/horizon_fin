"""
Le um unico PDF de DCD (Demonstrativo de Cronograma de Desembolso / CAIXA) e
imprime em stdout um JSON com o cabecalho do contrato, o cronograma fisico
financeiro e o cronograma de liberacao.

Uso: python parse_dcd.py <caminho_do_pdf>

Logica de parsing (regex e extracao de texto) portada diretamente do script
extrair_cronograma.py fornecido. A saida troca de XLSX para JSON para que o
backend Node grave os dados no banco.
"""

import json
import re
import sys
from datetime import datetime

import pdfplumber

# ---------------------------------------------------------------------------
# Definição de todos os campos do cabeçalho DCD
# (chave_interna, regex, tipo)  -- chave_interna já em snake_case (colunas do banco)
# ---------------------------------------------------------------------------

CAMPOS_CABECALHO = [
    ("emitente", r"Emitente:\s*(\d+)", "text"),
    ("numero_contrato", r"NUMERO DO CONTRATO\s+(\d+)", "text"),
    ("nome_empreendimento", r"NUMERO DO CONTRATO\s+\d+\s+(.+?)\s+ORIGEM DE RECURSO", "text"),
    ("origem_recurso", r"ORIGEM DE RECURSO\s+(\d+)", "text"),
    ("numero_pedido", r"NUMERO DO PEDIDO\s+(\d+)", "text"),
    ("codigo_pedido", r"CODIGO DO PEDIDO\s+(\d+)", "text"),
    ("linha_financiamento", r"LINHA DE FINANCIAMENTO\s+(\d+)", "text"),
    ("numero_empreendimento", r"NUMERO DO EMPREENDIMENTO\s+(\d+)", "text"),
    ("situacao_pedido", r"SITUACAO DO PEDIDO\s+([\w-]+)", "text"),
    ("tipo_financiamento", r"TIPO DE FINANCIAMENTO\s+(\d+)", "text"),
    ("quantidade_parcelas", r"QUANTIDADE DE PARCELAS\s+(\d+)", "int"),
    ("data_termino_suspensiva", r"DATA TERMINO SUSPENSIVA\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("regencia_critica", r"REGENCIA DE CRITICA\s+(\d+)", "text"),
    ("numero_apf", r"NUMERO DO APF\s+(\d+)", "text"),
    ("data_inicio_rotina_atraso_obra", r"DT INICIO ROTINA ATRASO OBRA\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("prazo_obra_atual", r"PRAZO DE OBRA ATUAL\s+(\d+)", "int"),
    ("codigo_seguradora_sgc", r"CODIGO SEGURADORA SGC\s+(\d+)", "text"),
    ("apolice_seguro_sgc", r"APOLICE SEGURO SGC\s+(\d+)", "text"),
    ("prazo_obra_original", r"PRAZO DE OBRA ORIGINAL\s+(\d+)", "int"),
    ("codigo_seguradora_sre", r"CODIGO SEGURADORA SRE\s+(\d+)", "text"),
    ("apolice_seguro_sre", r"APOLICE SEGURO SRE\s+(\d+)", "text"),
    ("percentual_minimo_obra", r"PERCENTUAL MINIMO DE OBRA\s+([\d.,]+)", "num"),
    ("codigo_seguradora_sgp", r"CODIGO SEGURADORA SGP\s+(\d+)", "text"),
    ("apolice_seguro_sgp", r"APOLICE SEGURO SGP\s+(\d+)", "text"),
    ("adiantamento_defasagem_obra", r"ADIANTAMENTO/DEFASAGEM OBRA:\s*([^\n]+)", "text"),
    ("codigo_seguradora_sgt", r"CODIGO SEGURADORA SGT\s+(\d+)", "text"),
    ("apolice_seguro_sgt", r"APOLICE SEGURO SGT\s+(\d+)", "text"),
    ("tipo_rotina", r"TIPO ROTINA\s+(.+?)(?:\s{2,}|$)", "text"),
    ("quantidade_unidades", r"QUANTIDADE DE UNIDADES\s+(\d+)", "int"),
    ("quantidade_unidades_financiadas", r"QUANTIDADE UNID FINANCIADAS\s+(\d+)", "int"),
    ("quantidade_unidades_comercializadas", r"QUANTIDADE UNID COMERCIALIZADAS\s+(\d+)", "int"),
    ("valor_custo_obra", r"VR CUSTO OBRA\s+([\d.,]+)", "num"),
    ("total_financiamento", r"TOTAL DE FINANCIAMENTO\s+([\d.,]+)", "num"),
    ("despesa_legal_terreno_financiamento", r"DESP LEG TERR FINANC\s+([\d.,]+)", "num"),
    ("orcamento_compra_venda", r"ORCAMENTO COMPRA/VENDA\s+([\d.,]+)", "num"),
    ("total_fgts", r"TOTAL DE FGTS\s+([\d.,]+)", "num"),
    ("despesa_legal_terreno_fgts", r"DESP LEG TERR FGTS\s+([\d.,]+)", "num"),
    ("valor_compra_venda_unidade", r"VR COMPRA/VENDA UNIDADE\s+([\d.,]+)", "num"),
    ("total_recurso_proprio_mutuario", r"TOTAL R\.PROPRIO MUTUARIO\s+([\d.,]+)", "num"),
    ("despesa_legal_terreno_recurso_proprio", r"DESP LEG TERR R\.PROPRIO\s+([\d.,]+)", "num"),
    ("valor_compra_venda_terreno", r"VR COMPRA/VENDA TERRENO\s+([\d.,]+)", "num"),
    ("percentual_obra_executada", r"PERC OBRA EXECUTADA\s+([\d.,]+)", "num"),
    ("valor_financiamento_outro_agente", r"VR FINANC OUTRO AGENTE\s+([\d.,]+)", "num"),
    ("saldo_mutuario_pf", r"SALDO MUTUARIO \(PF\)\s+([\d.,]+)", "num"),
    ("data_assinatura", r"DATA DE ASSINATURA\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("valor_terreno_outro_agente", r"VR TERR OUTRO AGENTE\s+([\d.,]+)", "num"),
    ("saldo_aporte_construtora", r"SALDO APORTE CONSTRUTORA\s+([\d.,]+)", "num"),
    ("data_inicio_obra", r"DATA INICIO OBRA\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("valor_aporte_construtora", r"VR APORTE CONSTRUTORA\s+([\d.,]+)", "num"),
    ("saldo_mutuario_pj", r"SALDO MUTUARIO \(PJ\)\s+([\d.,]+)", "num"),
    ("data_termino_obra_original", r"DATA TERMINO OBRA ORIGINAL\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("valor_financiamento_pj", r"VR FINANCIAMENTO \(PJ\)\s+([\d.,]+)", "num"),
    ("saldo_devedor_pj", r"SALDO DEVEDOR \(PJ\)\s+([\d.,]+)", "num"),
    ("data_termino_obra_atual", r"DATA TERMINO OBRA ATUAL\s+(\d{2}/\d{2}/\d{4})", "date"),
    ("garantia_termino_obra", r"GARANTIA TERMINO OBRA\s+([\d.,]+)", "num"),
    ("subsidio_resolucao_460", r"SUBSIDIO RES\. 460\s+([\d.,]+)", "num"),
    ("subsidio_convenios", r"SUBSIDIO CONVENIOS\s+([\d.,]+)", "num"),
    ("custo_terreno", r"CUSTO DO TERRENO\s+([\d.,]+)", "num"),
    ("total_suplementacao_pj", r"TOTAL SUPLEMENTACAO \(PJ\)\s+([\d.,]+)", "num"),
    ("maximo_liberacao_geral_pj", r"MAXIMO LIB\. GERAL \(PJ\)\s+([\d.,]+)", "num"),
    ("reducao_maxima_geral_pj", r"REDUCAO MAX GERAL \(PJ\)\s+([\d.,]+)", "num"),
    ("valor_minimo_garantia_hipotecaria", r"VR MIN GARANTIA HIP\(130%\)\s+([\d.,]+)", "num"),
    ("maximo_liberacao_etapa_pj", r"MAXIMO LIB\. ETAPA \(PJ\)\s+([\d.,]+)", "num"),
    ("reducao_maxima_etapa_pj", r"REDUCAO MAX ETAPA \(PJ\)\s+([\d.,]+)", "num"),
    ("recomposicao_etapa_pj", r"RECOMPOSICAO ETAPA \(PJ\)\s+([\d.,]+)", "num"),
    ("amortizacao_recomposicao_etapa_pj", r"AMORT\. RECOMP\. ETAPA\(PJ\)\s+([\d.,]+)", "num"),
    ("recomposicao_sem_registro_etapa_pj", r"RECOMP\. S/REG ETAPA \(PJ\)\s+([\d.,]+)", "num"),
    ("percentual_antecipacao_pj", r"PERC ANTEC \(PJ\)\s+([\d.,]+)", "num"),
    ("valor_total_antecipacao_pj", r"VR TOTAL ANTEC \(PJ\)\s+([\d.,]+)", "num"),
]

# ---------------------------------------------------------------------------
# Regex — cronograma fisico financeiro
# ---------------------------------------------------------------------------

MARCADOR_INICIO = re.compile(
    r"C\s*R\s*O\s*N\s*O\s*G\s*R\s*A\s*M\s*A\s+"
    r"F\s*I\s*S\s*I\s*C\s*O\s+"
    r"E\s+"
    r"F\s*I\s*N\s*A\s*N\s*C\s*E\s*I\s*R\s*O"
)

MARCADOR_FIM = re.compile(
    r"C\s*R\s*O\s*N\s*O\s*G\s*R\s*A\s*M\s*A\s+"
    r"D\s*E\s+"
    r"L\s*I\s*B\s*E\s*R\s*A\s*C\s*A\s*O"
)

RE_LINHA_DADOS = re.compile(
    r"^(TEX|EX|\d{3})\s+"
    r"(\d{2}/\d{2}/\d{4})\s+"
    r"([\d,]+)\s+([\d,]+)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)"
)

RE_LINHA_TOTAL = re.compile(
    r"T\s*O\s*T\s*A\s*L\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)"
)

RE_IGNORAR = [
    re.compile(r"^PAR\s+DT\s+PARCELA"),
    re.compile(r"^-{3,}"),
    re.compile(r"^Emitente:"),
    re.compile(r"^CRONOGRA\."),
    re.compile(r"^CAIXA\s+ECONOMICA"),
    re.compile(r"^--\s*\d+\s+of\s+\d+\s*--$"),
    re.compile(r"^\s*$"),
]

# ---------------------------------------------------------------------------
# Regex — cronograma de liberação
# ---------------------------------------------------------------------------

MARCADOR_LIBER = re.compile(
    r"C\s*R\s*O\s*N\s*O\s*G\s*R\s*A\s*M\s*A\s+"
    r"D\s*E\s+"
    r"L\s*I\s*B\s*E\s*R\s*A\s*C\s*A\s*O"
)

MARCADOR_FIM_LIBER = re.compile(r"BASE\s+DE\s+CALCULO")

RE_LINHA_LIBER = re.compile(
    r"^(TEX|EX|\d{3})\s+"
    r"(\d{2}/\d{2}/\d{4})\s+"
    r"(LP|PR)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+"
    r"([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)"
)

RE_IGNORAR_LIBER = RE_IGNORAR + [
    re.compile(r"^A\s+LIBERAR\b"),
    re.compile(r"^TOTAL"),
    re.compile(r"^DIF\s+PREVISTO"),
    re.compile(r"^[\d,]+\s+[\d,]+\s+[\d,]+"),
]


def parse_numero_br(valor):
    """'1.234,56' ou '1234,56' -> 1234.56"""
    return float(valor.strip().replace(".", "").replace(",", "."))


def parse_data_br(dt_str):
    """'DD/MM/YYYY' -> 'YYYY-MM-DD'."""
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def extrair_texto_pdf(caminho):
    paginas = []
    with pdfplumber.open(caminho) as pdf:
        for p in pdf.pages:
            txt = p.extract_text()
            if txt:
                paginas.append(txt)
    return "\n".join(paginas)


def extrair_metadados(texto):
    meta = {}
    for chave, padrao, tipo in CAMPOS_CABECALHO:
        m = re.search(padrao, texto)
        if not m:
            continue
        val = m.group(1).strip()
        if not val:
            continue
        if tipo == "int":
            meta[chave] = int(val)
        elif tipo == "num":
            meta[chave] = parse_numero_br(val)
        elif tipo == "date":
            meta[chave] = parse_data_br(val)
        else:
            meta[chave] = val
    return meta


def _deve_ignorar(linha, padroes):
    return any(p.search(linha) for p in padroes)


def extrair_cronograma(texto):
    linhas = texto.split("\n")
    bloco = []
    dentro = False

    for raw in linhas:
        linha = raw.strip()
        if MARCADOR_INICIO.search(linha):
            dentro = True
            continue
        if MARCADOR_FIM.search(linha):
            dentro = False
            continue
        if dentro:
            bloco.append(linha)

    registros = []
    for linha in bloco:
        if _deve_ignorar(linha, RE_IGNORAR):
            continue
        if RE_LINHA_TOTAL.search(linha):
            continue

        m = RE_LINHA_DADOS.match(linha)
        if m:
            registros.append({
                "parcela": m.group(1),
                "data_parcela": parse_data_br(m.group(2)),
                "percentual_etapa": parse_numero_br(m.group(3)),
                "percentual_acumulado": parse_numero_br(m.group(4)),
                "valor_compra_venda": parse_numero_br(m.group(5)),
                "valor_fgts": parse_numero_br(m.group(6)),
                "valor_rp_mutuario": parse_numero_br(m.group(7)),
                "valor_rp_aportado": parse_numero_br(m.group(8)),
                "valor_desconto": parse_numero_br(m.group(9)),
                "valor_financiamento_mutuario": parse_numero_br(m.group(10)),
                "valor_rp_construtora": parse_numero_br(m.group(11)),
                "valor_financiamento_construtora": parse_numero_br(m.group(12)),
            })

    return registros


def extrair_liberacao(texto):
    linhas = texto.split("\n")
    bloco = []
    dentro = False

    for raw in linhas:
        linha = raw.strip()
        if MARCADOR_LIBER.search(linha):
            dentro = True
            continue
        if dentro and MARCADOR_FIM_LIBER.search(linha):
            dentro = False
            continue
        if dentro:
            bloco.append(linha)

    registros = []
    for linha in bloco:
        if _deve_ignorar(linha, RE_IGNORAR_LIBER):
            continue

        m = RE_LINHA_LIBER.match(linha)
        if m:
            registros.append({
                "parcela": m.group(1),
                "data_parcela": parse_data_br(m.group(2)),
                "status": m.group(3),
                "fgts": parse_numero_br(m.group(4)),
                "rp_mutuario": parse_numero_br(m.group(5)),
                "desconto": parse_numero_br(m.group(6)),
                "financiamento_mutuario": parse_numero_br(m.group(7)),
                "aporte_construtora_ci": parse_numero_br(m.group(8)),
                "aporte_terreno": parse_numero_br(m.group(9)),
                "financiamento_construtora": parse_numero_br(m.group(10)),
                "recomposicao_pj": parse_numero_br(m.group(11)),
                "remuneracao": parse_numero_br(m.group(12)),
            })

    return registros


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"erro": "Uso: python parse_dcd.py <caminho_do_pdf>"}))
        sys.exit(1)

    caminho_pdf = sys.argv[1]
    texto = extrair_texto_pdf(caminho_pdf)

    contrato = extrair_metadados(texto)
    cronograma_fisico_financeiro = extrair_cronograma(texto)
    cronograma_liberacao = extrair_liberacao(texto)

    if not contrato.get("numero_contrato"):
        print(json.dumps({"erro": "Não foi possível identificar o NUMERO DO CONTRATO no PDF."}))
        sys.exit(1)

    print(json.dumps({
        "contrato": contrato,
        "cronograma_fisico_financeiro": cronograma_fisico_financeiro,
        "cronograma_liberacao": cronograma_liberacao,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
