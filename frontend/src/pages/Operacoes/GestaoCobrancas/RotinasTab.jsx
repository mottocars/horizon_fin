import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Check, CheckCircle2, Clock, ListFilter, Mail, MessageCircle, Minus, Phone, Plus, Repeat, X } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import RegistrarComunicacaoModal from './RegistrarComunicacaoModal';
import CobrancaEmMassaModal from './CobrancaEmMassaModal';
import RedistribuirClienteModal from './RedistribuirClienteModal';
import HistoricoParcelaModal from './GestaoParcelas/HistoricoParcelaModal';
import ComposicaoValor, { somarComposicoes } from './ComposicaoValor';
import { listRotinas, desmarcarCanalRotina } from '../../../api/rotinas.api';
import { listSiengeIntegracoes } from '../../../api/sienge.api';
import { CLUSTER_ICON, CLUSTER_ICON_COR, CLUSTER_TAG_ESTILO, formatarData } from './GestaoParcelas/constantes';
import { CABECALHO_TABELA as CAB } from './ClustersCobranca/constantes';

// Mesma grade da tabela da Gestão das Parcelas (GestaoParcelasTab.jsx):
// divisores de linha e de coluna no mesmo tom, e a borda de baixo do
// cabeçalho fixo mais grossa pra marcar o limite durante a rolagem.
const DIV_H = 'border-b border-gray-200';
const DIV_V = 'border-l border-gray-200';
const TOTAL_COLUNAS = 10;

// Valores sem centavos e clicáveis (composição do valor) — ComposicaoValor.jsx, o mesmo da Gestão das Parcelas.

// Nome de exibição do cliente — mesmo fallback usado na célula da tabela
// (linha 434 aprox.) — centralizado aqui porque o filtro de coluna precisa
// comparar exatamente a mesma string que aparece na tela.
function nomeCliente(item) {
  return item.client_name || `Cliente ${item.client_id}`;
}

// installment_number (sie_income) vem no formato "12/23" (parcela 12 de
// 23) — a coluna Título só mostra o número da parcela em si, antes da
// barra; sem barra nenhuma no valor, devolve como veio.
function numeroParcela(installmentNumber) {
  return String(installmentNumber ?? '').split('/')[0];
}

// Link direto pro título dentro do Sienge de verdade — precisa do tenant
// da integração Sienge desta empresa (ver useEffect de siengeTenant mais
// abaixo) + o bill_id da linha (é o que o Sienge chama de "nuTitulo").
function urlTituloSienge(tenant, billId) {
  return `https://${tenant}.sienge.com.br/sienge/CRC/editTitulo.do?entity.tituloPK.nuTitulo=${billId}`;
}

// Ordena etapas pela "distância do vencimento" (D-10, D-5, D0, D+5, D+10...)
// em vez de alfabética pura — alfabético colocaria "D+10" antes de "D+5"
// (comparação de string, '1' < '5'). Etapa que não bate no padrão "D±N" cai
// pro fim, em ordem alfabética entre si.
function compararEtapas(a, b) {
  const numA = a.match(/^D([+-]?\d+)/)?.[1];
  const numB = b.match(/^D([+-]?\d+)/)?.[1];
  if (numA !== undefined && numB !== undefined) return Number(numA) - Number(numB);
  if (numA !== undefined) return -1;
  if (numB !== undefined) return 1;
  return a.localeCompare(b, 'pt-BR');
}

