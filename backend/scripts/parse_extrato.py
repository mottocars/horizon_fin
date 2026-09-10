import json
import sys

import xlrd


def parse_data(wb, valor, tipo_celula):
    if tipo_celula != 3 or valor in ('', None):
        return None
    dt = xlrd.xldate_as_datetime(valor, wb.datemode)
    return dt.date().isoformat()


def parse_texto(valor):
    if isinstance(valor, float):
        if valor == int(valor):
            return str(int(valor))
        return str(valor)
    texto = str(valor).strip()
    return texto or None


def parse_numero(valor):
    if valor in ('', None):
        return None
    return float(valor)


def extrair_unidades(wb):
    sh = wb.sheet_by_name('UNIDADES')
    unidades = []
    for r in range(2, sh.nrows):
        unidades.append({
            'contrato_empreendimento': parse_texto(sh.cell_value(r, 2)),
            'nome_empreendimento': parse_texto(sh.cell_value(r, 1)) or '',
            'entidade_organizadora': parse_texto(sh.cell_value(r, 3)) or '',
            'cnpj_entidade_organizadora': parse_texto(sh.cell_value(r, 4)) or '',
            'identificacao_empreendimento': parse_texto(sh.cell_value(r, 5)) or '',
            'apf': parse_texto(sh.cell_value(r, 6)) or '',
            'unidade_federacao': parse_texto(sh.cell_value(r, 7)) or '',
            'municipio': parse_texto(sh.cell_value(r, 8)) or '',
            'tipo_unidade': parse_texto(sh.cell_value(r, 9)),
            'numero_contrato_unidade': parse_texto(sh.cell_value(r, 10)),
            'nome_mutuario': parse_texto(sh.cell_value(r, 11)),
            'cpf_cnpj_mutuario': parse_texto(sh.cell_value(r, 12)),
            'data_assinatura_contrato': parse_data(wb, sh.cell_value(r, 13), sh.cell_type(r, 13)),
            'data_inclusao_dados_registro_cri': parse_data(wb, sh.cell_value(r, 14), sh.cell_type(r, 14)),
            'valor_financiamento': parse_numero(sh.cell_value(r, 15)),
            'valor_financiamento_terreno': parse_numero(sh.cell_value(r, 16)),
            'valor_desconto_subsidio_complementar': parse_numero(sh.cell_value(r, 17)),
            'valor_fgts': parse_numero(sh.cell_value(r, 18)),
            'valor_recursos_proprios': parse_numero(sh.cell_value(r, 19)),
            'valor_compra_venda': parse_numero(sh.cell_value(r, 20)),
            'valor_avaliacao_imovel': parse_numero(sh.cell_value(r, 21)),
            'fracao_ideal': parse_numero(sh.cell_value(r, 22)),
            'data_inicio_atraso_obra': parse_data(wb, sh.cell_value(r, 23), sh.cell_type(r, 23)),
            'unidade_desligada': parse_texto(sh.cell_value(r, 24)),
        })
    return unidades


def extrair_eventos(wb, nome_aba):
    sh = wb.sheet_by_name(nome_aba)
    eventos = []
    for r in range(2, sh.nrows):
        eventos.append({
            'contrato_empreendimento': parse_texto(sh.cell_value(r, 0)),
            'data_evento': parse_data(wb, sh.cell_value(r, 1), sh.cell_type(r, 1)),
            'origem': parse_texto(sh.cell_value(r, 2)),
            'evento': parse_texto(sh.cell_value(r, 3)),
            'parcela': parse_texto(sh.cell_value(r, 4)),
            'valor': parse_numero(sh.cell_value(r, 5)),
        })
    return eventos


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'erro': 'Caminho do arquivo não informado.'}))
        sys.exit(1)

    caminho = sys.argv[1]
    try:
        wb = xlrd.open_workbook(caminho)
    except Exception as exc:
        print(json.dumps({'erro': f'Não foi possível ler o arquivo: {exc}'}))
        sys.exit(1)

    unidades = extrair_unidades(wb)
    if not unidades:
        print(json.dumps({'erro': 'Nenhuma unidade encontrada na aba UNIDADES.'}))
        sys.exit(1)

    cronograma = extrair_eventos(wb, 'CRONOGRAMA') if 'CRONOGRAMA' in wb.sheet_names() else []
    proximos_eventos = extrair_eventos(wb, 'PROXIMOS-EVENTOS') if 'PROXIMOS-EVENTOS' in wb.sheet_names() else []

    print(json.dumps({
        'unidades': unidades,
        'cronograma': cronograma,
        'proximos_eventos': proximos_eventos,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
