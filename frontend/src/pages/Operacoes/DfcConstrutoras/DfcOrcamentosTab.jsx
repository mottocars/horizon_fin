import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Check, Loader2, Minimize2, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoProjecaoCef } from '../../../api/dfcProjecaoCef.api';
import { getAgingDfc } from '../../../api/dfcAging.api';
import {
  listOrcamentoInformadoDfc,
  replicarOrcamentoInformadoDfc,
  salvarOrcamentoInformadoDfc,
} from '../../../api/dfcOrcamentoInformado.api';
import ReplicarValorModal from './ReplicarValorModal';
import { ORIGEM_INFORMADO, interpretarValor } from './orcamentoValores';

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
// edição. Botão direito abre o "Replicar valor até" — com o que estiver digitado, se houver.
// Mesmo par de cores das outras abas: âmbar sem valor, azul claro com valor.
function CelulaInformada({ valor, onCommit, onReplicar }) {
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
      title="Botão direito: replicar valor até"
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
        onReplicar(atual);
      }}
      className={`h-7 w-full rounded-md border px-1.5 text-right text-xs tabular-nums outline-none transition-colors placeholder:text-gray-300 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 ${
        vazio ? 'border-amber-200 bg-amber-50' : 'border-primary-100 bg-primary-50'
      } ${!editando && !vazio && valor < 0 ? 'text-red-600' : 'text-gray-900'}`}
    />
  );
}

