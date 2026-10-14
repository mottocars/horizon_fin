import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Calculator,
  Check,
  CopyPlus,
  FilePlus2,
  History,
  Loader2,
  Minimize2,
  Minus,
  Plus,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoProjecaoCef } from '../../../api/dfcProjecaoCef.api';
import { getOrcamentoDfc, getRascunhoOrcamentoDfc, salvarVersaoOrcamentoDfc } from '../../../api/dfcOrcamento.api';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';
import {
  listOrcamentoInformadoDfc,
  replicarOrcamentoInformadoDfc,
  salvarOrcamentoInformadoDfc,
} from '../../../api/dfcOrcamentoInformado.api';
import ReplicarValorModal from './ReplicarValorModal';
import LogAlteracoesModal from './LogAlteracoesModal';
import { ORIGEM_INFORMADO, ORIGEM_NAO_INFORMADA, interpretarValor } from './orcamentoValores';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

// 'AAAA-MM' de cada mês entre as duas datas ('AAAA-MM-DD'), inclusive.
function mesesEntre(inicio, fim) {
  const meses = [];
  let [ano, mes] = inicio.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = fim.slice(0, 7).split('-').map(Number);
  while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && meses.length < 240) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara (duplicada aqui de
// propósito — telas não importam umas das outras nesse projeto).
function codigoFormatado(conta) {
  const larguras = [1, 2, 3, 4, 5, 6, 7].map((n) => conta[`mascara_nivel_${n}`]);
  const digitos = String(conta.sienge_id);
  const segmentos = [];
  let pos = 0;
  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }
  if (pos < digitos.length && segmentos.length > 0) segmentos[segmentos.length - 1] += digitos.slice(pos);
  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

function dinheiro(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Célula do valor informado (contas "HORIZON - INFORMADO"): fora de edição mostra "1.234,56"; ao
// focar vira o número puro; grava ao sair (Enter também). Vazio apaga; texto inválido descarta a
// edição. Botão direito abre o menu (Replicar valor até / Log de alterações) — com o que estiver
// digitado, se houver. Mesmo par de cores das outras abas: âmbar sem valor, azul claro com valor.
// `valor` é o digitado (rascunho); `pendente` = difere da versão salva (`valorVersao`) — borda
// tracejada laranja, só entra no Orçamento ao "Salvar Versão".
function CelulaInformada({ valor, pendente, valorVersao, onCommit, onMenu }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;
  const vazio = valor === null || valor === undefined;

  // Valor que vale agora: o digitado (se válido) ou o gravado.
  function valorAtual() {
    if (texto === null) return vazio ? null : valor;
    const novo = interpretarValor(texto);
    return Number.isNaN(novo) ? (vazio ? null : valor) : novo === 0 ? null : novo;
  }

  function commit() {
    if (texto === null) return;
    const novo = valorAtual();
    setTexto(null);
    if (novo === (vazio ? null : valor)) return;
    onCommit(novo);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={editando ? texto : vazio ? '' : dinheiro(valor)}
      placeholder="—"
      title={
        pendente
          ? `Pendente: só entra no Orçamento ao Salvar Versão. Na versão salva: ${
              valorVersao === null || valorVersao === undefined ? 'sem valor' : dinheiro(valorVersao)
            }`
          : 'Botão direito: replicar valor até / log de alterações'
      }
      onFocus={(e) => {
        setTexto(vazio ? '' : String(valor).replace('.', ','));
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[-\d.,\s]*$/.test(e.target.value)) setTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setTexto(null);
          e.currentTarget.blur();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const atual = valorAtual();
        commit();
        onMenu(e, atual);
      }}
      className={`h-7 w-full rounded-md border px-1.5 text-right text-xs tabular-nums outline-none transition-colors placeholder:text-gray-300 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 ${
        pendente
          ? 'border-dashed border-orange-400 bg-orange-50'
          : vazio
            ? 'border-amber-200 bg-amber-50'
            : 'border-primary-100 bg-primary-50'
      } ${!editando && !vazio && valor < 0 ? 'text-red-600' : 'text-gray-900'}`}
    />
  );
}

// Menu do botão direito numa célula de conta: fixo na posição do clique, fecha ao clicar fora,
// rolar ou com Esc. `opcoes`: [{ rotulo, icone, onClick }].
function MenuCelula({ menu, onFechar }) {
  useEffect(() => {
    if (!menu) return undefined;
    const fechar = () => onFechar();
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('mousedown', fechar);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      window.removeEventListener('mousedown', fechar);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [menu, onFechar]);

  if (!menu) return null;
  const largura = 210;
  const x = Math.min(menu.x, window.innerWidth - largura - 8);
  const y = Math.min(menu.y, window.innerHeight - menu.opcoes.length * 36 - 16);
  return (
    <div
      role="menu"
      className="fixed z-[60] rounded-lg border border-gray-100 bg-white py-1 shadow-card"
      style={{ left: x, top: y, width: largura }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.opcoes.map(({ rotulo, icone: Icone, onClick }) => (
        <button
          key={rotulo}
          type="button"
          role="menuitem"
          onClick={() => {
            onFechar();
            onClick();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
        >
          <Icone size={15} className="shrink-0 text-gray-400" />
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
}

const LARGURA_PRIMEIRA = 360;
const LARGURA_TOTAL_MIN = 112; // coluna "Total" (fixa, logo depois da primeira); cresce pra caber o maior total
const LARGURA_MES = 92; // largura mínima de um mês; cresce pra caber o maior valor da coluna
const FOLGA_MES = 30; // padding da célula + borda + campo de digitação
const ALTURA_MINIMA_GRADE = 320;
// Sombra na borda das colunas congeladas (nome + Total) quando os meses rolaram pra esquerda (indica
// que há conteúdo por baixo delas, como nas planilhas).
const SOMBRA_COLUNA_FIXA = '[&_tr>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.25)]';

// Largura (px) do texto no corpo da grade — text-xs semibold, a fonte da página. Canvas reaproveitado.
let contextoMedida;
function larguraTexto(texto) {
  if (contextoMedida === undefined) {
    contextoMedida = document.createElement('canvas').getContext('2d');
    if (contextoMedida) contextoMedida.font = `600 12px ${getComputedStyle(document.body).fontFamily}`;
  }
  // +8%: os algarismos tabulares (tabular-nums) são um pouco mais largos que os do canvas.
  return contextoMedida ? contextoMedida.measureText(texto).width * 1.08 : texto.length * 7.5;
}

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const RECUO = [12, 32, 52, 76]; // padding-left de cada nível (centro, máscara 1, máscara 2, conta)

// Operações > DFC Construtoras > Orçamentos: o orçamento é por centro de custo e conta do plano de
// contas, projetado a partir dos Parâmetros. Valores por enquanto: a Projeção CEF (janela
// "Projeções" no topo — backend dfc-projecao-cef), que cai nas contas com Origem Projeção CEF_*;
// os níveis acima somam os de baixo. Estrutura:
// drilldown Centro de Custo › Máscara Nível 1 › Máscara Nível 2 › Conta analítica (a do plano de
// contas classificada com aquela máscara na aba Plano Contas), colunas = meses do período do topo.
// Centros = todos com "Projeta DFC" (obras e administrativos). Contas analíticas sem Máscara DFC
// entram num grupo "SEM MÁSCARA DFC" pra não sumirem; as com "Projeta DFC" desmarcado no plano do
// centro não entram (pedido do usuário), e máscara que fica sem conta nenhuma some. Começa tudo fechado.
// Contas com Origem Projeção "HORIZON - INFORMADO" no plano do centro: o valor é digitado na própria
// célula, e o botão direito abre o menu "Replicar valor até" / "Log de alterações" (nas demais
// contas, só o log).
// VERSÕES (pedido do usuário; backend dfc-orcamento): a grade mostra uma versão salva — `versao`
// (filtro "Versão" do topo): null = a última, ou o número. Ícone "Nova versão" do topo (janela
// NovaVersaoOrcamentoModal): atualiza as bases e monta a nova versão a partir do que está no banco
// (`versao` = 'nova', a cada `novaVersaoToken`) — os valores de hoje de todas as bases, com o que
// difere da última versão em laranja. Só nela as contas "HORIZON - INFORMADO" são editáveis e o
// "Salvar Versão" funciona (`ref.salvarVersao`); salva, ela vira a última versão (`onVersaoSalva`).
// `onVersoes(lista, temNova)`: lista das versões salvas pro filtro do topo.
// `telaCheia`: a grade ocupa a tela inteira (por cima do menu e do topo, e em tela cheia de verdade
// no navegador quando ele deixa); sai pelo botão "Sair da tela cheia" ou com Esc (`onSairTelaCheia`).
// `origens`: filtro "Origem DFC" do topo — só as contas com essas Origens Projeção no plano do centro
// (ORIGEM_NAO_INFORMADA = sem origem); vazio = todas. Máscara e centro sem conta nenhuma somem.
const DfcOrcamentosTab = forwardRef(function DfcOrcamentosTab(
  {
    empresaId,
    inicio,
    fim,
    origens = [],
    versao: versaoEscolhida = null,
    novaVersaoToken = 0,
    onVersoes,
    onVersaoSalva,
    refreshToken = 0,
    telaCheia = false,
    onSairTelaCheia,
  },
  ref
) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [dados, setDados] = useState(null);
  const [salvandoVersao, setSalvandoVersao] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, opcoes }
  const [logDe, setLogDe] = useState(null); // alvo do "Log de alterações"
  const fecharMenu = useCallback(() => setMenu(null), []);
  // Versão salva na tela ({ versoes, versao, valores }) e a nova versão montada ({ gerado_em,
  // versao_base, valores, valores_versao, avisos }).
  const [salva, setSalva] = useState(null);
  const [nova, setNova] = useState(null);
  const [carregandoValores, setCarregandoValores] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);
  // 'centro|conta|mês' -> valor informado.
  const [informados, setInformados] = useState({});
  const [replicando, setReplicando] = useState(null);
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  // Grade com rolagem própria (só os meses andam pro lado; a página fica parada).
  const gradeRef = useRef(null);
  const [alturaGrade, setAlturaGrade] = useState(null);
  const [rolouX, setRolouX] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    Promise.all([
      listCentrosCustoDfc(empresaId),
      listDfcMascaras(empresaId),
      listContas(empresaId, { page: 1, limit: 2000, search: '' }),
      listTodasClassificacoesPlanoDfc(empresaId),
      getOrcamentoProjecaoCef(empresaId),
      listOrcamentoInformadoDfc(empresaId),
    ])
      .then(([centros, mascaras, contas, classificacoes, projecao, valoresInformados]) => {
        setDados({ centros, mascaras, contas: contas.data, classificacoes, projecao });
        setInformados(Object.fromEntries(valoresInformados.map((v) => [`${v.centro_id}|${v.sienge_id}|${v.mes}`, v.valor])));
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o orçamento.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setSalva(null);
    setNova(null);
    setAbertos([]);
    setInformados({});
    setErroSalvar('');
    setSalvoAlgumaVez(false);
  }, [empresaId]);

  // Recarrega também com `refreshToken`, mantendo o que está aberto.
  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const emNova = versaoEscolhida === 'nova';

  // Versão salva escolhida no filtro (null = a última). Com a nova versão na tela, carrega a última
  // só pra manter a lista de versões do filtro.
  const carregarSalva = useCallback(() => {
    if (!empresaId) return;
    setCarregandoValores(true);
    getOrcamentoDfc(empresaId, typeof versaoEscolhida === 'number' ? versaoEscolhida : null)
      .then(setSalva)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar a versão.'))
      .finally(() => setCarregandoValores(false));
  }, [empresaId, versaoEscolhida]);
  useEffect(() => {
    carregarSalva();
  }, [carregarSalva, refreshToken]);

  // "Nova versão": monta a partir das bases a cada pedido (`novaVersaoToken`).
  useEffect(() => {
    if (!empresaId || !novaVersaoToken) return;
    setCarregandoValores(true);
    getRascunhoOrcamentoDfc(empresaId)
      .then(setNova)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível montar a nova versão.'))
      .finally(() => setCarregandoValores(false));
  }, [empresaId, novaVersaoToken]);

  // Lista de versões pro filtro do topo.
  useEffect(() => {
    if (salva) onVersoes?.(salva.versoes, Boolean(nova));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salva, nova]);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);

  // Estrutura (máscara 1 > máscara 2 > contas) de cada plano: o Global e a versão própria de cada
  // centro que tem uma (aba Plano Contas) — o centro com versão própria usa a dele, os demais o Global.
  const filtroOrigens = useMemo(() => (origens.length ? new Set(origens) : null), [origens]);
  const { centros, planoGlobal, planosCentro } = useMemo(() => {
    if (!dados) return { centros: [], planoGlobal: { estrutura: [], todasContas: [], origemDaConta: {} }, planosCentro: {} };
    const analiticas = [...dados.contas]
      .filter((c) => c.tp_conta !== 'T')
      .sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
    const idsNivel2 = new Set(dados.mascaras.flatMap((g) => g.filhos.map((f) => f.id)));

    function montar(classificacoes) {
      const mascaraDaConta = Object.fromEntries(classificacoes.map((c) => [c.sienge_id, c.mascara_id]));
      const origemDaConta = Object.fromEntries(classificacoes.map((c) => [c.sienge_id, c.origem_projecao]));
      // "Projeta DFC" desmarcado no plano: a conta fica fora do Orçamento. Sem linha = marcado.
      const foraDoDfc = new Set(classificacoes.filter((c) => c.projeta_dfc === false).map((c) => c.sienge_id));
      const contasDoPlano = analiticas.filter(
        (c) =>
          !foraDoDfc.has(c.sienge_id) &&
          (!filtroOrigens || filtroOrigens.has(origemDaConta[c.sienge_id] ?? ORIGEM_NAO_INFORMADA))
      );
      // Máscara sem nenhuma conta com "Projeta DFC" nesse plano não aparece (pedido do usuário) —
      // tanto a de nível 2 quanto a de nível 1 que ficar sem nenhuma de nível 2.
      const grupos = dados.mascaras
        .map((g) => ({
          chave: `m${g.id}`,
          descricao: g.descricao,
          filhos: g.filhos
            .map((f) => ({
              chave: `m${f.id}`,
              descricao: f.descricao,
              contas: contasDoPlano.filter((c) => mascaraDaConta[c.sienge_id] === f.id),
            }))
            .filter((f) => f.contas.length > 0),
        }))
        .filter((g) => g.filhos.length > 0);
      const semMascara = contasDoPlano.filter((c) => !idsNivel2.has(mascaraDaConta[c.sienge_id]));
      if (semMascara.length) {
        grupos.push({
          chave: 'sem',
          descricao: 'SEM MÁSCARA DFC',
          semMascara: true,
          filhos: [{ chave: 'sem2', descricao: 'Contas sem Máscara DFC na aba Plano Contas', contas: semMascara }],
        });
      }
      grupos.forEach((g) => {
        g.contas = g.filhos.flatMap((f) => f.contas);
      });
      return { estrutura: grupos, todasContas: grupos.flatMap((g) => g.contas), origemDaConta };
    }

    const global = montar(dados.classificacoes.global);
    const porCentro = Object.fromEntries(
      Object.entries(dados.classificacoes.centros).map(([id, lista]) => [id, { ...montar(lista), propria: true }])
    );
    return {
      // Com o filtro "Origem DFC", centro sem nenhuma conta daquelas origens some.
      centros: dados.centros
        .filter((c) => c.projeta_dfc && (!filtroOrigens || (porCentro[c.sienge_id] || global).estrutura.length > 0))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      planoGlobal: global,
      planosCentro: porCentro,
    };
  }, [dados, filtroOrigens]);

  // A conta é "HORIZON - INFORMADO" no plano que o centro usa? (o valor vem da digitação)
  const contaInformada = useCallback(
    (sid, conta) => ((planosCentro[sid] || planoGlobal).origemDaConta[conta] ?? null) === ORIGEM_INFORMADO,
    [planosCentro, planoGlobal]
  );

  // Nova versão na tela (montada a partir das bases) ou uma versão salva.
  const previa = emNova && Boolean(nova);
  const temVersao = previa ? nova.versao_base !== null : Boolean(salva?.versao);

  // Valor digitado (rascunho) de uma conta "HORIZON - INFORMADO" — o que aparece no campo.
  const rascunho = useCallback((sid, conta, mes) => informados[`${sid}|${conta}|${mes}`] ?? null, [informados]);

  // Valores: centro -> conta -> mês -> valor. `valorConta` = o que a grade mostra — a versão salva
  // escolhida ou, na nova versão, os valores das bases (nas contas digitadas, o que está no campo);
  // `valorVersao` = a última versão salva (pra comparar na nova versão). E quando cada obra foi
  // projetada.
  const { valorConta, valorVersao, execucaoPorCentro } = useMemo(() => {
    const mapaDe = (lista) => {
      const mapa = new Map();
      (lista || []).forEach((v) => mapa.set(`${v.centro_id}|${v.sienge_id}|${v.mes}`, v.valor));
      return (sid, conta, mes) => mapa.get(`${sid}|${conta}|${mes}`) ?? null;
    };
    const execucoes = Object.fromEntries((dados?.projecao?.execucoes || []).map((e) => [e.sienge_id, e]));
    if (previa) {
      const dasBases = mapaDe(nova.valores);
      return {
        valorConta: (sid, conta, mes) => (contaInformada(sid, conta) ? rascunho(sid, conta, mes) : dasBases(sid, conta, mes)),
        valorVersao: mapaDe(nova.valores_versao),
        execucaoPorCentro: execucoes,
      };
    }
    const daVersao = mapaDe(salva?.valores);
    return { valorConta: daVersao, valorVersao: daVersao, execucaoPorCentro: execucoes };
  }, [dados, salva, nova, previa, contaInformada, rascunho]);
  const centavos = (v) => (v === null || v === undefined ? null : Math.round(v * 100));

  function trocarInformados(centroId, contaId, valoresPorMes) {
    setInformados((atual) => {
      const proximo = { ...atual };
      Object.entries(valoresPorMes).forEach(([mes, valor]) => {
        const chave = `${centroId}|${contaId}|${mes}`;
        if (valor === null) delete proximo[chave];
        else proximo[chave] = valor;
      });
      return proximo;
    });
  }

  // Atualiza na hora e grava; se falhar, volta o que estava.
  async function salvarInformado(centroId, contaId, mes, valor) {
    const anterior = informados[`${centroId}|${contaId}|${mes}`] ?? null;
    trocarInformados(centroId, contaId, { [mes]: valor });
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      await salvarOrcamentoInformadoDfc(empresaId, { centroId, siengeId: contaId, mes, valor });
      setSalvoAlgumaVez(true);
    } catch (err) {
      trocarInformados(centroId, contaId, { [mes]: anterior });
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  // "Replicar valor até" confirmado: grava no backend e põe o valor em cada mês na tela.
  async function replicar(ate) {
    const { centroId, contaId, mes, valor } = replicando;
    setPendentes((n) => n + 1);
    try {
      const { meses: gravados } = await replicarOrcamentoInformadoDfc(empresaId, {
        centroId,
        siengeId: contaId,
        de: mes,
        ate,
        valor,
      });
      trocarInformados(centroId, contaId, Object.fromEntries(gravados.map((m) => [m, valor])));
      setErroSalvar('');
      setSalvoAlgumaVez(true);
      setReplicando(null);
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  // Digitações ainda gravando (o clique em "Salvar Versão" tira o foco do campo e dispara a última).
  const gravacoesRef = useRef(0);
  gravacoesRef.current = pendentes;

  // "Salvar Versão": consolida as fontes de hoje (backend compara com a versão anterior e grava o log
  // do que mudou). Espera as digitações em andamento terminarem antes.
  async function salvarVersao() {
    if (!empresaId || salvandoVersao || !previa) return;
    for (let i = 0; i < 50 && gravacoesRef.current > 0; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const proxima = (salva?.versoes?.[0]?.numero || 0) + 1;
    const ok = await confirm({
      title: 'Salvar versão do orçamento',
      description: `A nova versão vira a versão ${proxima} — a última, que o Orçamento passa a mostrar. Cada valor que entrou, mudou ou saiu fica registrado no log de alterações.`,
      confirmLabel: 'Salvar versão',
    });
    if (!ok) return;
    setSalvandoVersao(true);
    try {
      const r = await salvarVersaoOrcamentoDfc(empresaId);
      await alert({
        title: `Versão ${r.numero} salva`,
        description: `${r.inclusoes} inclusão(ões), ${r.alteracoes} alteração(ões) e ${r.exclusoes} exclusão(ões) — cada uma registrada no log de alterações do valor.`,
      });
      setNova(null);
      onVersaoSalva?.(r.numero);
    } catch (err) {
      await alert({
        title: 'Versão não salva',
        description: err.response?.data?.message || 'Não foi possível salvar a versão.',
      });
    } finally {
      setSalvandoVersao(false);
    }
  }

  useImperativeHandle(ref, () => ({ salvarVersao }));

  // Saiu da nova versão pelo filtro sem salvar: ela continua montada até a próxima "Nova versão".

  // Botão direito numa célula de conta: menu com "Log de alterações" (e "Replicar valor até" nas
  // contas digitadas). `valorDigitado`: o que está no campo (contas "HORIZON - INFORMADO").
  function abrirMenu(e, { centro, conta, mes, informada, valorDigitado }) {
    e.preventDefault();
    const alvo = {
      centroId: centro.sienge_id,
      contaId: conta.sienge_id,
      centroNome: centro.name,
      contaRotulo: `${codigoFormatado(conta)} ${conta.name}`,
      mes,
      valor: valorVersao(centro.sienge_id, conta.sienge_id, mes),
    };
    const opcoes = [];
    if (informada) {
      opcoes.push({
        rotulo: 'Replicar valor até',
        icone: CopyPlus,
        onClick: () => setReplicando({ ...alvo, valor: valorDigitado }),
      });
    }
    opcoes.push({ rotulo: 'Log de alterações', icone: History, onClick: () => setLogDe(alvo) });
    setMenu({ x: e.clientX, y: e.clientY, opcoes });
  }

  // Soma de várias contas num mês (null quando nenhuma tem valor) — da grade ou, com `fonte`, da versão.
  function somaContas(sid, contas, mes, fonte = valorConta) {
    let total = null;
    contas.forEach((c) => {
      const v = fonte(sid, c.sienge_id, mes);
      if (v !== null) total = (total || 0) + v;
    });
    return total === null ? null : Math.round(total * 100) / 100;
  }

  function alternar(chave) {
    setAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  // Largura de cada mês: o bastante pro maior valor da coluna, em qualquer nível (aberto ou não —
  // assim a coluna não pula ao abrir o drilldown), nunca menos que LARGURA_MES.
  const largurasMes = useMemo(() => {
    const soma = (sid, contas, mes) => {
      let total = null;
      contas.forEach((c) => {
        const v = valorConta(sid, c.sienge_id, mes);
        if (v !== null) total = (total || 0) + v;
      });
      return total === null ? null : Math.round(total * 100) / 100;
    };
    return meses.map((m) => {
      let maior = 0;
      const considerar = (v) => {
        if (v !== null && v !== 0) maior = Math.max(maior, larguraTexto(dinheiro(v)));
      };
      centros.forEach((centro) => {
        const sid = centro.sienge_id;
        const { estrutura, todasContas } = planosCentro[sid] || planoGlobal;
        considerar(soma(sid, todasContas, m));
        estrutura.forEach((n1) => {
          considerar(soma(sid, n1.contas, m));
          n1.filhos.forEach((n2) => {
            considerar(soma(sid, n2.contas, m));
            n2.contas.forEach((c) => considerar(valorConta(sid, c.sienge_id, m)));
          });
        });
      });
      return Math.max(LARGURA_MES, Math.ceil(maior) + FOLGA_MES);
    });
  }, [meses, centros, planosCentro, planoGlobal, valorConta]);

  // Largura da coluna Total: o bastante pro maior total do período, em qualquer nível.
  const larguraTotal = useMemo(() => {
    let maior = 0;
    const considerar = (contas, sid) => {
      let t = 0;
      meses.forEach((m) => contas.forEach((c) => (t += valorConta(sid, c.sienge_id, m) || 0)));
      if (t) maior = Math.max(maior, larguraTexto(dinheiro(Math.round(t * 100) / 100)));
    };
    centros.forEach((centro) => {
      const sid = centro.sienge_id;
      const { estrutura, todasContas } = planosCentro[sid] || planoGlobal;
      considerar(todasContas, sid);
      estrutura.forEach((n1) => {
        considerar(n1.contas, sid);
        n1.filhos.forEach((n2) => {
          considerar(n2.contas, sid);
          n2.contas.forEach((c) => considerar([c], sid));
        });
      });
    });
    return Math.max(LARGURA_TOTAL_MIN, Math.ceil(maior) + FOLGA_MES);
  }, [meses, centros, planosCentro, planoGlobal, valorConta]);

  const replicandoRef = useRef(null);
  replicandoRef.current = replicando;
  const logDeRef = useRef(null);
  logDeRef.current = logDe;

  // Tela cheia: pede também a tela cheia do navegador (some a barra de endereço e as abas). Esc ali
  // é do navegador — ele sai da tela cheia e o `fullscreenchange` fecha a nossa junto. Sem a do
  // navegador (recusada ou indisponível), o Esc é tratado aqui (fora de um campo em edição: lá o
  // primeiro Esc só cancela a digitação).
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) onSairTelaCheia?.();
    };
    const aoTeclar = (e) => {
      if (e.key !== 'Escape' || e.target.tagName === 'INPUT') return;
      // Com o "Replicar valor até" ou o log aberto, o Esc fecha só ele.
      if (replicandoRef.current) {
        setReplicando(null);
        return;
      }
      if (logDeRef.current) {
        setLogDe(null);
        return;
      }
      onSairTelaCheia?.();
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaCheia]);

  // A grade ocupa a altura que sobra na tela (do topo dela até o fim da janela), com a barra de
  // rolagem horizontal sempre à vista no rodapé — sem precisar descer até a última linha pra rolar
  // os meses. Mede a cada render (avisos e mensagens acima dela mudam a posição) e no resize.
  useLayoutEffect(() => {
    const el = gradeRef.current;
    if (!el) return undefined;
    const medir = () => {
      const main = el.closest('main');
      // Em tela cheia o quadro é fixo na janela (não rola com o <main>).
      const topo = el.getBoundingClientRect().top + (main && !telaCheia ? main.scrollTop : 0);
      // Normal: 24 = p-6 do <main> + 20 = p-5 do quadro branco. Tela cheia: só o p-5 do quadro.
      const altura = Math.max(ALTURA_MINIMA_GRADE, Math.floor(window.innerHeight - topo - (telaCheia ? 20 : 44)));
      setAlturaGrade((atual) => (atual === altura ? atual : altura));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Calculator size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o orçamento.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;

  // Células de valor do mês (`valorMes(m)` -> número ou null). Saída (negativo) em vermelho.
  // `aoMenu(e, mes)`: botão direito (só nas linhas de conta). Na prévia, `valorMesVersao(m)` (o
  // da versão salva) marca em laranja o que vai mudar ao salvar.
  const celulas = (nivel, valorMes, aoMenu, valorMesVersao) =>
    meses.map((m) => {
      const v = valorMes ? valorMes(m) : null;
      const vazio = v === null || v === 0;
      // Sem versão nenhuma tudo é novo — não destaca (o laranja perderia o sentido).
      const compara = previa && temVersao && valorMesVersao;
      const vVersao = compara ? valorMesVersao(m) : null;
      const muda = compara && centavos(v || null) !== centavos(vVersao || null);
      return (
        <td
          key={m}
          title={muda ? `Na versão salva: ${vVersao ? dinheiro(vVersao) : 'sem valor'}` : undefined}
          onContextMenu={aoMenu ? (e) => aoMenu(e, m) : undefined}
          className={`border-b border-l px-2 text-right tabular-nums ${
            nivel === 0 ? 'border-gray-200 bg-gray-50 py-2 group-hover/linha:bg-gray-100' : 'border-gray-100 bg-white py-1.5 group-hover/linha:bg-gray-50'
          } ${vazio ? 'text-gray-300' : v < 0 ? 'text-red-600' : 'text-gray-800'} ${nivel <= 1 && !vazio ? 'font-semibold' : ''} ${
            muda ? '!bg-orange-50 shadow-[inset_0_-2px_0_0_rgb(251,146,60)]' : ''
          }`}
        >
          {vazio ? '—' : dinheiro(v)}
        </td>
      );
    });

  // Total da linha no período da tela (soma dos meses) — coluna "Total", fixa logo depois da
  // primeira, com o fundo azul do cabeçalho (pedido do usuário). null quando nenhum mês tem valor.
  function totalPeriodo(valorMes) {
    let total = null;
    meses.forEach((m) => {
      const v = valorMes(m);
      if (v !== null && v !== undefined) total = (total || 0) + v;
    });
    return total === null ? null : Math.round(total * 100) / 100;
  }
  // Negativo em vermelho, positivo em preto (como as outras células); na nova versão, laranja
  // embaixo quando o total muda em relação à versão salva.
  const celulaTotal = (nivel, valorMes, valorMesVersao) => {
    const t = totalPeriodo(valorMes);
    const vazio = t === null || t === 0;
    const compara = previa && temVersao && valorMesVersao;
    const tVersao = compara ? totalPeriodo(valorMesVersao) : null;
    const muda = compara && centavos(t || null) !== centavos(tVersao || null);
    return (
      <td
        title={muda ? `Na versão salva: ${tVersao ? dinheiro(tVersao) : 'sem valor'}` : 'Total do período'}
        className={`sticky z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 px-2 text-right tabular-nums group-hover/linha:bg-blue-100 ${
          nivel === 0 ? 'py-2' : 'py-1.5'
        } ${vazio ? 'text-gray-300' : t < 0 ? 'text-red-600' : 'text-gray-900'} ${nivel <= 1 && !vazio ? 'font-semibold' : ''} ${
          muda ? 'shadow-[inset_0_-2px_0_0_rgb(251,146,60)]' : ''
        }`}
        style={{ left: LARGURA_PRIMEIRA }}
      >
        {vazio ? '—' : dinheiro(t)}
      </td>
    );
  };

  // Linha de agrupamento (centro, máscara 1, máscara 2) — função comum, não componente, pra não
  // ser recriada a cada render.
  function linhaGrupo({ chave, nivel, rotulo, contagem, podeAbrir, destaque = false, cinza = false, valorMes, valorMesVersao, dica }) {
    const aberto = abertos.includes(chave);
    return (
      <tr onClick={() => podeAbrir && alternar(chave)} className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''}`}>
        <td
          className={`sticky left-0 z-10 border-b border-r py-2 pr-2 ${
            nivel === 0
              ? 'border-gray-200 bg-gray-50 group-hover/linha:bg-gray-100'
              : 'border-gray-100 border-r-gray-200 bg-white group-hover/linha:bg-gray-50'
          }`}
          style={{ paddingLeft: RECUO[nivel] }}
        >
          <span className="flex items-center gap-2">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                podeAbrir ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
              }`}
            >
              {aberto ? <Minus size={10} /> : <Plus size={10} />}
            </span>
            <span
              className={`min-w-0 truncate text-xs ${destaque ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'} ${
                cinza ? 'italic text-gray-500' : ''
              }`}
              title={dica || rotulo}
            >
              {rotulo}
            </span>
            {contagem !== undefined && (
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                {contagem}
              </span>
            )}
          </span>
        </td>
        {celulaTotal(nivel, valorMes, valorMesVersao)}
        {celulas(nivel, valorMes, undefined, valorMesVersao)}
      </tr>
    );
  }

  const mesAtual = mesDeHoje();
  // Avisos da Projeção CEF + base do contas a receber / a pagar nunca carregada (o Aging fica zerado).
  const avisos = [...(dados?.projecao?.avisos || []), ...(previa ? nova.avisos : [])];
  const versao = salva?.versao || null;
  const larguraTabela = LARGURA_PRIMEIRA + larguraTotal + largurasMes.reduce((t, l) => t + l, 0);

  return (
    // O quadro branco fica na largura da página; quem rola pro lado é só a grade (abaixo). Em tela
    // cheia ele vira uma camada fixa por cima de tudo, com a barra de título e o botão de sair.
    <div
      className={
        telaCheia
          ? 'fixed inset-0 z-40 flex flex-col bg-white p-5'
          : 'min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
          <Calculator size={18} className="shrink-0 text-primary-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Orçamentos</h2>
            {periodoValido && (
              <p className="text-xs text-gray-500">
                {rotuloMes(meses[0])} a {rotuloMes(meses[meses.length - 1])}
              </p>
            )}
          </div>
          <span className="ml-auto hidden text-xs text-gray-400 sm:inline">Esc para sair</span>
          <button
            type="button"
            onClick={salvarVersao}
            disabled={salvandoVersao || !previa}
            title={previa ? 'Salvar versão' : 'Monte uma nova versão pra poder salvar'}
            aria-label="Salvar versão"
            className="flex items-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvandoVersao ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          </button>
          <button
            type="button"
            onClick={onSairTelaCheia}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minimize2 size={15} />
            Sair da tela cheia
          </button>
        </div>
      )}
      {dados && (
        <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {previa ? (
            <>
              <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-0.5 font-medium text-orange-700 ring-1 ring-orange-200">
                <FilePlus2 size={13} className="shrink-0" />
                Nova versão (não salva) · montada em {dataHora(nova.gerado_em)}
              </span>
              <span className="text-gray-500">
                {temVersao
                  ? `Em laranja, o que difere da versão ${nova.versao_base} (passe o mouse pra ver o valor dela). Confira e salve pra virar a última versão.`
                  : 'Confira e salve pra virar a versão 1.'}
              </span>
            </>
          ) : emNova ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Montando a nova versão a partir das bases...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-500">
              <History size={14} className="shrink-0 text-gray-400" />
              {versao
                ? `Versão ${versao.numero}${versao.numero === salva.versoes[0]?.numero ? ' (última)' : ''} · salva em ${dataHora(
                    versao.criado_em
                  )}${versao.usuario ? ` por ${versao.usuario}` : ''}`
                : carregandoValores
                  ? 'Carregando...'
                  : 'Nenhuma versão salva ainda — use o ícone "Nova versão", no topo, pra montar a primeira.'}
            </span>
          )}
        </div>
      )}
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

      <MenuCelula menu={menu} onFechar={fecharMenu} />
      <LogAlteracoesModal open={Boolean(logDe)} alvo={logDe} empresaId={empresaId} onClose={() => setLogDe(null)} />
      <ReplicarValorModal
        open={Boolean(replicando)}
        alvo={replicando}
        sugestaoAte={fim ? fim.slice(0, 7) : ''}
        onClose={() => setReplicando(null)}
        onConfirmar={replicar}
      />

      {!periodoValido ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <TriangleAlert size={15} className="shrink-0" />A Data fim precisa ser igual ou depois da Data início.
        </div>
      ) : carregando && !dados ? (
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
        // Grade no padrão de planilha: rolagem própria nos dois sentidos, com a primeira coluna
        // (centro / máscara / conta) e o cabeçalho dos meses congelados. Rolando pro lado, só os
        // meses andam; a página (filtros, abas) fica parada.
        <div>
          {avisos.length > 0 && (
            <div className="mb-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {avisos.map((a) => (
                <p key={a} className="flex items-start gap-1.5">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  {a}
                </p>
              ))}
            </div>
          )}
          <div
            ref={gradeRef}
            onScroll={(e) => setRolouX(e.currentTarget.scrollLeft > 0)}
            className={`overflow-auto overscroll-x-contain rounded-lg ${rolouX ? SOMBRA_COLUNA_FIXA : ''}`}
            style={{ maxHeight: alturaGrade ?? undefined }}
          >
            <table
              className="border-separate border-spacing-0 text-left text-xs"
              style={{ tableLayout: 'fixed', width: larguraTabela, minWidth: '100%' }}
            >
              <colgroup>
                <col style={{ width: LARGURA_PRIMEIRA }} />
                <col style={{ width: larguraTotal }} />
                {meses.map((m, i) => (
                  <col key={m} style={{ width: largurasMes[i] }} />
                ))}
              </colgroup>
              <thead>
                <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                  <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                    Centro de custo / Máscara / Conta
                  </th>
                  <th
                    className="sticky top-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-200 bg-blue-100 px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-blue-800"
                    style={{ left: LARGURA_PRIMEIRA }}
                    title="Soma dos meses do período"
                  >
                    Total
                  </th>
                  {meses.map((m) => (
                    <th
                      key={m}
                      title={m === mesAtual ? 'Mês atual' : undefined}
                      className={`sticky top-0 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 px-2 py-2.5 text-right text-xs font-medium uppercase tracking-wide ${
                        m === mesAtual ? 'bg-blue-100 font-semibold text-blue-800' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {rotuloMes(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {centros.length === 0 && (
                  <tr>
                    <td colSpan={meses.length + 2} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                      {filtroOrigens
                        ? 'Nenhuma conta com essa Origem DFC nos centros de custo.'
                        : 'Nenhum centro de custo com "Projeta DFC" marcado. Marque na aba Centros Custos.'}
                    </td>
                  </tr>
                )}
                {centros.map((centro) => {
                  const chaveCentro = `c${centro.sienge_id}`;
                  const { estrutura, todasContas, propria } = planosCentro[centro.sienge_id] || planoGlobal;
                  return (
                    <Fragment key={chaveCentro}>
                      {linhaGrupo({
                        chave: chaveCentro,
                        nivel: 0,
                        rotulo: `${centro.name}${propria ? ' · plano próprio' : ''}`,
                        podeAbrir: estrutura.length > 0,
                        destaque: true,
                        valorMes: (m) => somaContas(centro.sienge_id, todasContas, m),
                        valorMesVersao: (m) => somaContas(centro.sienge_id, todasContas, m, valorVersao),
                        dica: execucaoPorCentro[centro.sienge_id]
                          ? `Projeção CEF atualizada em ${new Date(execucaoPorCentro[centro.sienge_id].atualizado_em).toLocaleString('pt-BR')} (Parâmetros v${execucaoPorCentro[centro.sienge_id].versao_parametros})`
                          : undefined,
                      })}
                      {abertos.includes(chaveCentro) &&
                        estrutura.map((n1) => {
                          const chaveN1 = `${chaveCentro}|${n1.chave}`;
                          return (
                            <Fragment key={chaveN1}>
                              {linhaGrupo({
                                chave: chaveN1,
                                nivel: 1,
                                rotulo: n1.descricao,
                                contagem: n1.filhos.length,
                                podeAbrir: n1.filhos.length > 0,
                                destaque: true,
                                cinza: n1.semMascara,
                                valorMes: (m) => somaContas(centro.sienge_id, n1.contas, m),
                                valorMesVersao: (m) => somaContas(centro.sienge_id, n1.contas, m, valorVersao),
                              })}
                              {abertos.includes(chaveN1) &&
                                n1.filhos.map((n2) => {
                                  const chaveN2 = `${chaveN1}|${n2.chave}`;
                                  return (
                                    <Fragment key={chaveN2}>
                                      {linhaGrupo({
                                        chave: chaveN2,
                                        nivel: 2,
                                        rotulo: n2.descricao,
                                        contagem: n2.contas.length,
                                        podeAbrir: n2.contas.length > 0,
                                        cinza: n1.semMascara,
                                        valorMes: (m) => somaContas(centro.sienge_id, n2.contas, m),
                                        valorMesVersao: (m) => somaContas(centro.sienge_id, n2.contas, m, valorVersao),
                                      })}
                                      {abertos.includes(chaveN2) &&
                                        n2.contas.map((conta) => {
                                          // Digitável só na nova versão; numa versão salva, só leitura.
                                          const informada = previa && contaInformada(centro.sienge_id, conta.sienge_id);
                                          return (
                                            <tr key={`${chaveN2}|${conta.sienge_id}`} className="group/linha">
                                              <td
                                                className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pr-3 group-hover/linha:bg-gray-50"
                                                style={{ paddingLeft: RECUO[3] }}
                                              >
                                                <span className="flex min-w-0 items-center gap-2">
                                                  <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                                                    {codigoFormatado(conta)}
                                                  </span>
                                                  <span className="min-w-0 truncate text-xs text-gray-700" title={conta.name}>
                                                    {conta.name}
                                                  </span>
                                                </span>
                                              </td>
                                              {celulaTotal(
                                                3,
                                                (m) => valorConta(centro.sienge_id, conta.sienge_id, m),
                                                (m) => valorVersao(centro.sienge_id, conta.sienge_id, m)
                                              )}
                                              {informada
                                                ? meses.map((m) => (
                                                    <td
                                                      key={m}
                                                      className="border-b border-l border-gray-100 bg-white px-1 py-1 group-hover/linha:bg-gray-50"
                                                    >
                                                      <CelulaInformada
                                                        valor={rascunho(centro.sienge_id, conta.sienge_id, m)}
                                                        valorVersao={valorVersao(centro.sienge_id, conta.sienge_id, m)}
                                                        pendente={
                                                          centavos(rascunho(centro.sienge_id, conta.sienge_id, m)) !==
                                                          centavos(valorVersao(centro.sienge_id, conta.sienge_id, m))
                                                        }
                                                        onCommit={(novo) => salvarInformado(centro.sienge_id, conta.sienge_id, m, novo)}
                                                        onMenu={(e, valorDigitado) =>
                                                          abrirMenu(e, { centro, conta, mes: m, informada: true, valorDigitado })
                                                        }
                                                      />
                                                    </td>
                                                  ))
                                                : celulas(
                                                    3,
                                                    (m) => valorConta(centro.sienge_id, conta.sienge_id, m),
                                                    (e, m) => abrirMenu(e, { centro, conta, mes: m, informada: false }),
                                                    (m) => valorVersao(centro.sienge_id, conta.sienge_id, m)
                                                  )}
                                            </tr>
                                          );
                                        })}
                                    </Fragment>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

export default DfcOrcamentosTab;
