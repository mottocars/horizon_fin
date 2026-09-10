import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import Card from '../../../../components/Card';
import { getVersaoMotorRisco, salvarVersaoMotorRisco } from '../../../../api/motorRisco.api';
import { PARAMETROS, REGRAS_FIXAS, INDICADORES, CORTES, PARAMS_VAZIOS, CORTES_VAZIOS, INDICADORES_VAZIOS } from './conteudo';
import { distribuirProporcionalmente } from './calculo';
import CampoNumerico from './CampoNumerico';
import EscalaIndicador from './EscalaIndicador';
import OrcamentoPesos from './OrcamentoPesos';
import SimuladorCliente from './SimuladorCliente';

// Converte pra número preservando "em branco" — os campos VAZIOS (primeiro
// preenchimento) usam '' de propósito, e Number('') viraria 0 (um valor
// muito diferente de "ainda não preenchido").
function numOuVazio(v) {
  return v === '' || v === null || v === undefined ? '' : Number(v);
}

function escalasFromLista(lista) {
  return Object.fromEntries(
    lista.map((item) => [
      item.indicador,
      { nota_0: numOuVazio(item.nota_0), nota_100: numOuVazio(item.nota_100), peso: numOuVazio(item.peso) },
    ])
  );
}

function extrairCampos(origem, ids, vazio) {
  const resultado = {};
  ids.forEach((id) => {
    resultado[id] = origem && origem[id] !== undefined ? numOuVazio(origem[id]) : vazio[id];
  });
  return resultado;
}

function estaPreenchido(v) {
  return v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v));
}

const IDS_PARAMETROS = PARAMETROS.map((p) => p.id);
const IDS_CORTES = CORTES.map((c) => c.id);

