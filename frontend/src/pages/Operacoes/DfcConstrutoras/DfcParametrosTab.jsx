import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, HardHat, Lock, SlidersHorizontal } from 'lucide-react';
import Card from '../../../components/Card';
import { getFonteParametrosDfc, getVersaoParametrosDfc, salvarVersaoParametrosDfc } from '../../../api/dfcParametros.api';
import { CAMPOS_EDITAVEIS, PARAMETROS_VAZIOS, SESSOES_PARAMETROS } from './parametrosDfc';
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

function formatarData(data) {
  return new Date(data).toLocaleDateString('pt-BR');
}

// Resumo (lado direito): todas as obras da empresa que projetam DFC (Tipo = Obra e "Projeta DFC"
// marcado na aba Centros Custos), se já
// têm parâmetros e qual a versão vigente. Clicar numa obra seleciona ela no filtro do topo.
function ResumoObras({ centros, carregando, siengeIdSelecionado, onSelecionar }) {
  const comParametros = centros.filter((c) => c.versao_vigente).length;
  return (
    <Card className="xl:sticky xl:top-4">
      <SectionHeader
        titulo="Resumo"
        texto={
          carregando
            ? 'Carregando obras...'
            : `${comParametros} de ${centros.length} obra(s) com parâmetros registrados.`
        }
      />
      {!carregando && centros.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          Nenhuma obra com "Projeta DFC" marcado. Marque na aba Centros Custos.
        </p>
      ) : (
        <div className="-mx-2 mt-2 max-h-[70vh] overflow-y-auto">
          {centros.map((c) => {
            const ativo = String(c.sienge_id) === String(siengeIdSelecionado);
            return (
              <button
                key={c.sienge_id}
                type="button"
                onClick={() => onSelecionar(c.sienge_id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                  ativo ? 'bg-primary-50 ring-1 ring-inset ring-primary-200' : 'hover:bg-gray-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-gray-800" title={c.name}>
                    {c.name}
                  </span>
                  {c.versao_criada_em && (
                    <span className="block text-[11px] tabular-nums text-gray-400">
                      Publicada em {formatarData(c.versao_criada_em)}
                    </span>
                  )}
                </span>
                {c.versao_vigente ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                    Versão {c.versao_vigente}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                    Sem parâmetros
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// Operações > DFC Construtoras > Parâmetros: os parâmetros fixos da DFC de cada empreendimento,
// no mesmo modelo do Motor de Risco da Gestão de Cobranças (MotorRiscoTab.jsx) — versionado:
// cada "Publicar Versão" grava uma versão nova, nunca sobrescreve. Como lá, o botão mora na barra
// de filtros da página (DfcConstrutorasPage.jsx): esta aba expõe `salvar()` via ref e avisa o
// estado (`podeSalvar`/`salvando`) via `onStatusChange`.
const DfcParametrosTab = forwardRef(function DfcParametrosTab(
  {
    empresaId,
    centro,
    centros,
    carregandoCentros,
    onSelecionarCentro,
    versaoSelecionada,
    versaoMaisRecenteId,
    versaoVigenteNumero,
    onVersaoCriada,
    onStatusChange,
  },
  ref
) {
  const siengeId = centro?.sienge_id ?? null;
  const [valores, setValores] = useState(PARAMETROS_VAZIOS);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  // Valores da versão vigente (a mais recente) — publicar só libera se algo estiver diferente
  // dela. null = empreendimento ainda sem nenhuma versão.
  const [valoresVigentes, setValoresVigentes] = useState(null);
  // Valores fixos da obra (DCD / Geral do Contrato Caixa — ver dfcParametros.service.js::fonteFixos):
  // aparecem travados e sempre valem no lugar do que estiver na versão. null = carregando.
  const [fonte, setFonte] = useState(null);

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

  useEffect(() => {
    if (!empresaId || !siengeId || !versaoVigenteNumero) {
      setValoresVigentes(null);
      return;
    }
    setValoresVigentes(null);
    getVersaoParametrosDfc(empresaId, siengeId, versaoVigenteNumero)
      .then((detalhe) => setValoresVigentes(valoresDaVersao(detalhe)))
      .catch(() => setValoresVigentes(null));
  }, [empresaId, siengeId, versaoVigenteNumero]);

  // Recarrega também quando a versão vigente muda: importar um DCD/Geral novo cria versão sozinho.
  useEffect(() => {
    if (!empresaId || !siengeId) {
      setFonte(null);
      return;
    }
    setFonte(null);
    getFonteParametrosDfc(empresaId, siengeId)
      .then(setFonte)
      .catch(() => setFonte({ contrato: null, fixos: {}, origens: {} }));
  }, [empresaId, siengeId, versaoVigenteNumero]);

  // O que vale de fato: o digitado/carregado da versão, com os fixos por cima.
  const efetivos = { ...valores, ...(fonte?.fixos || {}) };
  const origens = fonte?.origens || {};

  function alterar(id, valor) {
    setValores((prev) => ({ ...prev, [id]: valor }));
  }

  // "Publicar Versão" só libera com todos os parâmetros preenchidos e algum diferente da versão
  // vigente (pedido do usuário: sem aviso de "preencha X" — os campos em branco já ficam em
  // âmbar). A única mensagem que sobra é a das datas do ciclo invertidas, que senão travaria o
  // botão sem explicação.
  const todosPreenchidos = CAMPOS_EDITAVEIS.every((c) => efetivos[c.id] !== '' && efetivos[c.id] !== null);
  const datasInvertidas = todosPreenchidos && efetivos.data_fim_ciclo <= efetivos.data_inicio_ciclo;
  const alterado = !valoresVigentes || CAMPOS_EDITAVEIS.some((c) => efetivos[c.id] !== valoresVigentes[c.id]);
  const aguardandoVigente = Boolean(versaoVigenteNumero) && !valoresVigentes;

  const podeSalvar =
    Boolean(empresaId && siengeId) &&
    !carregando &&
    !salvando &&
    !aguardandoVigente &&
    Boolean(fonte) &&
    todosPreenchidos &&
    !datasInvertidas &&
    alterado;

  async function handleSalvar() {
    setErro('');
    setSucesso('');
    setSalvando(true);
    try {
      const criada = await salvarVersaoParametrosDfc(empresaId, siengeId, efetivos);
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

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] flex-col items-center justify-center rounded-tl-none text-center">
        <SlidersHorizontal size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa e o centro de custo no filtro acima para preencher os parâmetros da DFC.
        </p>
      </Card>
    );
  }

  const resumo = (
    <ResumoObras
      centros={centros}
      carregando={carregandoCentros}
      siengeIdSelecionado={siengeId}
      onSelecionar={onSelecionarCentro}
    />
  );

  if (!siengeId) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <Card className="flex min-h-[280px] flex-col items-center justify-center rounded-tl-none text-center">
          {centros.length === 0 && !carregandoCentros ? (
            <HardHat size={28} className="mb-3 text-gray-300" />
          ) : (
            <Building2 size={28} className="mb-3 text-gray-300" />
          )}
          <h2 className="text-sm font-semibold text-gray-900">Selecione um centro de custo</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">
            Os parâmetros da DFC são de cada obra. Escolha no resumo ao lado ou no filtro acima.
          </p>
        </Card>
        {resumo}
      </div>
    );
  }

  const editandoVersaoAntiga = versaoSelecionada && versaoSelecionada.id !== versaoMaisRecenteId;
  const valoresComCalculados = { ...efetivos };
  SESSOES_PARAMETROS.forEach((s) =>
    s.campos.forEach((c) => {
      if (c.tipo === 'calculado') valoresComCalculados[c.id] = c.calcular(efetivos);
    })
  );
  const temFixos = Object.keys(origens).length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="space-y-4">
        <Card className="rounded-tl-none">
          <p className="text-sm font-medium text-gray-800">
            {versaoNumero ? `Editando a partir da versão ${versaoNumero}` : 'Nenhuma versão salva ainda'}
            <span className="font-normal text-gray-400"> · {centro.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {editandoVersaoAntiga
              ? 'Você está olhando uma versão antiga. Ajustar e publicar cria uma versão nova — o histórico nunca é sobrescrito.'
              : 'Preencha os parâmetros abaixo e publique quando terminar. Só gera versão nova se algum parâmetro mudar.'}
          </p>

          {temFixos && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
              <Lock size={12} className="mt-0.5 shrink-0 text-gray-400" />
              <span>
                Os campos com cadeado vêm do DCD / Geral importados do contrato Caixa {fonte.contrato} e não podem
                ser editados. Cada DCD ou Geral novo desse contrato gera uma versão nova sozinho.
              </span>
            </p>
          )}

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
          {!erro && !sucesso && datasInvertidas && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600">
              <AlertTriangle size={15} className="shrink-0" />
              A Data Fim do Ciclo precisa ser depois da Data Início do Ciclo.
            </div>
          )}
        </Card>

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
                  origemFixo={origens[campo.id] || null}
                />
              ))}
            </div>
          </Card>
        ))}
      </div>
      {resumo}
    </div>
  );
});

export default DfcParametrosTab;