const LARGURA_PRIMEIRA = 360;
const LARGURA_MES = 92; // largura mínima de um mês; cresce pra caber o maior valor da coluna
const FOLGA_MES = 30; // padding da célula + borda + campo de digitação
const ALTURA_MINIMA_GRADE = 320;
// Sombra na borda da coluna congelada quando os meses rolaram pra esquerda (indica que há conteúdo
// por baixo dela, como nas planilhas).
const SOMBRA_COLUNA_FIXA = '[&_tr>*:first-child]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.25)]';

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
// célula, e o botão direito abre o "Replicar valor até".
// `telaCheia`: a grade ocupa a tela inteira (por cima do menu e do topo, e em tela cheia de verdade
// no navegador quando ele deixa); sai pelo botão "Sair da tela cheia" ou com Esc (`onSairTelaCheia`).
export default function DfcOrcamentosTab({ empresaId, inicio, fim, refreshToken = 0, telaCheia = false, onSairTelaCheia }) {
  const [dados, setDados] = useState(null);
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
      getAgingDfc(empresaId, 'receber'),
      getAgingDfc(empresaId, 'pagar'),
    ])
      .then(([centros, mascaras, contas, classificacoes, projecao, valoresInformados, agingReceber, agingPagar]) => {
        setDados({ centros, mascaras, contas: contas.data, classificacoes, projecao, agingReceber, agingPagar });
        setInformados(Object.fromEntries(valoresInformados.map((v) => [`${v.centro_id}|${v.sienge_id}|${v.mes}`, v.valor])));
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o orçamento.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setAbertos([]);
    setInformados({});
    setErroSalvar('');
    setSalvoAlgumaVez(false);
  }, [empresaId]);

  // Recarrega também depois de "Atualizar Projeção CEF" (refreshToken), mantendo o que está aberto.
  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);

  // Estrutura (máscara 1 > máscara 2 > contas) de cada plano: o Global e a versão própria de cada
  // centro que tem uma (aba Plano Contas) — o centro com versão própria usa a dele, os demais o Global.
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
      const contasDoPlano = analiticas.filter((c) => !foraDoDfc.has(c.sienge_id));
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

    return {
      centros: dados.centros.filter((c) => c.projeta_dfc).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      planoGlobal: montar(dados.classificacoes.global),
      planosCentro: Object.fromEntries(
        Object.entries(dados.classificacoes.centros).map(([id, lista]) => [id, { ...montar(lista), propria: true }])
      ),
    };
  }, [dados]);

  // A conta é "HORIZON - INFORMADO" no plano que o centro usa? (o valor vem da digitação)
  const contaInformada = useCallback(
    (sid, conta) => ((planosCentro[sid] || planoGlobal).origemDaConta[conta] ?? null) === ORIGEM_INFORMADO,
    [planosCentro, planoGlobal]
  );

  // Valores: centro -> conta -> mês -> valor — os informados nas contas "HORIZON - INFORMADO"; nas
  // demais, a Projeção CEF (contas CEF_*) e o Aging do Sienge (contas "SIENGE - AGING": a receber e
  // a pagar, somados — o pagar já vem negativo). Cada conta tem uma origem só, então todos dividem o
  // mesmo mapa. E quando cada obra foi projetada.
  const { valorConta, execucaoPorCentro } = useMemo(() => {
    const mapa = new Map();
    (dados?.projecao?.valores || []).forEach((v) => mapa.set(`${v.sienge_id}|${v.conta}|${v.mes}`, v.valor));
    [...(dados?.agingReceber?.valores || []), ...(dados?.agingPagar?.valores || [])].forEach((v) => {
      const chave = `${v.centro_id}|${v.conta}|${v.mes}`;
      mapa.set(chave, Math.round(((mapa.get(chave) || 0) + v.valor) * 100) / 100);
    });
    return {
      valorConta: (sid, conta, mes) =>
        contaInformada(sid, conta)
          ? (informados[`${sid}|${conta}|${mes}`] ?? null)
          : (mapa.get(`${sid}|${conta}|${mes}`) ?? null),
      execucaoPorCentro: Object.fromEntries((dados?.projecao?.execucoes || []).map((e) => [e.sienge_id, e])),
    };
  }, [dados, informados, contaInformada]);

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

  // Soma de várias contas num mês (null quando nenhuma tem valor).
  function somaContas(sid, contas, mes) {
    let total = null;
    contas.forEach((c) => {
      const v = valorConta(sid, c.sienge_id, mes);
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

  const replicandoRef = useRef(null);
  replicandoRef.current = replicando;

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
      // Com o "Replicar valor até" aberto, o Esc fecha só ele.
      if (replicandoRef.current) {
        setReplicando(null);
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
  const celulas = (nivel, valorMes) =>
    meses.map((m) => {
      const v = valorMes ? valorMes(m) : null;
      const vazio = v === null || v === 0;
      return (
        <td
          key={m}
          className={`border-b border-l px-2 text-right tabular-nums ${
            nivel === 0 ? 'border-gray-200 bg-gray-50 py-2 group-hover/linha:bg-gray-100' : 'border-gray-100 bg-white py-1.5 group-hover/linha:bg-gray-50'
          } ${vazio ? 'text-gray-300' : v < 0 ? 'text-red-600' : 'text-gray-800'} ${nivel <= 1 && !vazio ? 'font-semibold' : ''}`}
        >
          {vazio ? '—' : dinheiro(v)}
        </td>
      );
    });

  // Linha de agrupamento (centro, máscara 1, máscara 2) — função comum, não componente, pra não
  // ser recriada a cada render.
  function linhaGrupo({ chave, nivel, rotulo, contagem, podeAbrir, destaque = false, cinza = false, valorMes, dica }) {
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
        {celulas(nivel, valorMes)}
      </tr>
    );
  }

  const mesAtual = mesDeHoje();
  // Avisos da Projeção CEF + base do contas a receber / a pagar nunca carregada (o Aging fica zerado).
  const avisos = [
    ...(dados?.projecao?.avisos || []),
    ...[
      ['agingReceber', 'receber'],
      ['agingPagar', 'pagar'],
    ]
      .filter(([chave]) => dados?.[chave] && !dados[chave].base?.parcelas)
      .map(
        ([, tipo]) =>
          `A base do contas a ${tipo} do Sienge ainda não foi carregada — o Aging a ${tipo} fica sem valores. Atualize em Projeções.`
      ),
  ];
  const larguraTabela = LARGURA_PRIMEIRA + largurasMes.reduce((t, l) => t + l, 0);

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
            onClick={onSairTelaCheia}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minimize2 size={15} />
            Sair da tela cheia
          </button>
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
                {meses.map((m, i) => (
                  <col key={m} style={{ width: largurasMes[i] }} />
                ))}
              </colgroup>
              <thead>
                <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                  <th className="sticky left-0 top-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                    Centro de custo / Máscara / Conta
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
                    <td colSpan={meses.length + 1} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                      Nenhum centro de custo com &quot;Projeta DFC&quot; marcado. Marque na aba Centros Custos.
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
                                      })}
                                      {abertos.includes(chaveN2) &&
                                        n2.contas.map((conta) => {
                                          const informada = contaInformada(centro.sienge_id, conta.sienge_id);
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
                                              {informada
                                                ? meses.map((m) => (
                                                    <td
                                                      key={m}
                                                      className="border-b border-l border-gray-100 bg-white px-1 py-1 group-hover/linha:bg-gray-50"
                                                    >
                                                      <CelulaInformada
                                                        valor={valorConta(centro.sienge_id, conta.sienge_id, m)}
                                                        onCommit={(novo) => salvarInformado(centro.sienge_id, conta.sienge_id, m, novo)}
                                                        onReplicar={(valor) =>
                                                          setReplicando({
                                                            centroId: centro.sienge_id,
                                                            contaId: conta.sienge_id,
                                                            centroNome: centro.name,
                                                            contaRotulo: `${codigoFormatado(conta)} ${conta.name}`,
                                                            mes: m,
                                                            valor,
                                                          })
                                                        }
                                                      />
                                                    </td>
                                                  ))
                                                : celulas(3, (m) => valorConta(centro.sienge_id, conta.sienge_id, m))}
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
}
