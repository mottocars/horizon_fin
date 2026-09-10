"""
Gera o documento fiscal auxiliar oficial (DANFE pra NF-e, DANFSe pra NFS-e)
a partir do XML já armazenado pelo Espião — usa a biblioteca
brazilfiscalreport (https://github.com/Engenere/BrazilFiscalReport), que
segue o layout ABNT oficial em vez de um layout caseiro.

Uso: python gerar_documento_fiscal.py <NFE|NFSE> <xml_entrada> <pdf_saida>

O cabeçalho com a marca "Horizon Finanças" NÃO é gerado aqui — a biblioteca
não expõe um cabeçalho customizável (só um rodapé, e só pra NF-e). Esse PDF
"puro" (documento oficial, sem marca) é devolvido pro Node, que sobrepõe o
cabeçalho por cima usando pdf-lib (mesmo tratamento pros dois tipos).
"""
import sys


def main():
    if len(sys.argv) != 4:
        print("Uso: gerar_documento_fiscal.py <NFE|NFSE> <xml_entrada> <pdf_saida>", file=sys.stderr)
        sys.exit(2)

    tipo, caminho_xml, caminho_pdf = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(caminho_xml, "r", encoding="utf-8") as f:
        xml_content = f.read()

    if tipo == "NFE":
        from brazilfiscalreport.danfe import Danfe
        documento = Danfe(xml=xml_content)
    elif tipo == "NFSE":
        from brazilfiscalreport.danfse import Danfse
        documento = Danfse(xml=xml_content)
    else:
        print(f"Tipo desconhecido: {tipo}", file=sys.stderr)
        sys.exit(2)

    documento.output(caminho_pdf)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — repassa qualquer erro pro Node com mensagem clara
        print(f"Erro ao gerar documento: {exc}", file=sys.stderr)
        sys.exit(1)