// Ícone pequeno ao lado do nome da coluna (Cliente/Etapa) — abre a mesma
// combobox com busca + checkbox já usada em outros filtros do sistema (ver
// SearchableSelect.jsx, `multiple`), só que como gatilho compacto (sem a
// caixa de seleção inteira) via `renderTrigger`. Mesma convenção da
// "Centro de Custo" no topo da tela: array vazio = sem filtro (mostra
// tudo); selecionar valores restringe só a eles.
function FiltroColuna({ valor, onChange, opcoes, label, colunaRef }) {
  return (
    <SearchableSelect
      multiple
      value={valor}
      onChange={onChange}
      options={opcoes}
      placeholder="Todos"
      emptyMessage="Nenhuma opção encontrada."
      larguraRef={colunaRef}
      renderTrigger={({ toggle, temSelecao }) => (
        <button
          type="button"
          onClick={toggle}
          title={`Filtrar por ${label}`}
          aria-pressed={temSelecao}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
            temSelecao ? 'bg-white text-primary-600 ring-1 ring-primary-200' : 'text-blue-400 hover:bg-blue-100 hover:text-blue-700'
          }`}
        >
          <ListFilter size={13} />
        </button>
      )}
    />
  );
}

// Totais das linhas de Responsável e de Centro de Custo: valor e quantidade
// de títulos no período. Cada parcela conta 1 vez só, mesmo aparecendo em
// mais de uma linha (rateio em 2 centros de custo, ou 2 etapas dentro do
// período).
function totaisDoResponsavel(centros) {
  const parcelas = new Map();
  let itens = 0;
  for (const centro of centros) {
    for (const item of centro.itens) {
      itens++;
      parcelas.set(`${item.bill_id}|${item.installment_id}`, item);
    }
  }
  const unicas = [...parcelas.values()];
  return {
    itens,
    titulos: parcelas.size,
    valor: unicas.reduce((s, i) => s + (Number(i.valor) || 0), 0),
    // A conta do total (clique no valor): soma das composições de cada parcela.
    composicao: somarComposicoes(unicas.map((i) => i.composicao)),
  };
}

// Selo pequeno ao lado do nome do cliente, só na Distribuição automática:
// "cobertura" (cliente da carteira de alguém de férias) e "previsão" (dia
// ainda não distribuído — o dono vem da carteira atual).
function SeloDistribuicao({ item }) {
  if (item.distribuicao_prevista) {
    return (
      <span
        title="Este dia ainda não foi distribuído. O responsável mostrado é uma previsão pela carteira atual."
        className="ml-2 rounded border border-gray-200 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-400"
      >
        previsão
      </span>
    );
  }
  if (item.distribuicao_motivo === 'cobertura') {
    return (
      <span
        title="Cliente da carteira de um atendente que está fora (férias). Volta para ele no retorno."
        className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-700"
      >
        cobertura
      </span>
    );
  }
  return null;
}

// Percentual concluído de um canal num conjunto de itens — só conta os itens
// que têm aquele canal na etapa (os que aparecem como "—" ficam de fora).
// `null` quando nenhum item do conjunto usa o canal.
function progressoDoCanal(itens, canal) {
  const aplicaveis = itens.filter((item) =>
    canal === 'whatsapp' ? item.canal_whatsapp : canal === 'email' ? item.canal_email : item.canal_ligacao
  );
  if (aplicaveis.length === 0) return null;
  const feitos = aplicaveis.filter((item) => realizadoDoCanal(item, canal)).length;
  return { feitos, total: aplicaveis.length, pct: Math.round((feitos / aplicaveis.length) * 100) };
}

// Selo de % concluído nas linhas de Responsável e de Centro de Custo, na
// mesma coluna do canal:
// verde quando tudo foi feito, âmbar no meio do caminho, cinza em 0%.
function ProgressoCanal({ progresso, label }) {
  if (!progresso) return <span className="text-gray-300">—</span>;
  const { feitos, total, pct } = progresso;
  const cor =
    pct === 100
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : pct > 0
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-gray-50 text-gray-500 ring-gray-200';
  return (
    <span
      title={`${label}: ${feitos} de ${total} concluído(s)`}
      className={`inline-flex min-w-[2.75rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ${cor}`}
    >
      {pct}%
    </span>
  );
}

// Estado "realizado" de cada canal do item — nomes de campo inconsistentes
// de propósito (espelham o vocabulário de cada um: WhatsApp/E-mail
// "enviado", Ligação "realizada" — ver rotinas.service.js::listRotinas),
// centralizado aqui pra quem usa não precisar saber os 3 nomes de campo.
function realizadoDoCanal(item, canal) {
  if (canal === 'whatsapp') return item.whatsapp_enviado;
  if (canal === 'email') return item.email_enviado;
  return item.ligacao_realizada;
}

function ativoNoCanal(item, canal) {
  if (canal === 'whatsapp') return item.canal_whatsapp;
  if (canal === 'email') return item.canal_email;
  return item.canal_ligacao;
}

// Identifica a linha (mesma chave do <tr>) — a seleção por arraste guarda
// linhas, não parcelas: a mesma parcela pode aparecer em 2 linhas (2 etapas
// no período), e cada linha ganha o seu registro.
function chaveLinha(item) {
  return `${item.bill_id}-${item.installment_id}-${item.etapa_id}-${item.data}`;
}

// Flag de status de WhatsApp/E-mail: só leitura, usada quando a empresa
// está com "Ativar Comunicação Automática" LIGADA (ver
// ConfiguracoesGlobaisPainel.jsx) — o disparo é responsabilidade do
// sistema, aqui só mostra se já saiu. Relógio âmbar enquanto pendente,
// check verde quando enviado. Desligada a automação, estas 2 colunas
// viram checkbox (CheckboxCanal) igual à Ligação — ver comunicacaoAutomaticaAtiva
// mais abaixo. Canal que nem existe nesta etapa nem vira flag: só um
// travessão apagado, pra manter as colunas alinhadas sem sugerir uma
// pendência que não existe.
function FlagCanal({ ativo, realizado }) {
  if (!ativo) return <span className="text-gray-300">—</span>;
  return (
    <span
      title={realizado ? 'Enviado' : 'Pendente'}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
        realizado ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-amber-200 bg-amber-50 text-amber-600'
      }`}
    >
      {realizado ? <Check size={13} /> : <Clock size={13} />}
    </span>
  );
}

// Ligação é a única ação que sempre depende de uma pessoa — por isso nunca
// é uma flag de status como a de cima, é uma caixinha de checkbox de
// verdade: vazia enquanto pendente, marcada (preenchida + check) quando
// realizada. WhatsApp/E-mail viram esta mesma caixinha quando a empresa
// está com "Ativar Comunicação Automática" desligada (ver
// ConfiguracoesGlobaisPainel.jsx) — sem disparo automático de verdade
// rodando, o responsável precisa confirmar que mandou, igual à Ligação.
// Clicar pra marcar abre o modal de observação (ver
// RegistrarComunicacaoModal.jsx); clicar de novo pra desmarcar é direto,
// sem modal.
// `erro` é pra quando JÁ TENTOU enviar e não conseguiu (hoje só WhatsApp —
// telefone errado/sem WhatsApp, conexão Z-API fora do ar etc., ver
// zapi.service.js/historicoCliente.service.js) — bem diferente de
// "pendente" (quadradinho vazio, nunca tentou ainda). Clicar em cima
// funciona igual ao pendente: abre o modal de novo pra tentar mandar outra
// vez (`realizado` continua false nos dois casos).
// `onMouseDown`/`selecionado`: seleção por arraste da cobrança em massa (ver
// iniciarArraste em RotinasTab) — enquanto arrasta, as caixinhas já
// selecionadas ficam destacadas em azul.
function CheckboxCanal({ ativo, realizado, erro, mensagemErro, carregando, titulo, onClick, onMouseDown, selecionado = false }) {
  if (!ativo) return <span className="text-gray-300">—</span>;
  if (selecionado && !realizado) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseDown={onMouseDown}
        title={titulo}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border-2 border-primary-500 bg-primary-100 text-primary-600"
      >
        <Check size={11} strokeWidth={3} />
      </button>
    );
  }
  if (erro && !realizado) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseDown={onMouseDown}
        disabled={carregando}
        title={mensagemErro ? `Falhou: ${mensagemErro} — clique para tentar de novo` : 'Falhou ao enviar — clique para tentar de novo'}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border-2 border-red-500 bg-red-50 text-red-600 transition disabled:cursor-wait disabled:opacity-50"
      >
        <X size={12} strokeWidth={3} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={carregando}
      title={titulo}
      className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded border-2 transition disabled:cursor-wait disabled:opacity-50 ${
        realizado ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white hover:border-primary-300'
      }`}
    >
      {realizado && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

// Botão de filtro por canal nos cabeçalhos da tabela (WhatsApp/E-mail/
// Ligação) — mesma paleta de cores já usada pra estes 3 canais na Régua de
// Cobrança (ver ReguaCobranca/EtapasTabela.jsx::Flag: zap=verde, mail=azul
// da marca, call=âmbar), só que aqui o botão não liga/desliga o canal de
// uma etapa — ele liga/desliga um FILTRO da tela inteira (ver
// canalVisivel abaixo). Ativado (cor) por padrão; clicar desativa (cinza).
const CORES_FILTRO_CANAL = {
  whatsapp: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  email: 'border-primary-100 bg-primary-50 text-primary-600',
  ligacao: 'border-amber-200 bg-amber-50 text-amber-600',
};

function BotaoFiltroCanal({ canal, ativo, onClick, Icone, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={`${label} — clique para ${ativo ? 'ocultar' : 'mostrar de novo' } as linhas deste canal`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded border transition ${
        ativo ? CORES_FILTRO_CANAL[canal] : 'border-gray-200 bg-gray-50 text-gray-300'
      }`}
    >
      <Icone size={13} />
    </button>
  );
}

