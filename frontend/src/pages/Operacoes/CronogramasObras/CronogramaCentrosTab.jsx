import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, Milestone, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  listCronogramaCentros,
  updateDatasCronogramaCentro,
  updateNaturezaCronogramaCentro,
} from '../../../api/cronogramaCentros.api';
import { corPadrao } from '../../../utils/coresPadrao';
import { anosEntre, dataValida, formatarData, mesesEntre, somarAnos, somarMeses } from './cronogramaDatas';

const NATUREZAS = [
  { value: 'OBRA', label: 'Obra' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
];

// Mesmo par de cores do Tipo na aba Centros Custos da DFC (DfcCentrosTab.jsx): em branco fica
// âmbar, pra achar de relance o que falta classificar; preenchido fica azul claro.
function corCampo(valor) {
  return valor ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50';
}

// Colunas: centro, tipo, e por etapa a data e a quantidade; no fim o término (data da última
// etapa + anos). As etapas vêm do cadastro da aba Etapas, então a grade é montada na hora.
function colunasGrade(qtdEtapas) {
  if (qtdEtapas === 0) return 'minmax(200px,1fr) 140px';
  return `minmax(200px,1fr) 140px${' 118px 52px'.repeat(qtdEtapas)} 88px`;
}

const CLASSE_CAMPO =
  'w-full min-w-0 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300';

// Data de início da etapa. Só grava ao sair do campo (ou Enter): o campo de data do navegador
// muda a cada dígito (o ano passa por 0002, 0020...) e com a digitação pela metade fica vazio —
// `badInput` diferencia isso de apagar a data de propósito.
function CampoData({ valor, onSalvar, title }) {
  const [texto, setTexto] = useState(valor || '');
  useEffect(() => setTexto(valor || ''), [valor]);

  function confirmar(e) {
    if (e.currentTarget.validity.badInput || (texto && !dataValida(texto))) {
      setTexto(valor || '');
      return;
    }
    if (texto === (valor || '')) return;
    onSalvar(texto || null);
  }

  return (
    <input
      type="date"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      title={title}
      aria-label={title}
      className={CLASSE_CAMPO}
    />
  );
}

// Quantidade (meses até a próxima etapa; na última, anos até o término). Mostra a conta feita a
// partir das datas; digitar um número calcula a data seguinte. Também só grava ao sair (ou Enter).
function CampoQtd({ valor, maximo, disabled, onSalvar, title }) {
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);

  function confirmar() {
    const n = Number(texto);
    if (String(texto).trim() === '' || !Number.isInteger(n) || n < 0 || n > maximo || n === valor) {
      setTexto(valor ?? '');
      return;
    }
    onSalvar(n);
  }

  return (
    <input
      type="number"
      min={0}
      max={maximo}
      step={1}
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      title={title}
      aria-label={title}
      className={`${CLASSE_CAMPO} text-center tabular-nums ${valor < 0 ? 'border-red-300 text-red-600' : ''}`}
    />
  );
}

