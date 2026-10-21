import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Milestone, TriangleAlert } from 'lucide-react';
import { listCronogramaCentros, listPendenciasCronograma } from '../../../api/cronogramaCentros.api';
import { corPadrao } from '../../../utils/coresPadrao';
import JanelaCentroCusto from './JanelaCentroCusto';
import PendenciasCronograma from './PendenciasCronograma';
import { mesAno, moeda } from './formatos';

const TIPOS = { OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' };

// Colunas: centro, tipo, o mês/ano de início de cada etapa (as etapas vêm da máscara Etapas do
// Centro de Custo, então a grade é montada na hora), VGV e nº de unidades.
function colunasGrade(qtdEtapas) {
  return `minmax(220px,1fr) 120px${' 124px'.repeat(qtdEtapas)} 140px 80px`;
}

const Vazio = () => <span className="text-gray-300">—</span>;

// Operações > Cronogramas Obras > Centros de Custos: lista só de leitura (pedido do usuário) de
// todos os centros de custo da empresa (mesma lista e ordem da aba Centros Custos da DFC), com
// Tipo, o mês/ano de início de cada etapa do cronograma (= Histórico de Etapas do centro), VGV e
// nº de unidades. Clicar numa linha abre o cadastro do centro numa janela (JanelaCentroCusto): é o
// atalho pra alterar. Salvou lá, a lista recarrega.
// Versionamento (pedido do usuário): salvar as etapas de uma obra só deixa a alteração pendente. O
// quadro de cima (PendenciasCronograma) lista as pendências e grava a nova versão — que aplica tudo
// no cronograma e manda o comunicado; até lá a grade mostra, em âmbar, a data nova das etapas
// pendentes (a em vigor na dica).
export default function CronogramaCentrosTab({ empresaId, search }) {
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [pendencias, setPendencias] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  // Centro aberto na janela do cadastro.
  const [aberto, setAberto] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    Promise.all([listCronogramaCentros(empresaId), listPendenciasCronograma(empresaId)])
      .then(([r, p]) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
        setPendencias(p);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os centros de custo.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setEtapas([]);
    setCentros([]);
    setPendencias(null);
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
  // sienge_id -> { etapaId: { antes, depois } } — o início pendente de cada etapa alterada
  const pendentes = new Map(
    (pendencias?.alteracoes || []).map((obra) => [
      obra.sienge_id,
      Object.fromEntries(
        obra.etapas.filter((m) => m.inicio_antes !== m.inicio_depois).map((m) => [m.etapa_id, { antes: m.inicio_antes, depois: m.inicio_depois }])
      ),
    ])
  );

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

      {!carregando && !erroCarga && pendencias && <PendenciasCronograma empresaId={empresaId} pendencias={pendencias} onMudou={carregar} />}

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
                const pendente = pendentes.get(centro.sienge_id);
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
                      {pendente && (
                        <span
                          title="Alteração pendente — entra no cronograma quando a nova versão for gravada"
                          className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        >
                          Pendente
                        </span>
                      )}
                      {centro.status !== 'ATIVO' && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Inativo
                        </span>
                      )}
                    </div>
                    <span className={centro.natureza ? 'text-gray-700' : 'text-amber-600'}>
                      {TIPOS[centro.natureza] || 'Não classificado'}
                    </span>
                    {etapas.map((etapa) => {
                      const nova = pendente?.[etapa.id];
                      if (nova) {
                        return (
                          <span
                            key={etapa.id}
                            className="text-center font-semibold tabular-nums text-amber-700"
                            title={`Pendente — em vigor: ${nova.antes ? mesAno(nova.antes) : 'sem data'}`}
                          >
                            {nova.depois ? mesAno(nova.depois) : '—'}
                          </span>
                        );
                      }
                      return (
                        <span key={etapa.id} className="text-center tabular-nums text-gray-700">
                          {obra && centro.datas[etapa.id] ? mesAno(centro.datas[etapa.id]) : <Vazio />}
                        </span>
                      );
                    })}
                    <span className="text-right tabular-nums text-gray-700">{moeda(centro.valor_geral_vendas) || <Vazio />}</span>
                    <span className="text-right tabular-nums text-gray-700">{centro.numero_unidades ?? <Vazio />}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <JanelaCentroCusto empresaId={empresaId} centro={aberto} onFechar={() => setAberto(null)} onSalvo={carregar} />
    </div>
  );
}
