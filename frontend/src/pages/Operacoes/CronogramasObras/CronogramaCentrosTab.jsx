import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Milestone, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { corPadrao } from '../../../utils/coresPadrao';
import CentroCustoEditor from '../../CentrosCusto/CentroCustoEditor';

const TIPOS = { OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' };

// Colunas: centro, tipo, o mês/ano de início de cada etapa (as etapas vêm da máscara Etapas do
// Centro de Custo, então a grade é montada na hora), VGV e nº de unidades.
function colunasGrade(qtdEtapas) {
  return `minmax(220px,1fr) 120px${' 124px'.repeat(qtdEtapas)} 140px 80px`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// 'AAAA-MM-DD' -> 'out/2029' (pedido do usuário).
function mesAno(data) {
  if (!data) return null;
  const [ano, mes] = data.split('-');
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

function formatarVgv(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

const Vazio = () => <span className="text-gray-300">—</span>;

// Operações > Cronogramas Obras > Centros de Custos: lista só de leitura (pedido do usuário) de
// todos os centros de custo da empresa (mesma lista e ordem da aba Centros Custos da DFC), com
// Tipo, o mês/ano de início de cada etapa do cronograma (= Histórico de Etapas do centro), VGV e
// nº de unidades. Clicar numa linha abre o cadastro do centro numa janela (CentroCustoEditor — o
// mesmo da página Cadastros > Centros de Custos, com as abas Cadastro e Histórico de Etapas): é o
// atalho pra alterar. Salvou lá, a lista recarrega.
export default function CronogramaCentrosTab({ empresaId, search }) {
  const confirm = useConfirm();
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  // Centro aberto na janela e se há alteração não salva nela (pra confirmar antes de fechar).
  const [aberto, setAberto] = useState(null);
  const [pendente, setPendente] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listCronogramaCentros(empresaId)
      .then((r) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os centros de custo.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setEtapas([]);
    setCentros([]);
    setAberto(null);
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return centros;
    return centros.filter(
      (c) =>
        String(c.sienge_id).includes(termo) ||
        c.name.toLowerCase().includes(termo) ||
        (c.apelido || '').toLowerCase().includes(termo)
    );
  }, [centros, search]);

  async function fechar() {
    if (pendente) {
      const ok = await confirm({
        title: 'Descartar alterações',
        description: 'Há alterações não salvas neste centro de custo. Fechar mesmo assim?',
        confirmLabel: 'Descartar',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setAberto(null);
    setPendente(false);
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Building2 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o cronograma das obras.</p>
      </div>
    );
  }

  const colunas = colunasGrade(etapas.length);

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {!carregando && !erroCarga && etapas.length === 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Milestone size={14} className="shrink-0" />
          Nenhuma etapa cadastrada — cadastre em
          <Link to="/cadastros/mascaras" className="font-semibold underline underline-offset-2 hover:text-amber-800">
            Cadastros › Máscaras › Etapas do Centro de Custo
          </Link>
        </div>
      )}

      {carregando && centros.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        // Rola de lado quando há etapas demais pra caber.
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Cabeçalho azul da DFC; cada etapa com a cor dela. */}
            <div
              className="grid items-center gap-3 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700"
              style={{ gridTemplateColumns: colunas }}
            >
              <span>Centro de custo</span>
              <span>Tipo</span>
              {etapas.map((etapa, i) => (
                <span key={etapa.id} className="flex min-w-0 items-center justify-center gap-1.5" title={etapa.descricao}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: etapa.cor || corPadrao(i) }} />
                  <span className="truncate">{etapa.descricao || 'Sem nome'}</span>
                </span>
              ))}
              <span className="text-right">VGV</span>
              <span className="text-right">Unidades</span>
            </div>

            {/* Cabeçalho sempre visível, mesmo sem nenhum registro (mesmo esquema da DFC). */}
            {filtrados.length === 0 ? (
              <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                {centros.length === 0 ? 'Nenhum centro de custo nesta empresa.' : 'Nenhum centro de custo encontrado para essa busca.'}
              </div>
            ) : (
              filtrados.map((centro) => {
                const obra = centro.natureza === 'OBRA';
                return (
                  <div
                    key={centro.sienge_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setAberto(centro)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setAberto(centro);
                      }
                    }}
                    title="Abrir o cadastro do centro de custo"
                    className="grid cursor-pointer items-center gap-3 border-b border-gray-100 bg-white py-2.5 pl-4 pr-4 text-xs hover:bg-gray-50 focus:bg-primary-50/40 focus:outline-none"
                    style={{ gridTemplateColumns: colunas }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 tabular-nums text-gray-400">{centro.sienge_id}</span>
                      <span className="min-w-0 truncate font-medium text-gray-800" title={centro.name}>
                        {centro.name}
                        {centro.apelido && <span className="font-normal text-gray-400"> · {centro.apelido}</span>}
                      </span>
                      {centro.status !== 'ATIVO' && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Inativo
                        </span>
                      )}
                    </div>
                    <span className={centro.natureza ? 'text-gray-700' : 'text-amber-600'}>
                      {TIPOS[centro.natureza] || 'Não classificado'}
                    </span>
                    {etapas.map((etapa) => (
                      <span key={etapa.id} className="text-center tabular-nums text-gray-700">
                        {obra && centro.datas[etapa.id] ? mesAno(centro.datas[etapa.id]) : <Vazio />}
                      </span>
                    ))}
                    <span className="text-right tabular-nums text-gray-700">{formatarVgv(centro.valor_geral_vendas) || <Vazio />}</span>
                    <span className="text-right tabular-nums text-gray-700">{centro.numero_unidades ?? <Vazio />}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <Modal open={Boolean(aberto)} onClose={fechar} title="Cadastro do Centro de Custo" maxWidthClass="max-w-5xl">
        {aberto && (
          <CentroCustoEditor
            key={aberto.sienge_id}
            empresaId={empresaId}
            siengeId={aberto.sienge_id}
            onSalvo={carregar}
            onAlteracoesPendentes={setPendente}
          />
        )}
      </Modal>
    </div>
  );
}
