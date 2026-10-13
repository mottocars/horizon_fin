import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import Card from '../../../components/Card';
import { getVersaoParametrosDfc, salvarVersaoParametrosDfc } from '../../../api/dfcParametros.api';
import { diasEntreISO } from '../../../utils/datas';
import { CAMPOS_EDITAVEIS, PARAMETROS_VAZIOS, SESSOES_PARAMETROS, formatarNumero } from './parametrosDfc';
import CampoParametro from './CampoParametro';

// NUMERIC chega do banco como texto ("1234.50") e DATE como 'AAAA-MM-DD' — normaliza pra número
// (os de data ficam como texto mesmo, sem passar por Date — ver utils/datas.js).
function valoresDaVersao(detalhe) {
  return Object.fromEntries(
    CAMPOS_EDITAVEIS.map((c) => {
      const v = detalhe?.[c.id];
      if (v === null || v === undefined || v === '') return [c.id, ''];
      return [c.id, c.tipo === 'data' ? String(v).slice(0, 10) : Number(v)];
    })
  );
}

function SectionHeader({ selo, titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      {selo && <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>}
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

function LinhaResumo({ rotulo, valor, formula }) {
  return (
    <div className="border-t border-gray-100 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-gray-600">{rotulo}</p>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-gray-900">{valor}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-gray-400">{formula}</p>
    </div>
  );
}

// Operações > DFC Construtoras > Parâmetros: os parâmetros fixos da DFC de cada empreendimento,
// no mesmo modelo do Motor de Risco da Gestão de Cobranças (MotorRiscoTab.jsx) — versionado:
// cada "Publicar Versão" grava uma versão nova, nunca sobrescreve. Como lá, o botão mora na barra
// de filtros da página (DfcConstrutorasPage.jsx): esta aba expõe `salvar()` via ref e avisa o
// estado (`podeSalvar`/`salvando`) via `onStatusChange`.
const DfcParametrosTab = forwardRef(function DfcParametrosTab(
  { empresaId, centro, versaoSelecionada, versaoMaisRecenteId, onVersaoCriada, onStatusChange },
  ref
) {
  const siengeId = centro?.sienge_id ?? null;
  const [valores, setValores] = useState(PARAMETROS_VAZIOS);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const versaoNumero = versaoSelecionada?.versao ?? null;

  // Trocar de empresa/empreendimento é um contexto novo — descarta os avisos do anterior.
  useEffect(() => {
    setErro('');
    setSucesso('');
  }, [empresaId, siengeId]);

  // Carrega a versão escolhida no combobox do topo — ou, sem nenhuma versão ainda (primeiro
  // preenchimento), começa em branco, só com o Número Total de Unidades sugerido do cadastro do
  // centro de custo quando ele existe. Não limpa erro/sucesso aqui (mesmo motivo de
  // MotorRiscoTab.jsx: dispara logo depois de publicar, e apagaria a mensagem de sucesso).
  useEffect(() => {
    if (!empresaId || !siengeId) return;
    if (!versaoNumero) {
      setValores({ ...PARAMETROS_VAZIOS, numero_unidades: centro?.numero_unidades ?? '' });
      return;
    }
    setCarregando(true);
    getVersaoParametrosDfc(empresaId, siengeId, versaoNumero)
      .then((detalhe) => setValores(valoresDaVersao(detalhe)))
      .catch(() => setErro('Não foi possível carregar esta versão.'))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, siengeId, versaoNumero]);

  function alterar(id, valor) {
    setValores((prev) => ({ ...prev, [id]: valor }));
  }

  // Pendência, uma por vez, na ordem dos campos na tela (mesma ideia do Motor de Risco).
  const faltando = CAMPOS_EDITAVEIS.find((c) => valores[c.id] === '' || valores[c.id] === null);
  let avisoPendencia = '';
  if (faltando) avisoPendencia = `Preencha "${faltando.label}" antes de publicar.`;
  else if (valores.data_fim_ciclo <= valores.data_inicio_ciclo) {
    avisoPendencia = 'A Data Fim do Ciclo precisa ser depois da Data Início do Ciclo.';
  }

  const podeSalvar = Boolean(empresaId && siengeId) && !carregando && !salvando && !avisoPendencia;

  async function handleSalvar() {
    setErro('');
    setSucesso('');
    setSalvando(true);
    try {
      const criada = await salvarVersaoParametrosDfc(empresaId, siengeId, valores);
      setSucesso(`Versão ${criada.versao} gravada com sucesso — já é a versão vigente deste empreendimento.`);
      onVersaoCriada(criada);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível gravar a versão.');
    } finally {
      setSalvando(false);
    }
  }

  // Hooks sempre antes dos retornos de "sem empresa/sem centro" — senão o pai perde a
  // referência de salvar()/o status assim que o filtro é desmarcado.
  useImperativeHandle(ref, () => ({ salvar: handleSalvar }));
  useEffect(() => {
    onStatusChange?.({ podeSalvar, salvando });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeSalvar, salvando]);

  if (!empresaId || !siengeId) {
    const Icone = empresaId ? Building2 : SlidersHorizontal;
    return (
      <Card className="flex min-h-[280px] flex-col items-center justify-center rounded-tl-none text-center">
        <Icone size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">
          {empresaId ? 'Selecione um centro de custo' : 'Selecione uma empresa'}
        </h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          {empresaId
            ? 'Os parâmetros da DFC são de cada empreendimento. Escolha o centro de custo no filtro acima.'
            : 'Escolha a empresa e o centro de custo no filtro acima para preencher os parâmetros da DFC.'}
        </p>
      </Card>
    );
  }

  const editandoVersaoAntiga = versaoSelecionada && versaoSelecionada.id !== versaoMaisRecenteId;
  const valoresComCalculados = { ...valores };
  SESSOES_PARAMETROS.forEach((s) =>
    s.campos.forEach((c) => {
      if (c.tipo === 'calculado') valoresComCalculados[c.id] = c.calcular(valores);
    })
  );

  // Resumo (lado direito, no lugar do simulador do Motor de Risco): só contas diretas com os
  // próprios parâmetros, cada uma com a fórmula embaixo.
  const n = (id) => (valores[id] === '' ? null : Number(valores[id]));
  const avaliacaoTotal = n('numero_unidades') !== null && n('ticket_medio_avaliacao_pf') !== null
    ? n('numero_unidades') * n('ticket_medio_avaliacao_pf')
    : null;
  const finSobreCto = n('valor_financiamento_pj') !== null && n('cto') ? (n('valor_financiamento_pj') / n('cto')) * 100 : null;
  const diasCiclo = diasEntreISO(valores.data_inicio_ciclo, valores.data_fim_ciclo);
  const mesesParaVender = n('numero_unidades') !== null && n('qtd_vendas_mes') ? n('numero_unidades') / n('qtd_vendas_mes') : null;

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <p className="text-sm font-medium text-gray-800">
          {versaoNumero ? `Editando a partir da versão ${versaoNumero}` : 'Nenhuma versão salva ainda'}
          <span className="font-normal text-gray-400"> · {centro.name}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {editandoVersaoAntiga
            ? 'Você está olhando uma versão antiga. Ajustar e publicar cria uma versão nova — o histórico nunca é sobrescrito.'
            : 'Preencha os parâmetros abaixo e publique quando terminar. Cada publicação cria uma versão nova.'}
        </p>

        {erro && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertTriangle size={15} className="shrink-0" />
            {erro}
          </div>
        )}
        {sucesso && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
            <CheckCircle2 size={15} className="shrink-0" />
            {sucesso}
          </div>
        )}
        {!erro && !sucesso && avisoPendencia && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600">
            <AlertTriangle size={15} className="shrink-0" />
            {avisoPendencia}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="space-y-4">
          {SESSOES_PARAMETROS.map((sessao) => (
            <Card key={sessao.titulo}>
              <SectionHeader selo={sessao.selo} titulo={sessao.titulo} texto={sessao.texto} />
              <div>
                {sessao.campos.map((campo, i) => (
                  <CampoParametro
                    key={campo.id}
                    campo={campo}
                    valor={valoresComCalculados[campo.id]}
                    onChange={alterar}
                    disabled={carregando}
                    primeiro={i === 0}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="xl:sticky xl:top-4">
          <Card>
            <SectionHeader titulo="Resumo" texto="Contas diretas com os parâmetros ao lado, atualizadas enquanto você digita." />
            <div>
              <LinhaResumo
                rotulo="Avaliação total PF"
                valor={avaliacaoTotal === null ? '—' : `R$ ${formatarNumero(avaliacaoTotal, 2)}`}
                formula="Número Total de Unidades × Ticket Médio da Avaliação PF"
              />
              <LinhaResumo
                rotulo="Financiamento PJ sobre o CTO"
                valor={finSobreCto === null ? '—' : `${formatarNumero(finSobreCto, 2)}%`}
                formula="Valor do Financiamento PJ ÷ CTO"
              />
              <LinhaResumo
                rotulo="Duração do ciclo"
                valor={diasCiclo === null || diasCiclo <= 0 ? '—' : `${formatarNumero(diasCiclo / 30.4375, 1)} meses`}
                formula="Data Fim do Ciclo − Data Início do Ciclo"
              />
              <LinhaResumo
                rotulo="Meses para vender todas as unidades"
                valor={mesesParaVender === null ? '—' : `${formatarNumero(mesesParaVender, 1)} meses`}
                formula="Número Total de Unidades ÷ Quantidade de Vendas no Mês"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
});

export default DfcParametrosTab;