// A lista de tarefas do dia: Responsável → Centro de Custo → 1 linha por
// parcela. O nível de Responsável mostra, nas colunas Valor e Título, o
// total da carteira dele no período (pra comparar os atendentes lado a lado
// na visão "Todos os responsáveis" — Master/Administrador da tela); as demais
// colunas ficam em branco nesse nível. Abaixo, o desenho de sempre:
// Centro de Custo → 1 linha por parcela
// que entrou numa etapa sob responsabilidade do usuário logado dentro do
// período selecionado (ver rotinas.service.js::listRotinas — só etapas
// ativas, liberadas pra rotina e atribuídas a ele aparecem aqui). Sem nível
// à parte pro cliente: o nome dele já vem na própria linha do item, SEMPRE
// (mesmo quando o mesmo cliente aparece em mais de 1 linha seguida, por ter
// mais de uma etapa/parcela no período — omitir o nome nas linhas seguintes
// dava a falsa impressão de "cliente sem nome"). Centro de Custo continua
// sendo o agrupador abaixo do Responsável. O drilldown nasce recolhido
// (pedido do usuário), igual ao accordion de Gestão das Parcelas: primeiro
// se vê o resumo de cada responsável, e abre-se só o que interessa.
// Data só vale com ano de 4 dígitos "razoável" — o <input type="date"> dispara
// onChange a cada dígito do ano (0002, 0020, 0202...), e esses períodos
// intermediários varrem a carteira inteira à toa.
function dataValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor || '') && Number(valor.slice(0, 4)) >= 2000;
}

// Espera o usuário parar de mexer na data antes de pedir os dados.
function useDataEstavel(valor, espera = 600) {
  const [estavel, setEstavel] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setEstavel(valor), espera);
    return () => clearTimeout(t);
  }, [valor, espera]);
  return dataValida(estavel) ? estavel : '';
}

