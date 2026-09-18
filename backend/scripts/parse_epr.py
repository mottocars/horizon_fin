"""
Le um unico PDF de "EXTRATO DE UNIDADES DE EMPREENDIMENTO" (CAIXA) e imprime
em stdout um JSON com o cabecalho do empreendimento e a lista de mutuarios.

Uso: python parse_epr.py <caminho_do_pdf>

Logica de parsing (regex e extracao de texto) portada diretamente do script
gerar_epr.py fornecido, que ja processa esses PDFs corretamente em lote e
gera uma planilha consolidada. Este script troca a saida em XLSX por JSON
para que o backend Node grave os dados no banco.
"""

import json
import re
import sys
from datetime import datetime

import pdfplumber

RE_LINHA_MUTUARIO = re.compile(
    r"^(?P<contrato>\d{12})\s+"
    r"(?P<nome>.+?)\s+"
    r"(?P<uno>\d{4,5})\s+"
    r"(?P<orr>\d{3})\s+"
    r"(?P<to>\d)\s+"
    r"(?P<cod>\d{3})\s+"
    r"(?P<dt_assin>\d{2}/\d{2}/\d{2})\s*"
    r"(?P<tipo_und>[A-Z0-9]{0,2})\s+"
    r"(?P<gar_aut>\d+)\s+"
    r"(?P<dt_inc_ctr>\d{2}/\d{2}/\d{2})\s+"
    # DT.INC.REG (data de inclusão do REGISTRO do contrato, distinta da
    # DT.INC.CTR) vem em branco quando o registro em cartório ainda não foi
    # concluído — nesses casos o VR RETIDO normalmente traz um valor > 0
    # (a retenção da CAIXA continua até o registro sair). Por isso é
    # opcional aqui: sem essa data, a linha inteira deixava de casar com o
    # regex e era descartada silenciosamente (`if not m: continue` em
    # parse_mutuarios), sumindo do banco mesmo com dado de retenção válido.
    r"(?:(?P<dt_inc_reg>\d{2}/\d{2}/\d{2})\s+)?"
    r"(?P<vr_retido>[\d.,]+)\s+"
    r"(?P<vr_amortiz>[\d.,]+)\s+"
    r"(?P<amo>SIM|NAO)\s*$"
)


def _parse_data_br(dt_str):
    """'DD/MM/YY' -> 'YYYY-MM-DD'. Datas '00/00/00' ou '99/99/99' viram None."""
    if not dt_str or dt_str in ("00/00/00", "99/99/99"):
        return None
    try:
        return datetime.strptime(dt_str, "%d/%m/%y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _parse_valor_br(valor_str):
    """'24.612,97' -> 24612.97"""
    if not valor_str:
        return 0.0
    return float(valor_str.replace(".", "").replace(",", "."))


def _extrair_texto_pdf(caminho_pdf):
    paginas = []
    with pdfplumber.open(caminho_pdf) as pdf:
        for pagina in pdf.pages:
            paginas.append(pagina.extract_text(layout=True) or "")
    return "\n".join(paginas)


def parse_cabecalho(texto):
    h = {}
    m = re.search(r"NR\.CONTRATO:\s*(\d+)", texto)
    h["contrato_mestre_obra"] = m.group(1) if m else None
    m = re.search(r"\bUNO:\s*(\d+)", texto)
    h["uno"] = m.group(1) if m else None
    m = re.search(r"NOME EMPR\.:\s*(.+?)\s{2,}", texto)
    h["nome_empreendimento"] = m.group(1).strip() if m else None
    m = re.search(r"UN\.FIN:\s*(\d+)", texto)
    h["unidade_financeira"] = m.group(1) if m else None
    m = re.search(r"INIC\.OBRA:\s*(\d{2}/\d{2}/\d{2})", texto)
    h["data_inicio_obra"] = _parse_data_br(m.group(1)) if m else None
    m = re.search(r"FIM OBRA:\s*(\d{2}/\d{2}/\d{2})", texto)
    h["data_fim_obra"] = _parse_data_br(m.group(1)) if m else None
    m = re.search(r"(\d{2}/\d{2}/\d{2})\s+\d{1,2}:\d{2}", texto)
    h["data_emissao_extrato"] = _parse_data_br(m.group(1)) if m else None
    for cod in ["SGC", "SRE", "SGP", "SGT"]:
        m = re.search(rf"SEG\.\s*{cod}\.?:\s*(\S+)\s+VIG:\s*(\d{{2}}/\d{{2}}/\d{{2}})", texto)
        h[f"seguro_{cod.lower()}_numero"] = m.group(1) if m else None
        h[f"seguro_{cod.lower()}_vigencia"] = _parse_data_br(m.group(2)) if m else None
    return h


def parse_mutuarios(texto):
    registros = []
    for linha in texto.split("\n"):
        linha = linha.strip()
        if not re.match(r"^\d{12}\s", linha):
            continue
        m = RE_LINHA_MUTUARIO.match(linha)
        if not m:
            continue
        g = m.groupdict()
        registros.append({
            "contrato_mutuario": g["contrato"],
            "nome_mutuario": g["nome"].strip(),
            "uno": g["uno"],
            "orr": g["orr"],
            "to_codigo": g["to"],
            "cod": g["cod"],
            "data_assinatura": _parse_data_br(g["dt_assin"]),
            "tipo_unidade": g["tipo_und"] or None,
            "garantia_automatica": g["gar_aut"],
            "data_inclusao_contrato": _parse_data_br(g["dt_inc_ctr"]),
            "data_inclusao_registro": _parse_data_br(g["dt_inc_reg"]),
            "valor_retido": _parse_valor_br(g["vr_retido"]),
            "valor_amortizado": _parse_valor_br(g["vr_amortiz"]),
            "amortizado": g["amo"] == "SIM",
        })
    return registros


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"erro": "Uso: python parse_epr.py <caminho_do_pdf>"}))
        sys.exit(1)

    caminho_pdf = sys.argv[1]
    texto = _extrair_texto_pdf(caminho_pdf)

    empreendimento = parse_cabecalho(texto)
    mutuarios = parse_mutuarios(texto)

    if not empreendimento.get("contrato_mestre_obra"):
        print(json.dumps({"erro": "Não foi possível identificar o NR.CONTRATO no PDF."}))
        sys.exit(1)

    empreendimento["quantidade_mutuarios"] = len(mutuarios)

    print(json.dumps({"empreendimento": empreendimento, "mutuarios": mutuarios}, ensure_ascii=False))


if __name__ == "__main__":
    main()
