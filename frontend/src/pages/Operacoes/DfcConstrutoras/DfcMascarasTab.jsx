import { forwardRef, useEffect, useMemo, useState } from 'react';
import MascarasArvoreEditor from '../../../components/MascarasArvoreEditor';
import SearchableSelect from '../../../components/SearchableSelect';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { codigoFormatado } from './codigoConta';
import TiposParcelaModal from './TiposParcelaModal';
import {
  createDfcMascaras,
  listDfcMascaras,
  listTiposParcelaDfc,
  removeDfcMascara,
  reordenarDfcMascaras,
  updateDfcMascara,
} from '../../../api/dfcMascaras.api';

// Estrutura de exemplo passada pelo usuário — oferecida só quando a empresa ainda não tem
// nenhuma máscara (botão "Usar modelo sugerido"); depois disso é tudo editável normalmente.
const MODELO_SUGERIDO = [
  {
    descricao: 'FLUXO DE CAIXA OPERACIONAL',
    filhos: [
      'RECEITA DE VENDAS',
      'OUTRAS RECEITAS OPERACIONAIS',
      'CUSTO DO TERRENO',
      'CUSTO DE CONSTRUCAO (OBRA)',
      'INCORPORACAO E LEGALIZACAO',
      'DESPESAS COMERCIAIS E MARKETING',
      'DESPESAS COM PESSOAL',
      'DESPESAS ADMINISTRATIVAS',
      'IMPOSTOS E TRIBUTOS',
      'DISTRATOS, ENCARGOS E AJUSTES OPERACIONAIS',
      'CAPTACAO DE FINANCIAMENTOS',
      'SERVICO DA DIVIDA (AMORTIZACAO E JUROS)',
      'ENCARGOS E TARIFAS FINANCEIRAS',
    ],
  },
  {
    descricao: 'FLUXO DE CAIXA DOS INVESTIMENTOS',
    filhos: ['APLICACOES E RESGATES FINANCEIROS', 'RENDIMENTOS DE APLICACOES', 'INVESTIMENTO PRODUTOS'],
  },
  {
    descricao: 'RETIRADAS / INTEGRALIZAÇÕES E ACERTOS',
    filhos: [
      'TRANSFERENCIAS E MOVIMENTACOES BANCARIAS',
      'APORTES E INTEGRALIZACOES DE CAPITAL',
      'REMUNERACAO E DISTRIBUICAO AOS SOCIOS',
      'MOVIMENTACAO E DEVOLUCAO DE CAPITAL',
      'OUTRAS RECEITAS',
    ],
  },
];

const API = {
  listar: listDfcMascaras,
  criar: createDfcMascaras,
  atualizar: updateDfcMascara,
  remover: removeDfcMascara,
  reordenar: reordenarDfcMascaras,
};

// Tipo de detalhamento de cada máscara de nível 2. PLANO_CONTAS = como sempre (as contas do Plano
// Contas com essa Máscara DFC compõem a linha). TIPO_PARCELA = a máscara assume uma conta do plano de
// contas (que fica travada na aba Plano Contas) e é composta pelas origens escolhidas (uma ou mais).
const TIPOS_DETALHAMENTO = [
  { value: 'PLANO_CONTAS', label: 'Plano de contas' },
  { value: 'TIPO_PARCELA', label: 'Tipo de parcela' },
];
const ORIGENS_PARCELA = [
  { value: 'CEF_NOVO_REGISTRO', label: 'CEF - NOVO REGISTRO' },
  { value: 'CEF_MEDICAO', label: 'CEF - MEDIÇÃO' },
  { value: 'SIENGE_AGING', label: 'SIENGE - AGING' },
];

