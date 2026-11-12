import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CabecalhoDashboard from '../CabecalhoDashboard';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { DicaProvider } from '../EconomicoFinanceiro/fluxo/graficos';
import { FiltroCentros } from '../EconomicoFinanceiro/fluxo/FluxoCaixaPainel';
import CurvasAvanco from './CurvasAvanco';
import CampoDataPeriodo from '../../Operacoes/CronogramasObras/CampoDataPeriodo';
import { VISOES, visaoValida } from './periodosAvanco';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Obra 360º > Avanço das Obras (pedido do usuário): barra de controles no layout da
// Carteira de obras — só a Empresa (na URL, ?empresa_id=, a mesma das outras telas do dashboard) — e o
// "Avanço por obra" (CurvasAvanco.jsx): uma linha-cartão por obra com a etapa da carteira, o avanço da
// Caixa e dos dois orçamentos do Prevision, e o gráfico mês a mês ao clicar. (A tabela espelho da aba
// DFC › Avanços saiu a pedido do usuário.) Ao lado da empresa, o filtro "Obras" igual ao da Carteira
// (?obra= — os sienge_id marcados, a chave repetida na URL), com as obras que têm Prevision; a Visão
// (?visao= mensal | semanal | diaria — os gráficos por mês, semana terminando no sábado ou dia, e o
// previsto dos cards no fim desse período) e o De/Até dos gráficos (?de= / ?ate=; vazio = a obra
// inteira, cada gráfico no seu recorte).
export default function AvancoObras({ nome }) {
  const [params, setParams] = useSearchParams();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [opcoesObras, setOpcoesObras] = useState([]);
  const textoObras = params.getAll('obra').join('|');
  const obrasMarcadas = useMemo(() => (textoObras ? textoObras.split('|') : []), [textoObras]);

  // Trocar a empresa limpa as obras marcadas (como na Carteira).
  function trocarEmpresa(id) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        if (id) novo.set('empresa_id', String(id));
        else novo.delete('empresa_id');
        novo.delete('obra');
        return novo;
      },
      { replace: true }
    );
  }

  const visao = visaoValida(params.get('visao'));
  const de = params.get('de') || '';
  const ate = params.get('ate') || '';
  function trocarParams(patch) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        Object.entries(patch).forEach(([k, v]) => (v ? novo.set(k, v) : novo.delete(k)));
        return novo;
      },
      { replace: true }
    );
  }
  // De depois do Até: inverte (como o De/Até da Carteira).
  function trocarData(campo, valor) {
    const novo = { de, ate, [campo]: valor };
    if (novo.de && novo.ate && novo.de > novo.ate) trocarParams({ de: novo.ate, ate: novo.de });
    else trocarParams({ [campo]: valor });
  }

  function trocarObras(lista) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.delete('obra');
        lista.forEach((v) => novo.append('obra', String(v)));
        return novo;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  // Usuário preso a uma empresa: ela vem marcada; com uma empresa só, já entra nela.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) trocarEmpresa(empresaIdTravada);
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) trocarEmpresa(empresas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas, empresaId]);

  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      <div className="painel-cfo">
        <CabecalhoDashboard dashboard={nome} titulo="Avanço das Obras" marca={marcaEmpresa} />

        <section className="controls cronograma" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select id="f-empresa" value={empresaId} onChange={(e) => trocarEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
              {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {nomeExibicaoEmpresa(e)}
                </option>
              ))}
            </select>
          </div>
          <FiltroCentros
            id="f-obras"
            rotulo="Obras"
            todos="Todas as obras"
            varios="obras"
            buscar="Buscar obra ou centro"
            vazio="Nenhuma obra encontrada."
            opcoes={opcoesObras}
            valor={obrasMarcadas}
            onChange={trocarObras}
            disabled={!empresaId}
            selecionarTodos
          />
          <div className="ctl">
            <label>Visão</label>
            <div className="seg" role="group" aria-label="Visão">
              {VISOES.map((v) => (
                <button key={v.id} type="button" aria-pressed={visao === v.id} onClick={() => trocarParams({ visao: v.id === 'mensal' ? '' : v.id })}>
                  {v.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="ctl">
            <label htmlFor="f-de">De</label>
            <CampoDataPeriodo id="f-de" value={de} onChange={(v) => trocarData('de', v)} disabled={!empresaId} title="Vazio = desde o início da obra" />
          </div>
          <div className="ctl">
            <label htmlFor="f-ate">Até</label>
            <CampoDataPeriodo id="f-ate" value={ate} onChange={(v) => trocarData('ate', v)} disabled={!empresaId} title="Vazio = até o fim da obra" />
          </div>
          {(de || ate) && (
            <div className="acoes">
              <button type="button" className="btn ghost com-texto" onClick={() => trocarParams({ de: '', ate: '' })} title="Limpar o De/Até: cada gráfico mostra a obra inteira">
                Obra inteira
              </button>
            </div>
          )}
        </section>

        {empresaId ? (
          <DicaProvider>
            <CurvasAvanco empresaId={empresaId} obrasMarcadas={obrasMarcadas} onOpcoesObras={setOpcoesObras} visao={visao} de={de} ate={ate} />
          </DicaProvider>
        ) : (
          <section className="panel c12">
            <div className="empty">Selecione a empresa para ver o avanço das obras.</div>
          </section>
        )}
      </div>
    </div>
  );
}
