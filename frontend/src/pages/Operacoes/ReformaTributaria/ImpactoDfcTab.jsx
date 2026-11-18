import { useEffect, useState } from 'react';
import { Info, Scale, Settings2, TriangleAlert } from 'lucide-react';
import { getImpactoDfcReforma } from '../../../api/reformaTributaria.api';
import { mesAno } from '../CronogramasObras/formatos';
import { moeda } from './formatos';
import { Bloco, Cabecalho, celula, Diferenca, Numero, SeloRegime, TabelaComparativa } from './componentes';

const rotuloPeriodo = (p) => (p.length === 7 ? mesAno(`${p}-01`) : p);
const imposto = (x) => x.ret + x.ibs_cbs + x.irpj_csll;

// Aba Impacto DFC: o fluxo de caixa projetado (última versão do Orçamento do DFC) com o imposto sobre a
// receita recalculado pelo caixa nos dois cenários — hoje (RET sobre os recebimentos de venda) e com a
// reforma (regime de cada obra, alíquotas, contas e pagamento do imposto da aba Configurações DFC).
export default function ImpactoDfcTab({ empresaId, centros, ano, recarregar, onOpcoes, onCarregando, onFiltrarCentro, onIrPara }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const chaveCentros = centros.join(',');

  useEffect(() => {
    if (!empresaId) {
      setDados(null);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    onCarregando?.(true);
    setErro('');
    getImpactoDfcReforma(empresaId, { centros: chaveCentros ? chaveCentros.split(',') : [], ano })
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        onOpcoes?.({ centros: d.centros_opcoes || [], anos: d.anos || [] });
      })
      .catch((e) => vivo && setErro(e.response?.data?.message || 'Não foi possível calcular o impacto no caixa.'))
      .finally(() => {
        if (!vivo) return;
        setCarregando(false);
        onCarregando?.(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, chaveCentros, ano, recarregar]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Scale size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o impacto da reforma tributária no caixa.</p>
      </div>
    );
  }

  if (erro || dados?.erro) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center gap-2 rounded-card rounded-tl-none bg-white px-6 text-center shadow-card">
        <TriangleAlert size={26} className="text-red-400" />
        <p className="max-w-lg text-sm text-gray-600">{erro || dados.erro}</p>
      </div>
    );
  }

  if (!dados) {
    return <div className="rounded-card rounded-tl-none bg-white py-16 text-center text-sm text-gray-400 shadow-card">Calculando o impacto no caixa...</div>;
  }

  const r = dados.resumo;
  const p = dados.parametros;
  const periodo = dados.periodo?.ate ? `De ${mesAno(`${dados.periodo.de}-01`)} a ${mesAno(`${dados.periodo.ate}-01`)}` : 'Sem meses a partir de 2027';
  const comoPaga = [
    p.prazo_recolhimento === 0 ? 'imposto pago no mês' : `imposto pago ${p.prazo_recolhimento} ${p.prazo_recolhimento === 1 ? 'mês' : 'meses'} depois`,
    p.split_inicio ? `split payment desde ${mesAno(`${p.split_inicio}-01`)}` : 'sem split payment',
    p.split_inicio || p.saldo_credor === 'RESSARCIR' ? `crédito ressarcido em ${p.prazo_ressarcimento} ${p.prazo_ressarcimento === 1 ? 'mês' : 'meses'}` : 'crédito compensado',
  ].join(' · ');

  return (
    <div className={`space-y-5 rounded-card rounded-tl-none bg-white p-5 shadow-card ${carregando ? 'opacity-60' : ''}`}>
      {r.configurados === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Settings2 size={14} className="shrink-0" />
          Nenhuma obra configurada ainda: o caixa abaixo é o de hoje. Escolha o regime de cada obra em
          <button type="button" onClick={() => onIrPara('centros-custos')} className="font-semibold underline underline-offset-2 hover:text-amber-800">
            Centros de Custos
          </button>
        </div>
      )}
      {dados.contas.padrao && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <Info size={14} className="shrink-0" />
          As contas do DFC (recebimentos de venda, custos com crédito e RET) são as sugeridas pelo nome. Confira em
          <button type="button" onClick={() => onIrPara('configuracoes-dfc')} className="font-semibold underline underline-offset-2 hover:text-blue-800">
            Configurações DFC
          </button>
        </div>
      )}

      <Bloco
        titulo="Fluxo de caixa"
        subtitulo={`${periodo} · DFC versão ${dados.versao.numero} × com a reforma · ${comoPaga} · ${r.configurados} de ${r.obras} ${
          r.obras === 1 ? 'obra configurada' : 'obras configuradas'
        }`}
        rodape={
          <>
            O imposto sobre a receita é calculado sobre os recebimentos de venda nos dois cenários, para comparar na mesma base
            {Math.abs(r.ret_dfc) > 0.5
              ? `: o DFC de hoje projeta ${moeda(Math.abs(r.ret_dfc))} nas contas do RET no período, que saem da conta e dão lugar ao RET calculado.`
              : '. O DFC de hoje não projeta o RET no período: ele entra aqui calculado, então o saldo de hoje fica abaixo do da aba DFC.'}
          </>
        }
      >
        <TabelaComparativa linhas={dados.dfc} />
      </Bloco>

      {dados.linhas.length > 0 && (
        <Bloco
          titulo={ano ? `Mês a mês de ${ano}` : 'Ano a ano'}
          subtitulo={ano ? 'O imposto entra no mês em que é pago; o crédito, no mês do pagamento ao fornecedor.' : 'Escolha um ano no Período para ver mês a mês. Saldos no fim de cada ano.'}
          larguraMinima="min-w-[1080px]"
        >
          <Cabecalho
            colunas={[
              { rotulo: ano ? 'Mês' : 'Ano' },
              { rotulo: 'Recebimentos' },
              { rotulo: 'Imposto hoje' },
              { rotulo: 'Imposto com a reforma' },
              { rotulo: 'Crédito' },
              { rotulo: 'Ressarcimento' },
              { rotulo: 'Efeito no caixa' },
              { rotulo: 'Saldo hoje' },
              { rotulo: 'Saldo com a reforma' },
            ]}
          />
          <tbody>
            {dados.linhas.map((l) => (
              <tr key={l.periodo} className="group">
                <td className={`${celula('item', { primeira: true })} font-medium`}>{rotuloPeriodo(l.periodo)}</td>
                <td className={celula()}>
                  <Numero v={l.recebimentos} />
                </td>
                <td className={celula()}>
                  <Numero v={l.imposto_hoje} />
                </td>
                <td className={celula()}>
                  <Numero v={imposto(l)} />
                </td>
                <td className={celula()}>
                  <Numero v={l.credito} />
                </td>
                <td className={celula()}>
                  <Numero v={l.ressarcimento} />
                </td>
                <td className={`${celula()} font-semibold`}>
                  <Diferenca d={l.efeito} />
                </td>
                <td className={celula()}>
                  <Numero v={l.saldo_hoje} />
                </td>
                <td className={celula()}>
                  <Numero v={l.saldo_reforma} />
                </td>
              </tr>
            ))}
          </tbody>
        </Bloco>
      )}

      <Bloco
        titulo="Por centro de custo"
        subtitulo="Clique num centro para ver só ele. Efeito no caixa = imposto e crédito com a reforma − o imposto de hoje."
        larguraMinima="min-w-[1080px]"
      >
        <Cabecalho
          colunas={[
            { rotulo: 'Centro de custo' },
            { rotulo: 'Regime', esquerda: true },
            { rotulo: 'Recebimentos' },
            { rotulo: 'Pagamentos com crédito' },
            { rotulo: 'Imposto hoje' },
            { rotulo: 'Imposto com a reforma' },
            { rotulo: 'Ressarcimento' },
            { rotulo: 'Saldo credor no fim' },
            { rotulo: 'Efeito no caixa' },
          ]}
        />
        <tbody>
          {dados.por_centro.length === 0 ? (
            <tr>
              <td colSpan={9} className="border-b border-gray-100 py-8 text-center text-xs text-gray-400">
                Nenhum recebimento de venda nem pagamento com crédito no DFC do período.
              </td>
            </tr>
          ) : (
            dados.por_centro.map((c) => {
              const so = centros.length === 1 && centros[0] === String(c.id);
              return (
                <tr
                  key={c.id}
                  onClick={() => onFiltrarCentro(so ? null : c.id)}
                  title={so ? 'Voltar para todos os centros' : 'Ver só este centro'}
                  className="group cursor-pointer"
                >
                  <td className={celula('item', { primeira: true })}>
                    <span className="mr-2 tabular-nums text-gray-400">{c.id}</span>
                    <span className="font-medium text-gray-800">{c.nome}</span>
                  </td>
                  <td className={celula('item', { alinhar: 'text-left' })}>
                    <SeloRegime centro={c} />
                  </td>
                  <td className={celula()}>
                    <Numero v={c.recebimentos} />
                  </td>
                  <td className={celula()}>
                    <Numero v={c.pagamentos} />
                  </td>
                  <td className={celula()}>
                    <Numero v={c.imposto_hoje} />
                  </td>
                  <td className={celula()}>
                    <Numero v={imposto(c)} />
                  </td>
                  <td className={celula()}>
                    <Numero v={c.ressarcimento} />
                  </td>
                  <td className={celula()}>
                    <Numero v={c.saldo_credor_final} />
                  </td>
                  <td className={`${celula()} font-semibold`}>
                    <Diferenca d={c.efeito} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Bloco>
    </div>
  );
}