// Operações > Cronogramas Obras > Centros de Custos: todos os centros de custo da empresa (mesma
// lista e mesmo visual da aba Centros Custos da DFC — DfcCentrosTab.jsx), com o Tipo (a MESMA coluna
// de lá e do cadastro: mudar aqui muda lá) e, nas obras, o cronograma: pra cada etapa do cadastro
// da aba Etapas (a máscara Etapas do Centro de Custo do cadastro), a data de início e a quantidade
// até a etapa seguinte (meses; na última, anos até o
// término) — pedido do usuário. Só as datas são gravadas (ver cronogramaCentros.service.js):
// - digitar uma data recalcula as quantidades vizinhas;
// - digitar uma quantidade calcula e grava a data da etapa seguinte (na última, o término);
// - as outras datas não andam sozinhas (sem efeito cascata).
// Cada mudança salva na hora, com o mesmo indicador de salvamento da DFC.
export default function CronogramaCentrosTab({ empresaId, search, onIrParaEtapas }) {
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

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
    setErroSalvar('');
    setSalvoAlgumaVez(false);
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

  function trocarCentro(siengeId, patch) {
    setCentros((atual) => atual.map((c) => (c.sienge_id === siengeId ? { ...c, ...patch } : c)));
  }

  // Atualiza a linha na hora e grava; a resposta do banco é a palavra final. Se falhar, recarrega
  // pra tela nunca ficar mostrando algo que não foi salvo.
  async function gravar(acao) {
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      await acao();
      setSalvoAlgumaVez(true);
    } catch (err) {
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
      carregar();
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  function alterarNatureza(centro, natureza) {
    trocarCentro(centro.sienge_id, { natureza });
    gravar(async () => {
      const salvo = await updateNaturezaCronogramaCentro(empresaId, centro.sienge_id, natureza);
      trocarCentro(centro.sienge_id, { natureza: salvo.natureza });
    });
  }

  // datas: [{ etapa_id, data | null }]; dataTermino: undefined = não mexe.
  function alterarDatas(centro, datas, dataTermino) {
    const novasDatas = { ...centro.datas };
    datas.forEach(({ etapa_id: id, data }) => {
      if (data) novasDatas[id] = data;
      else delete novasDatas[id];
    });
    trocarCentro(centro.sienge_id, {
      datas: novasDatas,
      ...(dataTermino !== undefined ? { data_termino: dataTermino } : {}),
    });
    gravar(async () => {
      const salvo = await updateDatasCronogramaCentro(empresaId, centro.sienge_id, { datas, dataTermino });
      trocarCentro(centro.sienge_id, { datas: salvo.datas, data_termino: salvo.data_termino });
    });
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Building2 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para montar o cronograma das obras.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const colunas = colunasGrade(etapas.length);

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {statusSalvamento && (
        <div className="-mt-1 mb-3 flex items-center justify-end text-xs" aria-live="polite">
          {statusSalvamento === 'salvando' ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Salvando...
            </span>
          ) : statusSalvamento === 'erro' ? (
            <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
              <TriangleAlert size={14} /> Erro ao salvar
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Check size={14} /> Alterações salvas
            </span>
          )}
        </div>
      )}

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {!carregando && !erroCarga && etapas.length === 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Milestone size={14} className="shrink-0" />
          Nenhuma etapa cadastrada — cadastre as etapas para montar o cronograma das obras.
          {onIrParaEtapas && (
            <button type="button" onClick={onIrParaEtapas} className="font-semibold underline underline-offset-2 hover:text-amber-800">
              Ir para Etapas
            </button>
          )}
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
        // Rola de lado quando há etapas demais pra caber (as listas de Tipo abrem por cima — portal).
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Cabeçalho azul da DFC, em 2 linhas: o nome de cada etapa (com a cor dela) por cima
                das colunas Data / Meses (Anos na última). */}
            <div
              className="grid items-center gap-x-2 gap-y-1 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700"
              style={{ gridTemplateColumns: colunas }}
            >
              <span className="row-span-2">Centro de custo</span>
              <span className="row-span-2">Tipo</span>
              {etapas.map((etapa, i) => (
                <span key={etapa.id} className="col-span-2 flex min-w-0 items-center justify-center gap-1.5" title={etapa.descricao}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: etapa.cor || corPadrao(i) }} />
                  <span className="truncate">{etapa.descricao || 'Sem nome'}</span>
                </span>
              ))}
              {etapas.length > 0 && (
                <span className="row-span-2 text-center" title="Data da última etapa + os anos informados">
                  Término
                </span>
              )}
              {etapas.map((etapa, i) => (
                <Fragment key={etapa.id}>
                  <span className="text-center text-[10px] font-normal normal-case tracking-normal text-blue-500">Data</span>
                  <span className="text-center text-[10px] font-normal normal-case tracking-normal text-blue-500">
                    {i === etapas.length - 1 ? 'Anos' : 'Meses'}
                  </span>
                </Fragment>
              ))}
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
                    className="grid items-center gap-2 border-b border-gray-100 bg-white py-1.5 pl-4 pr-4 hover:bg-gray-50"
                    style={{ gridTemplateColumns: colunas }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">{centro.sienge_id}</span>
                      <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={centro.name}>
                        {centro.name}
                        {centro.apelido && <span className="font-normal text-gray-400"> · {centro.apelido}</span>}
                      </span>
                      {centro.status !== 'ATIVO' && (
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          Inativo
                        </span>
                      )}
                    </div>
                    <SearchableSelect
                      value={centro.natureza || ''}
                      onChange={(v) => alterarNatureza(centro, v || null)}
                      options={NATUREZAS}
                      placeholder="Selecione"
                      corClasses={corCampo(centro.natureza)}
                    />

                    {etapas.length > 0 &&
                      (obra ? (
                        <>
                          {etapas.map((etapa, i) => {
                            const ultima = i === etapas.length - 1;
                            const data = centro.datas[etapa.id] || null;
                            const proxima = ultima ? centro.data_termino : centro.datas[etapas[i + 1].id];
                            const qtd = data && proxima ? (ultima ? anosEntre(data, proxima) : mesesEntre(data, proxima)) : null;
                            return (
                              <Fragment key={etapa.id}>
                                <CampoData
                                  valor={data}
                                  title={`Data ${etapa.descricao}`}
                                  onSalvar={(nova) => alterarDatas(centro, [{ etapa_id: etapa.id, data: nova }])}
                                />
                                <CampoQtd
                                  valor={qtd}
                                  maximo={ultima ? 100 : 600}
                                  disabled={!data}
                                  title={
                                    !data
                                      ? `Informe a data ${etapa.descricao} primeiro`
                                      : qtd < 0
                                        ? `A data seguinte é anterior à data ${etapa.descricao}`
                                        : ultima
                                          ? `Anos de ${etapa.descricao} (somados à data dela dão o término)`
                                          : `Meses de ${etapa.descricao} (até ${etapas[i + 1].descricao})`
                                  }
                                  onSalvar={(n) =>
                                    ultima
                                      ? alterarDatas(centro, [], somarAnos(data, n))
                                      : alterarDatas(centro, [{ etapa_id: etapas[i + 1].id, data: somarMeses(data, n) }])
                                  }
                                />
                              </Fragment>
                            );
                          })}
                          <span className="text-center text-xs tabular-nums text-gray-700">
                            {centro.data_termino ? formatarData(centro.data_termino) : <span className="text-gray-300">—</span>}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-300" style={{ gridColumn: `span ${etapas.length * 2 + 1}` }}>
                          —
                        </span>
                      ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