// Mesmo par de cores das outras abas da DFC: vazio em âmbar, preenchido em azul claro.
const cor = (preenchido) => (preenchido ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50');

const porParcela = (item) => item.tipo_detalhamento === 'TIPO_PARCELA';
const Traco = () => <span className="text-xs text-gray-300">—</span>;

// Operações > DFC Construtoras > Máscaras: estrutura da DFC da empresa em 2 níveis. A tela em si
// é o MascarasArvoreEditor (o mesmo da DRE Gerencial); aqui entram a API, o modelo da DFC e, no nível 2,
// as colunas Detalhamento / Conta / Origens (as duas últimas só no "Tipo de parcela").
const DfcMascarasTab = forwardRef(function DfcMascarasTab({ empresaId }, ref) {
  const [contas, setContas] = useState([]);
  const [arvore, setArvore] = useState([]);

  useEffect(() => {
    setContas([]);
    if (!empresaId) return;
    listContas(empresaId, { page: 1, limit: 2000, search: '' })
      .then((r) => setContas(r.data))
      .catch(() => setContas([]));
  }, [empresaId]);

  // Contas analíticas, na ordem do código.
  const analiticas = useMemo(
    () =>
      contas
        .filter((c) => c.tp_conta !== 'T')
        .sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)))
        .map((c) => ({ value: c.sienge_id, label: `${codigoFormatado(c)} ${c.name}` })),
    [contas]
  );

  // Tipos de parcela da empresa (botão "TIPO PARCELAS") e a máscara com a janela aberta
  // ({ item, definir } — `definir` grava parcela_tipos daquela máscara).
  const [tiposParcela, setTiposParcela] = useState([]);
  const [janelaTipos, setJanelaTipos] = useState(null);

  useEffect(() => {
    setTiposParcela([]);
    setJanelaTipos(null);
    if (!empresaId) return;
    listTiposParcelaDfc(empresaId)
      .then(setTiposParcela)
      .catch(() => setTiposParcela([]));
  }, [empresaId]);

  // Tipos que já estão em outra máscara com a mesma conta: { sigla: nome da máscara } — travados na janela
  // (na mesma conta, cada tipo de parcela fica em uma máscara só).
  const ocupadosNaConta = (item) => {
    if (!item?.parcela_conta_sienge_id) return {};
    const outras = arvore
      .flatMap((g) => g.filhos)
      .filter((f) => f.id !== item.id && f.parcela_conta_sienge_id === item.parcela_conta_sienge_id);
    return Object.fromEntries(outras.flatMap((f) => (f.parcela_tipos || []).map((s) => [s, f.descricao])));
  };

  const flags = useMemo(() => {
    return [
      {
        campo: 'tipo_detalhamento',
        label: 'Detalhamento',
        title: 'Como a máscara é detalhada: pelas contas do plano de contas ou por tipo de parcela',
        nivel: 2,
        largura: 'w-36',
        esquerda: true,
        // Voltar para "Plano de contas" limpa conta, origens e tipos (o backend faz o mesmo).
        junto: (valor) =>
          valor === 'TIPO_PARCELA' ? {} : { parcela_conta_sienge_id: null, parcela_origens: [], parcela_tipos: [] },
        substituir: (item, definir) => (
          <div className="w-full">
            <SearchableSelect
              value={item.tipo_detalhamento || 'PLANO_CONTAS'}
              onChange={(v) => v && v !== (item.tipo_detalhamento || 'PLANO_CONTAS') && definir(v)}
              options={TIPOS_DETALHAMENTO}
              clearable={false}
              compacto
              corClasses={cor(true)}
            />
          </div>
        ),
      },
      {
        campo: 'parcela_conta_sienge_id',
        label: 'Conta',
        title:
          'Conta do plano de contas que a máscara assume (fica travada na aba Plano Contas). A mesma conta pode estar em várias máscaras, diferenciadas pelos tipos de parcela',
        nivel: 2,
        largura: 'w-64',
        esquerda: true,
        substituir: (item, definir) => {
          if (!porParcela(item)) return <Traco />;
          return (
            <div className="w-full">
              <SearchableSelect
                value={item.parcela_conta_sienge_id ?? ''}
                onChange={(v) => definir(v ? Number(v) : null)}
                options={analiticas}
                placeholder="Selecione a conta"
                emptyMessage="Nenhuma conta analítica disponível."
                compacto
                corClasses={cor(item.parcela_conta_sienge_id)}
                larguraPainel={420}
              />
            </div>
          );
        },
      },
      {
        campo: 'parcela_origens',
        label: 'Tipo Projeção',
        title: 'Origens que compõem a máscara (uma ou mais)',
        nivel: 2,
        largura: 'w-48',
        esquerda: true,
        substituir: (item, definir) => {
          if (!porParcela(item)) return <Traco />;
          const valores = item.parcela_origens || [];
          return (
            <div className="w-full">
              <SearchableSelect
                multiple
                value={valores}
                onChange={(v) => definir(v)}
                options={ORIGENS_PARCELA}
                placeholder="Selecione as origens"
                compacto
                corClasses={cor(valores.length)}
                larguraPainel={240}
              />
            </div>
          );
        },
      },
      {
        // Botão "TIPO PARCELAS": abre a janela dos tipos de parcela da máscara (com a quantidade escolhida).
        campo: 'parcela_tipos',
        label: '',
        title: 'Tipos de parcela do Sienge que compõem a máscara',
        nivel: 2,
        largura: 'w-36',
        substituir: (item, definir) => {
          if (!porParcela(item)) return <Traco />;
          const qtd = (item.parcela_tipos || []).length;
          return (
            <button
              type="button"
              onClick={() => setJanelaTipos({ item, definir })}
              title={qtd ? `Tipos: ${item.parcela_tipos.join(', ')}` : 'Escolher os tipos de parcela'}
              className={`flex h-6.75 w-full items-center justify-center gap-1.5 rounded-md border px-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                qtd
                  ? 'border-primary-100 bg-primary-50 text-primary-700 hover:bg-primary-100'
                  : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Tipo parcelas
              {qtd > 0 && (
                <span className="rounded-full bg-white px-1.5 text-[10px] tabular-nums text-primary-700 ring-1 ring-primary-100">
                  {qtd}
                </span>
              )}
            </button>
          );
        },
      },
    ];
  }, [analiticas]);

  return (
    <>
      <MascarasArvoreEditor
        ref={ref}
        empresaId={empresaId}
        api={API}
        modeloSugerido={MODELO_SUGERIDO}
        demonstrativo="DFC"
        exemploNivel1="Fluxo de Caixa Operacional"
        flags={flags}
        aoMudarArvore={setArvore}
      />
      <TiposParcelaModal
        open={Boolean(janelaTipos)}
        mascara={janelaTipos?.item}
        tipos={tiposParcela}
        ocupados={ocupadosNaConta(janelaTipos?.item)}
        unico={(janelaTipos?.item?.parcela_origens || []).some((o) => o.startsWith('CEF_'))}
        onClose={() => setJanelaTipos(null)}
        onSalvar={(lista) => {
          janelaTipos.definir(lista);
          setJanelaTipos(null);
        }}
      />
    </>
  );
});

DfcMascarasTab.displayName = 'DfcMascarasTab';

export default DfcMascarasTab;
