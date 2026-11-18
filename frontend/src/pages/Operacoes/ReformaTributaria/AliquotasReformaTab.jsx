import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Percent } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import { getConfigReforma, restaurarConfigReforma, salvarConfigReforma } from '../../../api/reformaTributaria.api';
import { aliquota, lerNumero, paraCampo } from './formatos';

const corCampo = (preenchido) => (preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400');

function SectionHeader({ titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

function Campo({ rotulo, valor, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo(valor !== '')}`}
      />
    </div>
  );
}

// Aba Alíquotas: os parâmetros da reforma desta empresa — um Card por parâmetro e um Salvar só no fim
// (mesmo padrão das Configurações de Cronogramas Obras). Sem nada salvo, vale o padrão do sistema.
export default function AliquotasReformaTab({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [anos, setAnos] = useState([]);
  const [aliquotas, setAliquotas] = useState({});
  const [reducao, setReducao] = useState('');
  const [redutorResidencial, setRedutorResidencial] = useState('');
  const [redutorLote, setRedutorLote] = useState('');
  const [retIbsCbs, setRetIbsCbs] = useState('');
  const [retIrpj, setRetIrpj] = useState('');
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aplicar(c) {
    const lista = [...new Set([...Object.keys(c.padroes.aliquotas), ...Object.keys(c.aliquotas)])].sort();
    setAnos(lista);
    setAliquotas(
      Object.fromEntries(lista.map((a) => [a, { cbs: paraCampo(c.aliquotas[a]?.cbs, 4), ibs: paraCampo(c.aliquotas[a]?.ibs, 4) }]))
    );
    setReducao(paraCampo(c.reducao_imoveis, 4));
    setRedutorResidencial(paraCampo(c.redutor_residencial));
    setRedutorLote(paraCampo(c.redutor_lote));
    setRetIbsCbs(paraCampo(c.ret_ibs_cbs, 4));
    setRetIrpj(paraCampo(c.ret_irpj_csll, 4));
    setInfo({ padrao: c.padrao, atualizado_em: c.atualizado_em, usuario: c.usuario });
  }

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    setSalvo(false);
    getConfigReforma(empresaId)
      .then(aplicar)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar as alíquotas.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alterado = (setter) => (v) => {
    setter(v);
    setSalvo(false);
  };
  const mudarAno = (ano, campo, v) => {
    setAliquotas((x) => ({ ...x, [ano]: { ...x[ano], [campo]: v } }));
    setSalvo(false);
  };

  async function salvar() {
    setErro('');
    setSalvo(false);
    const dados = {
      aliquotas: Object.fromEntries(
        anos
          .filter((a) => aliquotas[a]?.cbs !== '' || aliquotas[a]?.ibs !== '')
          .map((a) => [a, { cbs: lerNumero(aliquotas[a].cbs) ?? 0, ibs: lerNumero(aliquotas[a].ibs) ?? 0 }])
      ),
      reducao_imoveis: lerNumero(reducao),
      redutor_residencial: lerNumero(redutorResidencial),
      redutor_lote: lerNumero(redutorLote),
      ret_ibs_cbs: lerNumero(retIbsCbs),
      ret_irpj_csll: lerNumero(retIrpj),
    };
    if ([dados.reducao_imoveis, dados.redutor_residencial, dados.redutor_lote, dados.ret_ibs_cbs, dados.ret_irpj_csll].some((v) => v === null)) {
      setErro('Preencha todos os campos (use 0 quando não houver).');
      return;
    }
    setSalvando(true);
    try {
      aplicar(await salvarConfigReforma(empresaId, dados));
      setSalvo(true);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    setErro('');
    setSalvando(true);
    try {
      aplicar(await restaurarConfigReforma(empresaId));
      setSalvo(true);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível restaurar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <Percent size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver e ajustar as alíquotas da reforma.</p>
      </Card>
    );
  }

  const somaRet = (lerNumero(retIbsCbs) ?? 0) + (lerNumero(retIrpj) ?? 0);

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          titulo="Alíquotas da CBS e do IBS por ano"
          texto="A alíquota cobrada em cada ano, antes da redução dos imóveis. Padrão: CBS de referência de 11,3% (cálculo do TCU de 28/10/2026; o Senado fixa até 15/12/2026), menos 0,1 ponto em 2027 e 2028; IBS de 0,1% em 2027 e 2028 e, de 2029 a 2032, 10%, 20%, 30% e 40% da referência estimada de 18,7%, até a cheia em 2033. Ano depois do último usa o último."
        />
        {carregando ? (
          <div className="mt-4 text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4 text-left">Ano</th>
                  {anos.map((a) => (
                    <th key={a} className="w-28 px-1.5 pb-2 text-center">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['cbs', 'CBS (%)'],
                  ['ibs', 'IBS (%)'],
                ].map(([campo, rotulo]) => (
                  <tr key={campo}>
                    <td className="py-1.5 pr-4 font-medium text-gray-700">{rotulo}</td>
                    {anos.map((a) => (
                      <td key={a} className="px-1.5 py-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={aliquotas[a]?.[campo] ?? ''}
                          onChange={(e) => mudarAno(a, campo, e.target.value)}
                          className={`w-full rounded-lg border px-2 py-2 text-center text-sm tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 ${corCampo((aliquotas[a]?.[campo] ?? '') !== '')}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="pt-2 pr-4 text-xs text-gray-500">Total</td>
                  {anos.map((a) => (
                    <td key={a} className="px-1.5 pt-2 text-center text-xs font-semibold tabular-nums text-gray-700">
                      {aliquota((lerNumero(aliquotas[a]?.cbs) ?? 0) + (lerNumero(aliquotas[a]?.ibs) ?? 0))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="Venda de imóveis no regime regular"
          texto="A redução das alíquotas na venda de imóveis (LC 214/2025) e o redutor social, que abate a base de cada unidade residencial nova e de cada lote residencial vendido. Valem para as obras no regime regular."
        />
        {!carregando && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Redução das alíquotas (%)" valor={reducao} onChange={alterado(setReducao)} />
            <Campo rotulo="Redutor social por unidade residencial (R$)" valor={redutorResidencial} onChange={alterado(setRedutorResidencial)} />
            <Campo rotulo="Redutor social por lote residencial (R$)" valor={redutorLote} onChange={alterado(setRedutorLote)} />
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader
          titulo="RET de transição"
          texto="Incorporação com patrimônio de afetação e opção pelo RET feita até 31/12/2028 (art. 485 da LC 214/2025): continua com uma alíquota única sobre a receita, agora dividida entre IBS/CBS e IRPJ/CSLL. Padrão: 2,08% + 1,92% = os mesmos 4% de hoje."
        />
        {!carregando && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="IBS / CBS (% da receita)" valor={retIbsCbs} onChange={alterado(setRetIbsCbs)} />
            <Campo rotulo="IRPJ / CSLL (% da receita)" valor={retIrpj} onChange={alterado(setRetIrpj)} />
            <div className="flex items-end pb-2 text-sm text-gray-600">
              Total: <b className="ml-1 tabular-nums text-gray-900">{aliquota(somaRet)}</b>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={salvar} loading={salvando} disabled={carregando}>
            Salvar configurações
          </Button>
          <Button type="button" variant="secondary" onClick={restaurar} disabled={carregando || salvando || info?.padrao}>
            Restaurar padrão
          </Button>
          {salvo ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Configurações salvas
            </span>
          ) : (
            info && (
              <span className="text-xs text-gray-500">
                {info.padrao
                  ? 'Usando o padrão do sistema.'
                  : `Salvo em ${new Date(info.atualizado_em).toLocaleDateString('pt-BR')}${info.usuario ? ` por ${info.usuario}` : ''}.`}
              </span>
            )
          )}
          {erro && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle size={15} className="shrink-0" /> {erro}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