export default function RotinasTab({
  empresaId,
  centroCustoIds = [],
  dataInicio: dataInicioBruta,
  dataFim: dataFimBruta,
  usuarioId = '',
  refreshToken = 0,
  comunicacaoAutomaticaAtiva = true,
  tipoComunicacao = 'automatica',
  // Usuário Administrador da Gestão de Cobranças desta empresa ou Master —
  // só ele vê a coluna "Redistribuir" (e só na Distribuição automática).
  podeRedistribuir = false,
}) {
  const dataInicio = useDataEstavel(dataInicioBruta);
  const dataFim = useDataEstavel(dataFimBruta);
  const [responsaveis, setResponsaveis] = useState([]);
  const [modo, setModo] = useState('etapa');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  // Linhas abertas — chave `r:<responsável>` (nível 1) ou
  // `c:<responsável>|<centro>` (nível 2). Tudo nasce recolhido; as chaves
  // não dependem dos dados, então o que foi aberto continua aberto quando a
  // lista recarrega (ex.: depois de confirmar um WhatsApp).
  const [abertos, setAbertos] = useState(new Set());
  const [alternando, setAlternando] = useState(null);

  // Tenant da integração Sienge desta empresa — só pra montar o link do
  // Título (ver urlTituloSienge acima). O endpoint de listagem não tem
  // filtro por empresa específica no backend (só restringe às empresas do
  // próprio usuário), então busca até 100 e acha a desta empresa aqui —
  // tranquilo pro tamanho de integrações que este sistema tem hoje.
  // Some (link vira texto puro) se a empresa não tiver Sienge configurado.
  const [siengeTenant, setSiengeTenant] = useState('');

  useEffect(() => {
    if (!empresaId) {
      setSiengeTenant('');
      return;
    }
    let active = true;
    listSiengeIntegracoes({ ativo: true, limit: 100 })
      .then((resultado) => {
        if (!active) return;
        const integracao = resultado.data.find((i) => String(i.empresa_id) === String(empresaId));
        setSiengeTenant(integracao?.tenant || '');
      })
      .catch(() => {
        if (active) setSiengeTenant('');
      });
    return () => {
      active = false;
    };
  }, [empresaId]);

  // Filtro por canal dos cabeçalhos (ver BotaoFiltroCanal acima) — os 3
  // começam ligados (nada escondido). Independe do estado de "realizado"
  // de cada linha: é só sobre quais canais o usuário quer ver na tela.
  const [canaisFiltro, setCanaisFiltro] = useState({ whatsapp: true, email: true, ligacao: true });

  function toggleFiltroCanal(canal) {
    setCanaisFiltro((atual) => ({ ...atual, [canal]: !atual[canal] }));
  }

  // Uma linha só some quando TODOS os canais que ela de fato tem (os que
  // não aparecem como "—") estiverem com o filtro desligado — ex.: uma
  // linha só com WhatsApp aplicável some assim que o filtro de WhatsApp é
  // desligado; uma linha com WhatsApp+Ligação só some quando os dois
  // filtros estiverem desligados. Linha sem nenhum canal aplicável (os 3
  // "—") não é afetada por este filtro — não há o que filtrar nela.
  const itemVisivel = useCallback(
    (item) => {
      const aplicaveis = [
        ['whatsapp', item.canal_whatsapp],
        ['email', item.canal_email],
        ['ligacao', item.canal_ligacao],
      ].filter(([, ativo]) => ativo);
      if (aplicaveis.length === 0) return true;
      return aplicaveis.some(([canal]) => canaisFiltro[canal]);
    },
    [canaisFiltro]
  );

  // Filtro de coluna (Cliente/Etapa, ver FiltroColuna acima) — mesma
  // convenção do "Centro de Custo" do topo da tela: array vazio = sem
  // filtro (mostra tudo), selecionar valores restringe só a eles.
  const [filtroCliente, setFiltroCliente] = useState([]);
  const [filtroEtapa, setFiltroEtapa] = useState([]);

  // Opções das comboboxes acima — sempre a partir de `responsaveis` cru (não do
  // já filtrado), pra lista de opções não encolher conforme o usuário vai
  // filtrando por outra coluna/canal.
  const todosItens = useMemo(() => responsaveis.flatMap((r) => r.centros.flatMap((c) => c.itens)), [responsaveis]);

  const opcoesClientes = useMemo(() => {
    const nomes = new Set();
    for (const item of todosItens) nomes.add(nomeCliente(item));
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((nome) => ({ value: nome, label: nome }));
  }, [todosItens]);

  const opcoesEtapas = useMemo(() => {
    const nomes = new Set();
    for (const item of todosItens) nomes.add(item.etapa_nome);
    return [...nomes].sort(compararEtapas).map((nome) => ({ value: nome, label: nome }));
  }, [todosItens]);

  // Item + canal cujo modal de "Registrar" está aberto — guarda o item, o
  // canal (whatsapp/email/ligacao) e o nome do cliente (a linha não
  // carrega o objeto cliente inteiro).
  const [comunicacaoParaRegistrar, setComunicacaoParaRegistrar] = useState(null);

  // Cobrança em massa (pedido do usuário, 17/11 — mesmo gesto da seleção de
  // notas do Espião NF-e/NFS-e): apertar o botão na caixinha de um canal
  // ainda pendente e arrastar para baixo seleciona os títulos seguintes do
  // MESMO cliente (dentro do mesmo Responsável → Centro de Custo, que é o
  // grupo em que as linhas dele ficam juntas, ver rotinas.service.js); linha
  // de outro cliente, já realizada ou sem aquele canal é ignorada. Ao soltar:
  // 1 título só = o modal normal de sempre; 2 ou mais = CobrancaEmMassaModal
  // (1 mensagem com todos, sem boleto, e 1 registro por linha).
  // Ref (não state) pro que muda a cada linha percorrida; o state só pinta
  // as caixinhas selecionadas.
  const arrasteRef = useRef(null); // { canal, grupo, itens: Map<chaveLinha, item> } | null
  const [selecaoArraste, setSelecaoArraste] = useState(null); // { canal, chaves: Set } | null
  const [cobrancaEmMassa, setCobrancaEmMassa] = useState(null); // { canal, itens, clientName } | null

  function iniciarArraste(e, item, canal, grupo) {
    if (e.button !== 0 || realizadoDoCanal(item, canal)) return;
    // Sem isso o navegador começa a selecionar texto ao arrastar.
    e.preventDefault();
    const itens = new Map([[chaveLinha(item), item]]);
    arrasteRef.current = { canal, grupo, itens };
    setSelecaoArraste({ canal, chaves: new Set(itens.keys()) });
  }

  function continuarArraste(item, grupo) {
    const arraste = arrasteRef.current;
    if (!arraste || arraste.grupo !== grupo) return;
    if (!ativoNoCanal(item, arraste.canal) || realizadoDoCanal(item, arraste.canal)) return;
    const chave = chaveLinha(item);
    if (arraste.itens.has(chave)) return;
    arraste.itens.set(chave, item);
    setSelecaoArraste({ canal: arraste.canal, chaves: new Set(arraste.itens.keys()) });
  }

  // Soltar o botão em qualquer lugar encerra o arraste. Enquanto arrasta,
  // chegar perto da borda de cima/baixo do <main> (quem rola a página) rola
  // a tela sozinho — mesmo comportamento do Espião NF-e/NFS-e.
  useEffect(() => {
    let posicaoY = null;
    const main = document.querySelector('main');
    function aoMover(e) {
      posicaoY = arrasteRef.current ? e.clientY : null;
    }
    function aoSoltar() {
      const arraste = arrasteRef.current;
      posicaoY = null;
      if (!arraste) return;
      arrasteRef.current = null;
      const itens = [...arraste.itens.values()];
      if (itens.length === 1) {
        setSelecaoArraste(null);
        setComunicacaoParaRegistrar({ item: itens[0], canal: arraste.canal, clientName: itens[0].client_name });
      } else {
        // A seleção continua pintada enquanto o modal está aberto.
        setCobrancaEmMassa({ canal: arraste.canal, itens, clientName: itens[0].client_name });
      }
    }
    const intervalo = setInterval(() => {
      if (posicaoY == null || !main) return;
      const { top, bottom } = main.getBoundingClientRect();
      if (posicaoY > bottom - 48) main.scrollBy(0, 14);
      else if (posicaoY < top + 48) main.scrollBy(0, -14);
    }, 16);
    window.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseup', aoSoltar);
    };
  }, []);

  function fecharCobrancaEmMassa() {
    setCobrancaEmMassa(null);
    setSelecaoArraste(null);
  }

  function selecionadoNoArraste(item, canal) {
    return Boolean(selecaoArraste && selecaoArraste.canal === canal && selecaoArraste.chaves.has(chaveLinha(item)));
  }

  // Clique no nome do cliente: abre o Histórico de Etapas — mesmo modal de
  // Gestão das Parcelas (HistoricoParcelaModal.jsx), sempre da parcela
  // daquela linha específica (bill_id/installment_id do próprio item
  // clicado). Antes precisava de uma escolha à parte quando o cliente tinha
  // mais de uma parcela na rotina — não precisa mais agora que a coluna
  // Título já mostra qual parcela é cada linha, sem ambiguidade nenhuma.
  const [parcelaHistorico, setParcelaHistorico] = useState(null);

  // Cliente cujo "Redistribuir" foi clicado (última coluna, ver
  // RedistribuirClienteModal.jsx): { clientId, clientName, responsavelAtualId }.
  const [clienteRedistribuir, setClienteRedistribuir] = useState(null);

  const requisicaoRef = useRef(0);

  // Referências dos <th> de Cliente/Etapa — passadas pra FiltroColuna
  // (via `colunaRef`) só pra o painel de filtro nascer com a mesma largura
  // da coluna (ver SearchableSelect.jsx::larguraRef), em vez da largura do
  // ícone que abre ele.
  const thClienteRef = useRef(null);
  const thEtapaRef = useRef(null);

  const carregar = useCallback(() => {
    if (!empresaId || !dataInicio || !dataFim) {
      setResponsaveis([]);
      return;
    }
    const minhaRequisicao = ++requisicaoRef.current;
    setCarregando(true);
    setErro('');
    listRotinas(empresaId, { dataInicio, dataFim, costCenterIds: centroCustoIds, usuarioId })
      .then((resultado) => {
        if (minhaRequisicao !== requisicaoRef.current) return;
        setResponsaveis(resultado.responsaveis);
        setModo(resultado.modo);
      })
      .catch((err) => {
        if (minhaRequisicao === requisicaoRef.current) {
          setErro(err.response?.data?.message || 'Não foi possível carregar as rotinas.');
        }
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoRef.current) setCarregando(false);
      });
  }, [empresaId, dataInicio, dataFim, centroCustoIds, usuarioId]);

  // `refreshToken` não entra no corpo de `carregar` — só precisa disparar
  // o efeito de novo toda vez que o botão "Sincronizar" terminar uma ação,
  // já que a tela lê tudo ao vivo e não teria outro jeito de saber que o
  // banco mudou (mesmo padrão de ClustersCobranca/CentrosCustoResumo.jsx).
  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  function alternar(id) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Clique na caixinha de Ligação (sempre) ou de WhatsApp/E-mail (só
  // quando a Comunicação Automática está desligada): se ainda não
  // realizada, abre o modal pra pedir a observação (ver
  // RegistrarComunicacaoModal.jsx) — só depois de registrar de verdade lá
  // é que o check acende. Já realizada, desmarcar é direto, sem modal
  // (mesmo espírito de "desfazer" simples).
  // Pendente + clique de mouse: quem abre o modal é o fim do arraste (ver
  // aoSoltar acima — um clique simples é um "arraste" de 1 título só); aqui
  // só sobra o teclado (Enter/Espaço, `e.detail === 0`).
  async function handleCliqueCanal(item, canal, clientName, e) {
    if (!realizadoDoCanal(item, canal)) {
      if (e?.detail > 0) return;
      setComunicacaoParaRegistrar({ item, canal, clientName });
      return;
    }
    const chave = `${item.bill_id}-${item.installment_id}-${item.data}-${canal}`;
    setAlternando(chave);
    try {
      await desmarcarCanalRotina(empresaId, { billId: item.bill_id, installmentId: item.installment_id, data: item.data, canal });
      await carregar();
    } finally {
      setAlternando(null);
    }
  }

  // Clique no nome do cliente numa linha: abre o Histórico de Etapas da
  // parcela DAQUELA linha específica (bill_id/installment_id do próprio
  // item clicado, o mesmo já mostrado na coluna Título) — sem precisar
  // perguntar qual parcela, mesmo quando o cliente tem mais de uma na
  // rotina, já que cada linha é inequívoca agora.
  function handleCliqueCliente(item, clientName) {
    setParcelaHistorico({ billId: item.bill_id, installmentId: item.installment_id, clientName });
  }

  // Aplica os 3 filtros (canal, Cliente, Etapa — todos em "E" entre si) por
  // cima do que veio do backend: filtra os itens de cada centro por
  // Cliente+Etapa+canal, descarta centro de custo (e responsável) sem nenhum
  // item sobrando, e recalcula o badge do centro e os totais do responsável
  // pelo que sobrou (senão os números ficariam maiores que as linhas
  // visíveis). A ordem dos itens que sobram é a mesma que veio do backend
  // (filter preserva ordem) — já vem certa (cliente com mais títulos, depois
  // maior D+N, depois maior valor; ver rotinas.service.js::listRotinas).
  const responsaveisFiltrados = useMemo(() => {
    return responsaveis
      .map((resp) => {
        const centrosResp = resp.centros
          .map((centro) => {
            const itens = centro.itens.filter(
              (item) =>
                itemVisivel(item) &&
                (filtroCliente.length === 0 || filtroCliente.includes(nomeCliente(item))) &&
                (filtroEtapa.length === 0 || filtroEtapa.includes(item.etapa_nome))
            );
            return { ...centro, itens, total_itens: itens.length, totais: totaisDoResponsavel([{ itens }]) };
          })
          .filter((centro) => centro.itens.length > 0);
        return {
          ...resp,
          centros: centrosResp,
          itens: centrosResp.flatMap((centro) => centro.itens),
          totais: totaisDoResponsavel(centrosResp),
        };
      })
      .filter((resp) => resp.centros.length > 0);
  }, [responsaveis, itemVisivel, filtroCliente, filtroEtapa]);

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <Repeat size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver sua rotina do dia.</p>
      </Card>
    );
  }

  // Só mostra o "Carregando..." (que substitui a tabela inteira por um
  // placeholder bem baixinho) na PRIMEIRA carga — quando já existe uma
  // lista na tela (ex.: recarregando depois de confirmar um WhatsApp/
  // e-mail/ligação, ver `onRegistrado={carregar}`), mantém a tabela antiga
  // visível (só um pouco esmaecida) até os dados novos chegarem. Sem isso,
  // a página desabava pra ~50px de altura a cada atualização e a barra de
  // rolagem voltava pro topo sozinha (o navegador não tem como preservar
  // uma posição de scroll que não existe mais no documento encolhido).
  const primeiraCarga = carregando && responsaveis.length === 0;
  const atualizandoEmSegundoPlano = carregando && responsaveis.length > 0;
  const semDados = !carregando && !erro && responsaveis.length === 0;
  const semResultadoFiltro = !carregando && !erro && !semDados && responsaveisFiltrados.length === 0;
  const nomeSemResponsavel = modo === 'automatica' ? 'A distribuir' : 'Sem responsável';
  // Coluna "Redistribuir": só Administrador/Master e só na Distribuição
  // automática (no modo "Responsável por etapa" quem atende é o da etapa —
  // não existe dono por cliente pra trocar).
  const mostrarRedistribuir = podeRedistribuir && modo === 'automatica';
  const totalColunas = TOTAL_COLUNAS + (mostrarRedistribuir ? 1 : 0);

  // Cabeçalho da 1ª coluna reage a quantos níveis estão abertos agora —
  // mesmo comportamento da Gestão das Parcelas.
  const chavesAbertas = [...abertos];
  const tituloColuna = chavesAbertas.some((k) => k.startsWith('c:'))
    ? 'Responsável / Centro de Custo / Cliente'
    : chavesAbertas.some((k) => k.startsWith('r:'))
      ? 'Responsável / Centro de Custo'
      : 'Responsável';

  return (
    <>
      <Card className="rounded-tl-none">
        {primeiraCarga ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>
        ) : semDados ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center text-center">
            <CheckCircle2 size={28} className="mb-3 text-emerald-300" />
            <p className="text-sm font-medium text-gray-700">Tudo em dia por aqui.</p>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              {modo === 'automatica'
                ? 'Nenhum cliente distribuído para este responsável no período selecionado.'
                : 'Nenhuma etapa sob sua responsabilidade tem parcela entrando no período selecionado.'}
            </p>
          </div>
        ) : (
          // Sem wrapper com overflow próprio (mesmo motivo de
          // GestaoParcelasTab.jsx): qualquer overflow aqui viraria o "teto"
          // do cabeçalho sticky. Quem rola é a página.
          <div className={`transition-opacity ${atualizandoEmSegundoPlano ? 'opacity-60' : ''}`}>
            {/* Mesmo desenho da tabela da Gestão das Parcelas: layout fixo
                com colunas em % (acompanha a largura do card, sem estourar),
                border-separate pras grades de linha (DIV_H) e coluna (DIV_V)
                ficarem previsíveis célula a célula, cabeçalho fixo com a
                borda de baixo mais grossa, fonte xs e valores sem centavos. */}
            <table className="w-full border-separate border-spacing-0 text-left text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col className={mostrarRedistribuir ? 'w-[23%]' : 'w-[27%]'} />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[4%]" />
                <col className="w-[8.5%]" />
                <col className="w-[8.5%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                {mostrarRedistribuir && <col className="w-[4%]" />}
              </colgroup>
              <thead className={CAB.thead}>
                <tr className={CAB.tr}>
                  <th ref={thClienteRef} className={`${CAB.th} py-2.5 pl-3 font-medium`}>
                    <span className="inline-flex items-center gap-1.5">
                      <FiltroColuna
                        valor={filtroCliente}
                        onChange={setFiltroCliente}
                        opcoes={opcoesClientes}
                        label="cliente"
                        colunaRef={thClienteRef}
                      />
                      {tituloColuna}
                    </span>
                  </th>
                  <th ref={thEtapaRef} className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 font-medium`}>
                    <span className="inline-flex items-center gap-1.5">
                      <FiltroColuna
                        valor={filtroEtapa}
                        onChange={setFiltroEtapa}
                        opcoes={opcoesEtapas}
                        label="etapa"
                        colunaRef={thEtapaRef}
                      />
                      Etapa
                    </span>
                  </th>
                  <th className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 text-center font-medium`}>Valor</th>
                  <th className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 text-center font-medium`}>Título</th>
                  <th className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 text-center font-medium`} title="Tipo da parcela no Sienge (passe o mouse na sigla para ver o nome)">
                    Tipo
                  </th>
                  <th className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 text-center font-medium`}>Vencimento</th>
                  <th className={`${CAB.th} ${CAB.divisor} px-2 py-2.5 text-center font-medium`}>Data</th>
                  <th className={`${CAB.th} ${CAB.divisor} py-2 text-center font-medium`}>
                    <BotaoFiltroCanal
                      canal="whatsapp"
                      ativo={canaisFiltro.whatsapp}
                      onClick={() => toggleFiltroCanal('whatsapp')}
                      Icone={MessageCircle}
                      label="WhatsApp"
                    />
                  </th>
                  <th className={`${CAB.th} ${CAB.divisor} py-2 text-center font-medium`}>
                    <BotaoFiltroCanal
                      canal="email"
                      ativo={canaisFiltro.email}
                      onClick={() => toggleFiltroCanal('email')}
                      Icone={Mail}
                      label="E-mail"
                    />
                  </th>
                  <th className={`${CAB.th} ${CAB.divisor} py-2 text-center font-medium`}>
                    <BotaoFiltroCanal
                      canal="ligacao"
                      ativo={canaisFiltro.ligacao}
                      onClick={() => toggleFiltroCanal('ligacao')}
                      Icone={Phone}
                      label="Ligação"
                    />
                  </th>
                  {mostrarRedistribuir && (
                    <th className={`${CAB.th} ${CAB.divisor} py-2.5 text-center font-medium`} title="Redistribuir o cliente para outra atendente">
                      <ArrowLeftRight size={14} className="inline" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {semResultadoFiltro && (
                  <tr>
                    <td colSpan={totalColunas} className={`${DIV_H} py-12 text-center text-sm text-gray-500`}>
                      <p className="font-medium text-gray-700">Nenhuma linha corresponde aos filtros selecionados.</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
                        Ajuste os filtros de Cliente/Etapa ou ligue de novo o WhatsApp, o e-mail ou a ligação nos
                        botões do cabeçalho pra ver as linhas de novo.
                      </p>
                    </td>
                  </tr>
                )}
                {responsaveisFiltrados.map((resp) => {
                  const chaveResp = `r:${resp.usuario_id ?? 'sem'}`;
                  const respAberto = abertos.has(chaveResp);
                  return (
                    <Fragment key={chaveResp}>
                      {/* Nível 1 — Responsável: total do período (valor,
                          títulos) e % concluído de cada canal. Branco
                          recolhido, cinza e negrito aberto. */}
                      <tr
                        onClick={() => alternar(chaveResp)}
                        className={`cursor-pointer hover:bg-gray-100 ${respAberto ? 'bg-gray-100 font-semibold' : ''}`}
                      >
                        <td className={`${DIV_H} py-3 pl-3 text-gray-900`}>
                          <span className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                              {respAberto ? <Minus size={10} /> : <Plus size={10} />}
                            </span>
                            <span className={resp.nome ? '' : 'text-amber-700'}>{resp.nome || nomeSemResponsavel}</span>
                          </span>
                        </td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3`}></td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center tabular-nums text-gray-700`}>
                          <ComposicaoValor valor={resp.totais.valor} composicao={resp.totais.composicao} />
                        </td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center tabular-nums text-gray-700`}>
                          {resp.totais.titulos} {resp.totais.titulos === 1 ? 'título' : 'títulos'}
                        </td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3`}></td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3`}></td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3`}></td>
                        <td className={`${DIV_H} ${DIV_V} py-3 text-center`}>
                          <ProgressoCanal progresso={progressoDoCanal(resp.itens, 'whatsapp')} label="WhatsApp" />
                        </td>
                        <td className={`${DIV_H} ${DIV_V} py-3 text-center`}>
                          <ProgressoCanal progresso={progressoDoCanal(resp.itens, 'email')} label="E-mail" />
                        </td>
                        <td className={`${DIV_H} ${DIV_V} py-3 text-center`}>
                          <ProgressoCanal progresso={progressoDoCanal(resp.itens, 'ligacao')} label="Ligação" />
                        </td>
                        {mostrarRedistribuir && <td className={`${DIV_H} ${DIV_V} py-3`}></td>}
                      </tr>

                      {respAberto &&
                        resp.centros.map((centro) => {
                          const chaveCentro = `c:${resp.usuario_id ?? 'sem'}|${centro.cost_center_id}`;
                          const centroAberto = abertos.has(chaveCentro);
                          return (
                            <Fragment key={chaveCentro}>
                              {/* Nível 2 — Centro de Custo: cinza claro, negrito aberto. */}
                              <tr
                                onClick={() => alternar(chaveCentro)}
                                className={`cursor-pointer bg-gray-50 hover:bg-gray-100 ${centroAberto ? 'font-semibold' : ''}`}
                              >
                                <td className={`${DIV_H} py-2.5 pl-9 text-gray-900`}>
                                  <span className="flex items-center gap-2">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                      {centroAberto ? <Minus size={10} /> : <Plus size={10} />}
                                    </span>
                                    {centro.cost_center_name}
                                  </span>
                                </td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5`}></td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center tabular-nums text-gray-700`}>
                                  <ComposicaoValor valor={centro.totais.valor} composicao={centro.totais.composicao} />
                                </td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center tabular-nums text-gray-700`}>
                                  {centro.totais.titulos} {centro.totais.titulos === 1 ? 'título' : 'títulos'}
                                </td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5`}></td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5`}></td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5`}></td>
                                <td className={`${DIV_H} ${DIV_V} py-2.5 text-center`}>
                                  <ProgressoCanal progresso={progressoDoCanal(centro.itens, 'whatsapp')} label="WhatsApp" />
                                </td>
                                <td className={`${DIV_H} ${DIV_V} py-2.5 text-center`}>
                                  <ProgressoCanal progresso={progressoDoCanal(centro.itens, 'email')} label="E-mail" />
                                </td>
                                <td className={`${DIV_H} ${DIV_V} py-2.5 text-center`}>
                                  <ProgressoCanal progresso={progressoDoCanal(centro.itens, 'ligacao')} label="Ligação" />
                                </td>
                                {mostrarRedistribuir && <td className={`${DIV_H} ${DIV_V} py-2.5`}></td>}
                              </tr>

                              {centroAberto &&
                                centro.itens.map((item) => {
                                  const Icone = CLUSTER_ICON[item.cluster];
                                  const chave = `${item.bill_id}-${item.installment_id}-${item.data}`;
                                  // Grupo do arraste da cobrança em massa: só o mesmo cliente
                                  // dentro deste Responsável → Centro de Custo.
                                  const grupo = `${resp.usuario_id ?? 'sem'}|${centro.cost_center_id}|${item.client_id}`;
                                  const linhaSelecionada = Boolean(selecaoArraste?.chaves.has(chaveLinha(item)));
                                  return (
                                    // Nível 3 — parcela: fundo branco (azul claro quando
                                    // selecionada no arraste da cobrança em massa).
                                    <tr
                                      key={chaveLinha(item)}
                                      onMouseEnter={() => continuarArraste(item, grupo)}
                                      className={linhaSelecionada ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'}
                                    >
                                      <td
                                        onClick={() => handleCliqueCliente(item, item.client_name)}
                                        className={`${DIV_H} cursor-pointer py-2 pl-16 text-gray-700 hover:text-primary-700 hover:underline`}
                                        title="Ver histórico de etapas"
                                      >
                                        {item.client_name || `Cliente ${item.client_id}`}
                                        <SeloDistribuicao item={item} />
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-gray-600`}>
                                        <span className="flex items-center gap-1.5">
                                          <span
                                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${CLUSTER_TAG_ESTILO[item.cluster]}`}
                                            title={item.cluster}
                                          >
                                            {Icone && <Icone size={11} className={CLUSTER_ICON_COR[item.cluster]} />}
                                          </span>
                                          <span className="truncate" title={item.etapa_nome}>
                                            {item.etapa_nome}
                                          </span>
                                        </span>
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center tabular-nums text-gray-700`}>
                                        <ComposicaoValor valor={item.valor} composicao={item.composicao} />
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} whitespace-nowrap px-2 py-2 text-center text-gray-500`}>
                                        {siengeTenant ? (
                                          <a
                                            href={urlTituloSienge(siengeTenant, item.bill_id)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            title="Abrir título no Sienge"
                                            className="text-primary-600 hover:text-primary-700 hover:underline"
                                          >
                                            {item.bill_id} / {numeroParcela(item.installment_number)}
                                          </a>
                                        ) : (
                                          <>
                                            {item.bill_id} / {numeroParcela(item.installment_number)}
                                          </>
                                        )}
                                      </td>
                                      {/* Tipo: sigla do tipo de parcela do Sienge (payment_term_id); o nome completo na dica. */}
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center`}>
                                        {item.payment_term_id ? (
                                          <span
                                            className="cursor-help font-mono text-xs font-semibold text-gray-600"
                                            title={item.payment_term_description || item.payment_term_id}
                                          >
                                            {item.payment_term_id}
                                          </span>
                                        ) : (
                                          <span className="text-gray-300">—</span>
                                        )}
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-gray-500`}>{formatarData(item.due_date)}</td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-gray-500`}>{formatarData(item.data)}</td>
                                      <td className={`${DIV_H} ${DIV_V} py-2 text-center`}>
                                        {comunicacaoAutomaticaAtiva ? (
                                          <FlagCanal ativo={item.canal_whatsapp} realizado={item.whatsapp_enviado} />
                                        ) : (
                                          <CheckboxCanal
                                            ativo={item.canal_whatsapp}
                                            realizado={item.whatsapp_enviado}
                                            erro={item.whatsapp_erro}
                                            mensagemErro={item.whatsapp_erro_mensagem}
                                            carregando={alternando === `${chave}-whatsapp`}
                                            titulo={item.whatsapp_enviado ? 'WhatsApp registrado — clique para desmarcar' : 'Enviar WhatsApp — segure e arraste para baixo para cobrar vários títulos deste cliente de uma vez'}
                                            onClick={(e) => handleCliqueCanal(item, 'whatsapp', item.client_name, e)}
                                            onMouseDown={(e) => iniciarArraste(e, item, 'whatsapp', grupo)}
                                            selecionado={selecionadoNoArraste(item, 'whatsapp')}
                                          />
                                        )}
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} py-2 text-center`}>
                                        {comunicacaoAutomaticaAtiva ? (
                                          <FlagCanal ativo={item.canal_email} realizado={item.email_enviado} />
                                        ) : (
                                          <CheckboxCanal
                                            ativo={item.canal_email}
                                            realizado={item.email_enviado}
                                            erro={item.email_erro}
                                            mensagemErro={item.email_erro_mensagem}
                                            carregando={alternando === `${chave}-email`}
                                            titulo={item.email_enviado ? 'E-mail registrado — clique para desmarcar' : 'Enviar e-mail — segure e arraste para baixo para cobrar vários títulos deste cliente de uma vez'}
                                            onClick={(e) => handleCliqueCanal(item, 'email', item.client_name, e)}
                                            onMouseDown={(e) => iniciarArraste(e, item, 'email', grupo)}
                                            selecionado={selecionadoNoArraste(item, 'email')}
                                          />
                                        )}
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} py-2 text-center`}>
                                        <CheckboxCanal
                                          ativo={item.canal_ligacao}
                                          realizado={item.ligacao_realizada}
                                          carregando={alternando === `${chave}-ligacao`}
                                          titulo={item.ligacao_realizada ? 'Ligação registrada — clique para desmarcar' : 'Registrar ligação — segure e arraste para baixo para cobrar vários títulos deste cliente de uma vez'}
                                          onClick={(e) => handleCliqueCanal(item, 'ligacao', item.client_name, e)}
                                          onMouseDown={(e) => iniciarArraste(e, item, 'ligacao', grupo)}
                                          selecionado={selecionadoNoArraste(item, 'ligacao')}
                                        />
                                      </td>
                                      {mostrarRedistribuir && (
                                        <td className={`${DIV_H} ${DIV_V} py-2 text-center`}>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setClienteRedistribuir({
                                                clientId: item.client_id,
                                                clientName: item.client_name,
                                                responsavelAtualId: resp.usuario_id,
                                              })
                                            }
                                            title={`Redistribuir ${item.client_name || 'este cliente'} para outra atendente`}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-400 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
                                          >
                                            <ArrowLeftRight size={13} />
                                          </button>
                                        </td>
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
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RegistrarComunicacaoModal
        open={Boolean(comunicacaoParaRegistrar)}
        onClose={() => setComunicacaoParaRegistrar(null)}
        empresaId={empresaId}
        item={comunicacaoParaRegistrar?.item}
        canal={comunicacaoParaRegistrar?.canal}
        clientName={comunicacaoParaRegistrar?.clientName}
        modoCopiar={tipoComunicacao === 'copiar'}
        onRegistrado={carregar}
      />

      <CobrancaEmMassaModal
        open={Boolean(cobrancaEmMassa)}
        onClose={fecharCobrancaEmMassa}
        empresaId={empresaId}
        canal={cobrancaEmMassa?.canal}
        itens={cobrancaEmMassa?.itens}
        clientName={cobrancaEmMassa?.clientName}
        onRegistrado={carregar}
      />

      <RedistribuirClienteModal
        open={Boolean(clienteRedistribuir)}
        onClose={() => setClienteRedistribuir(null)}
        empresaId={empresaId}
        clientId={clienteRedistribuir?.clientId}
        clientName={clienteRedistribuir?.clientName}
        responsavelAtualId={clienteRedistribuir?.responsavelAtualId}
        onRedistribuido={carregar}
      />

      <HistoricoParcelaModal
        open={Boolean(parcelaHistorico)}
        onClose={() => setParcelaHistorico(null)}
        empresaId={empresaId}
        billId={parcelaHistorico?.billId}
        installmentId={parcelaHistorico?.installmentId}
        clientName={parcelaHistorico?.clientName}
      />
    </>
  );
}
