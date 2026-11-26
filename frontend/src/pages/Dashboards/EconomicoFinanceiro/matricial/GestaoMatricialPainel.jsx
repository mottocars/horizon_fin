import { useEffect, useMemo, useState } from 'react';
import { getCentrosGestaoMatricial } from '../../../../api/dashboards.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import CampoPeriodo from '../fluxo/CampoPeriodo';
import { FiltroCentros } from '../fluxo/FluxoCaixaPainel';
import { titulo } from '../fluxo/modelo';
import '../fluxo/painel.css';

// Dashboard Econômico Financeiro › Gestão Matricial (pedido do usuário, 26/11/2026): a mesma barra de filtros
// do Fluxo de Caixa — Empresa, Início, Fim (mês/ano) e Centro de custo (centros com "Projeta DFC", marcação
// múltipla com busca) —, com o período padrão no ano atual inteiro (jan a dez). O conteúdo ainda será definido.

const anoAtual = () => String(new Date().getFullYear());

export default function GestaoMatricialPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const [inicioMes, setInicioMes] = useState(() => `${anoAtual()}-01`);
  const [fimMes, setFimMes] = useState(() => `${anoAtual()}-12`);
  const [marcados, setMarcados] = useState([]); // centros marcados no filtro
  const [listaCentros, setListaCentros] = useState(null); // null = carregando

  // Trocar de empresa limpa os centros e recarrega a lista.
  useEffect(() => {
    setMarcados((c) => (c.length ? [] : c));
    setListaCentros(null);
    if (!empresaId) return undefined;
    let vivo = true;
    getCentrosGestaoMatricial(empresaId)
      .then((r) => vivo && setListaCentros(r))
      .catch(() => vivo && setListaCentros([]));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const opcoesCentros = useMemo(
    () => (listaCentros || []).map((c) => ({ value: c.id, label: titulo(c.nome) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [listaCentros]
  );

  return (
    <div className="painel-cfo">
      <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} marca={marcaEmpresa} />

      <section className="controls" aria-label="Controles do painel">
        <div className="ctl">
          <label htmlFor="f-empresa">Empresa</label>
          <select id="f-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
            {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
            {opcoesEmpresas.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <CampoPeriodo id="f-inicio" rotulo="Início" valor={inicioMes} max={fimMes} onChange={setInicioMes} dica="Primeiro mês do período" />
        <CampoPeriodo id="f-fim" rotulo="Fim" valor={fimMes} min={inicioMes} onChange={setFimMes} dica="Último mês do período" />
        <FiltroCentros opcoes={opcoesCentros} valor={marcados} onChange={setMarcados} disabled={!empresaId || !listaCentros} selecionarTodos />
      </section>

      <div className="panel">
        <div className="empty">{empresaId ? 'Gestão Matricial em construção.' : 'Escolha a empresa na barra acima para montar o painel.'}</div>
      </div>
    </div>
  );
}