function SectionHeader({ selo, titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      {selo && (
        <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// O botão "Publicar Versão" mora na barra de filtros da página (ver
// GestaoCobrancasPage.jsx — todos os botões da tela ficam ali, nunca dentro
// da aba). Por isso este componente não renderiza o próprio botão: expõe
// `salvar()` via ref pro pai chamar, e avisa o pai do estado (`podeSalvar`/
// `salvando`) a cada mudança via `onStatusChange`, pra ele desenhar o botão
// certo (habilitado/carregando).
const MotorRiscoTab = forwardRef(function MotorRiscoTab(
  { empresaId, versaoSelecionada, versaoMaisRecenteId, onVersaoCriada, onStatusChange },
  ref
) {
  const [parametros, setParametros] = useState(PARAMS_VAZIOS);
  const [cortes, setCortes] = useState(CORTES_VAZIOS);
  const [escalas, setEscalas] = useState(() => escalasFromLista(INDICADORES_VAZIOS));
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const versaoNumero = versaoSelecionada?.versao ?? null;

  // Trocar de empresa é um contexto novo — descarta qualquer aviso da
  // empresa anterior.
  useEffect(() => {
    setErro('');
    setSucesso('');
  }, [empresaId]);

  // Troca de empresa ou de versão selecionada no combobox do topo: recarrega
  // o formulário inteiro com os dados daquela versão (ou em branco, quando a
  // empresa ainda não tem nenhuma versão salva — primeiro preenchimento).
  // Não limpa
  // erro/sucesso aqui: esse efeito também dispara logo depois de "Salvar
  // nova versão" (a lista recarrega e passa a apontar pra versão recém-
  // criada), e limpar aqui apagaria a mensagem de sucesso antes de dar
  // tempo do usuário ler. Quem limpa é a troca de empresa e o próprio botão
  // Salvar, no início de cada tentativa.
  useEffect(() => {
    if (!empresaId) return;

    if (!versaoNumero) {
      setParametros(PARAMS_VAZIOS);
      setCortes(CORTES_VAZIOS);
      setEscalas(escalasFromLista(INDICADORES_VAZIOS));
      return;
    }

    setCarregando(true);
    getVersaoMotorRisco(empresaId, versaoNumero)
      .then((detalhe) => {
        setParametros(extrairCampos(detalhe, IDS_PARAMETROS, PARAMS_VAZIOS));
        setCortes(extrairCampos(detalhe, IDS_CORTES, CORTES_VAZIOS));
        setEscalas(escalasFromLista(detalhe.indicadores));
      })
      .catch(() => setErro('Não foi possível carregar esta versão.'))
      .finally(() => setCarregando(false));
  }, [empresaId, versaoNumero]);

  function alterarParametro(id, valor) {
    setParametros((prev) => ({ ...prev, [id]: valor }));
  }

  function alterarCorte(id, valor) {
    setCortes((prev) => ({ ...prev, [id]: valor }));
  }

  function alterarEscala(indicadorId, campo, valor) {
    setEscalas((prev) => ({ ...prev, [indicadorId]: { ...prev[indicadorId], [campo]: valor } }));
  }

  function handleDistribuirPesos() {
    const pesosAtuais = INDICADORES.map((ind) => Number(escalas[ind.id]?.peso) || 0);
    const novosPesos = distribuirProporcionalmente(pesosAtuais);
    setEscalas((prev) => {
      const novo = { ...prev };
      INDICADORES.forEach((ind, i) => {
        novo[ind.id] = { ...novo[ind.id], peso: novosPesos[i] };
      });
      return novo;
    });
  }

  const parametrosPreenchidos = IDS_PARAMETROS.every((id) => estaPreenchido(parametros[id]));
  const cortesPreenchidos = IDS_CORTES.every((id) => estaPreenchido(cortes[id]));
  const escalasPreenchidas = INDICADORES.every((ind) => {
    const escala = escalas[ind.id] || {};
    return estaPreenchido(escala.nota_0) && estaPreenchido(escala.nota_100) && estaPreenchido(escala.peso);
  });
  const somaPesos = INDICADORES.reduce((acc, ind) => acc + (Number(escalas[ind.id]?.peso) || 0), 0);
  const cortesValidos = cortesPreenchidos && Number(cortes.corte_bom_pagador) > Number(cortes.corte_pagador_duvidoso);

  // Mensagem de pendência, em ordem de prioridade — só uma por vez, pra não
  // empilhar avisos. Substitui a mensagem de erro/sucesso quando nenhuma das
  // duas está ativa.
  let avisoPendencia = '';
  if (!parametrosPreenchidos) avisoPendencia = 'Preencha todos os parâmetros de contagem antes de gravar.';
  else if (!escalasPreenchidas) avisoPendencia = 'Preencha a escala (nota 0, nota 100 e peso) de todos os indicadores antes de gravar.';
  else if (somaPesos !== 100) avisoPendencia = 'O orçamento de pesos dos indicadores precisa fechar em 100 antes de gravar.';
  else if (!cortesPreenchidos) avisoPendencia = 'Preencha as faixas de corte antes de gravar.';
  else if (!cortesValidos) avisoPendencia = 'O corte de bom pagador precisa ser maior que o de pagador duvidoso.';

  const podeSalvar = Boolean(empresaId) && !carregando && !salvando && !avisoPendencia;

  async function handleSalvar() {
    setErro('');
    setSucesso('');
    setSalvando(true);
    try {
      const payload = {
        empresa_id: empresaId,
        ...parametros,
        ...cortes,
        indicadores: INDICADORES.map((ind) => ({ indicador: ind.id, ...escalas[ind.id] })),
      };
      const criada = await salvarVersaoMotorRisco(payload);
      setSucesso(`Versão ${criada.versao} gravada com sucesso — já é a versão vigente da empresa.`);
      onVersaoCriada(criada);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível gravar a versão.');
    } finally {
      setSalvando(false);
    }
  }

  // Hooks precisam rodar sempre, mesmo antes do "sem empresa" abaixo —
  // senão o pai perde a referência de salvar()/o status assim que a empresa
  // é desmarcada.
  useImperativeHandle(ref, () => ({ salvar: handleSalvar }));
  useEffect(() => {
    onStatusChange?.({ podeSalvar, salvando });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeSalvar, salvando]);

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <ShieldAlert size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para configurar o Motor de Risco, ou consultar versões anteriores dele.
        </p>
      </Card>
    );
  }

  const editandoVersaoAntiga = versaoSelecionada && versaoSelecionada.id !== versaoMaisRecenteId;
  const indicadoresParaSimulador = INDICADORES.map((ind) => ({
    id: ind.id,
    curto: ind.curto,
    unidade: ind.unidade,
    ...escalas[ind.id],
  }));

  return (
    <div className="space-y-4">
      {/* Status — fica "colado" na aba ativa (ver Tabs.jsx). O botão
          "Publicar Versão" mora na barra de filtros da página (ver
          GestaoCobrancasPage.jsx). */}
      <Card className="rounded-tl-none">
        <p className="text-sm font-medium text-gray-800">
          {versaoNumero ? `Editando a partir da versão ${versaoNumero}` : 'Nenhuma versão salva ainda'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {editandoVersaoAntiga
            ? 'Você está olhando uma versão antiga. Ajustar e gravar cria uma versão nova — o histórico nunca é sobrescrito.'
            : 'Ajuste os parâmetros abaixo e grave quando terminar. Cada gravação cria uma versão nova.'}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <Card>
            <SectionHeader
              selo="Sessão 1"
              titulo="Parâmetros de contagem"
              texto={
                <>
                  Estes campos não dizem se o cliente é bom ou ruim. Eles dizem ao sistema{' '}
                  <strong className="font-medium text-gray-700">o que entra na conta</strong> — quais parcelas, em
                  que período, e a partir de quantos dias um atraso vira atraso.
                </>
              }
            />
            <div>
              {PARAMETROS.map((campo, i) => (
                <CampoNumerico
                  key={campo.id}
                  campo={campo}
                  value={parametros[campo.id]}
                  onChange={alterarParametro}
                  disabled={carregando}
                  primeiro={i === 0}
                />
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader
              titulo="Regras fixas do sistema"
              texto="Comportamentos que não são configuráveis, para evitar que uma escolha errada aqui invalide o motor inteiro. Ficam visíveis para que qualquer pessoa entenda o resultado."
            />
            <div>
              {REGRAS_FIXAS.map((regra, i) => (
                <div
                  key={regra.label}
                  className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_96px] sm:items-start sm:gap-4 ${
                    i === 0 ? '' : 'border-t border-gray-100'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{regra.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500">{regra.desc}</p>
                    <p className="mt-2 border-l-2 border-primary-100 pl-2.5 text-xs leading-relaxed text-primary-700">
                      {regra.exemplo}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 rounded-md border border-gray-100 bg-gray-50 py-1.5 font-mono text-[10px] uppercase tracking-wide text-gray-500">
                    <Lock size={11} />
                    {regra.selo}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader
              selo="Sessão 2"
              titulo="Escalas de normalização e pesos"
              texto={
                <>
                  Cada indicador tem uma unidade diferente — porcentagem, dias, contagem — e por isso nenhum pode ser
                  somado ao outro direto. A escala converte todos para a mesma nota de 0 a 100. Você declara só duas
                  coisas: <strong className="font-medium text-gray-700">qual valor é o pior aceitável</strong> (nota
                  0) e <strong className="font-medium text-gray-700">qual é o ideal</strong> (nota 100).
                </>
              }
            />
            <div>
              {INDICADORES.map((indicador, i) => (
                <EscalaIndicador
                  key={indicador.id}
                  indicador={indicador}
                  escala={escalas[indicador.id]}
                  onChange={alterarEscala}
                  disabled={carregando}
                  primeiro={i === 0}
                />
              ))}
            </div>
            <OrcamentoPesos
              indicadores={INDICADORES}
              pesos={Object.fromEntries(INDICADORES.map((ind) => [ind.id, escalas[ind.id]?.peso]))}
              onDistribuir={handleDistribuirPesos}
              disabled={carregando}
            />
          </Card>

          <Card>
            <SectionHeader
              titulo="Faixas de corte"
              texto="Onde o score vira cluster. Comece com estes números e ajuste depois da calibração contra o histórico de 12 meses."
            />
            <div>
              {CORTES.map((campo, i) => (
                <CampoNumerico
                  key={campo.id}
                  campo={campo}
                  value={cortes[campo.id]}
                  onChange={alterarCorte}
                  disabled={carregando}
                  primeiro={i === 0}
                />
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:sticky lg:top-4">
          <SimuladorCliente
            indicadores={indicadoresParaSimulador}
            minimoParcelas={Number(parametros.minimo_parcelas) || 0}
            corteBom={Number(cortes.corte_bom_pagador) || 0}
            corteDuvidoso={Number(cortes.corte_pagador_duvidoso) || 0}
            diasVencidosRegua={Number(parametros.dias_vencidos_regua_cobranca) || 0}
          />
        </div>
      </div>
    </div>
  );
});

export default MotorRiscoTab;
