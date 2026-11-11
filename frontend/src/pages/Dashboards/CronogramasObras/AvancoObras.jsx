import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CabecalhoDashboard from '../CabecalhoDashboard';
import DfcAvancosTab from '../../Operacoes/DfcConstrutoras/DfcAvancosTab';
import CampoDataPeriodo from '../../Operacoes/CronogramasObras/CampoDataPeriodo';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Obra 360º > Avanço das Obras (pedido do usuário): o espelho, só de leitura, da aba
// Operações › DFC Construtoras › Avanços Obras — a mesma tabela (DfcAvancosTab, variante dashboard) e
// os mesmos dados (/dfc-avancos, liberado em GET para quem tem o Obra 360º). Barra de controles no
// layout da Carteira de obras: Empresa (na URL, ?empresa_id=, a mesma das outras telas do dashboard)
// e Início/Fim (padrão: o ano atual inteiro, como na aba).
export default function AvancoObras({ nome }) {
  const [params, setParams] = useSearchParams();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const anoAtual = new Date().getFullYear();
  const [inicio, setInicio] = useState(`${anoAtual}-01-01`);
  const [fim, setFim] = useState(`${anoAtual}-12-31`);

  function trocarEmpresa(id) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        if (id) novo.set('empresa_id', String(id));
        else novo.delete('empresa_id');
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
          <div className="ctl">
            <label htmlFor="f-inicio">Início</label>
            <CampoDataPeriodo id="f-inicio" value={inicio} onChange={setInicio} disabled={!empresaId} />
          </div>
          <div className="ctl">
            <label htmlFor="f-fim">Fim</label>
            <CampoDataPeriodo id="f-fim" value={fim} onChange={setFim} disabled={!empresaId} />
          </div>
        </section>

        <DfcAvancosTab empresaId={empresaId} inicio={inicio} fim={fim} variante="dashboard" />
      </div>
    </div>
  );
}
