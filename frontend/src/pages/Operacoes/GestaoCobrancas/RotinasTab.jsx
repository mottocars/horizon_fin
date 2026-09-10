import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Clock, ListFilter, Mail, MessageCircle, Minus, Phone, Plus, Repeat, X } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import RegistrarComunicacaoModal from './RegistrarComunicacaoModal';
import HistoricoParcelaModal from './GestaoParcelas/HistoricoParcelaModal';
import { listRotinas, desmarcarCanalRotina } from '../../../api/rotinas.api';
import { listSiengeIntegracoes } from '../../../api/sienge.api';
import { CLUSTER_ICON, CLUSTER_ICON_COR, CLUSTER_TAG_ESTILO, formatarData, formatarMoeda } from './GestaoParcelas/constantes';

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
            temSelecao ? 'bg-primary-50 text-primary-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
        >
          <ListFilter size={13} />
        </button>
      )}
    />
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
function CheckboxCanal({ ativo, realizado, erro, mensagemErro, carregando, titulo, onClick }) {
  if (!ativo) return <span className="text-gray-300">—</span>;
  if (erro && !realizado) {
    return (
      <button
        type="button"
        onClick={onClick}
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

// A lista pessoal de tarefas do dia: Centro de Custo → 1 linha por parcela
// que entrou numa etapa sob responsabilidade do usuário logado dentro do
// período selecionado (ver rotinas.service.js::listRotinas — só etapas
// ativas, liberadas pra rotina e atribuídas a ele aparecem aqui). Sem nível
// à parte pro cliente: o nome dele já vem na própria linha do item, SEMPRE
// (mesmo quando o mesmo cliente aparece em mais de 1 linha seguida, por ter
// mais de uma etapa/parcela no período — omitir o nome nas linhas seguintes
// dava a falsa impressão de "cliente sem nome"). Centro de Custo continua
// sendo o agrupador de sempre, e os itens já nascem visíveis embaixo dele
// (sem precisar clicar) — diferente do accordion fechado por padrão de
// Gestão das Parcelas, porque aqui é uma lista de ação do dia, não uma
// matriz pra explorar aos poucos.
export default function RotinasTab({
  empresaId,
  centroCustoIds = [],
  dataInicio,
  dataFim,
  usuarioId = '',
  refreshToken = 0,
  comunicacaoAutomaticaAtiva = true,
}) {
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [centrosFechados, setCentrosFechados] = useState(new Set());
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

  // Opções das comboboxes acima — sempre a partir de `centros` cru (não do
  // já filtrado), pra lista de opções não encolher conforme o usuário vai
  // filtrando por outra coluna/canal.
  const opcoesClientes = useMemo(() => {
    const nomes = new Set();
    for (const centro of centros) {
      for (const item of centro.itens) nomes.add(nomeCliente(item));
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((nome) => ({ value: nome, label: nome }));
  }, [centros]);

  const opcoesEtapas = useMemo(() => {
    const nomes = new Set();
    for (const centro of centros) {
      for (const item of centro.itens) nomes.add(item.etapa_nome);
    }
    return [...nomes].sort(compararEtapas).map((nome) => ({ value: nome, label: nome }));
  }, [centros]);

  // Item + canal cujo modal de "Registrar" está aberto — guarda o item, o
  // canal (whatsapp/email/ligacao) e o nome do cliente (a linha não
  // carrega o objeto cliente inteiro).
  const [comunicacaoParaRegistrar, setComunicacaoParaRegistrar] = useState(null);

  // Clique no nome do cliente: abre o Histórico de Etapas — mesmo modal de
  // Gestão das Parcelas (HistoricoParcelaModal.jsx), sempre da parcela
  // daquela linha específica (bill_id/installment_id do próprio item
  // clicado). Antes precisava de uma escolha à parte quando o cliente tinha
  // mais de uma parcela na rotina — não precisa mais agora que a coluna
  // Título já mostra qual parcela é cada linha, sem ambiguidade nenhuma.
  const [parcelaHistorico, setParcelaHistorico] = useState(null);

  const requisicaoRef = useRef(0);

  // Referências dos <th> de Cliente/Etapa — passadas pra FiltroColuna
  // (via `colunaRef`) só pra o painel de filtro nascer com a mesma largura
  // da coluna (ver SearchableSelect.jsx::larguraRef), em vez da largura do
  // ícone que abre ele.
  const thClienteRef = useRef(null);
  const thEtapaRef = useRef(null);

  const carregar = useCallback(() => {
    if (!empresaId || !dataInicio || !dataFim) {
      setCentros([]);
      return;
    }
    const minhaRequisicao = ++requisicaoRef.current;
    setCarregando(true);
    setErro('');
    listRotinas(empresaId, { dataInicio, dataFim, costCenterIds: centroCustoIds, usuarioId })
      .then((resultado) => {
        if (minhaRequisicao !== requisicaoRef.current) return;
        setCentros(resultado.centros);
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

  function toggleCentro(id) {
    setCentrosFechados((atual) => {
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
  async function handleCliqueCanal(item, canal, clientName) {
    if (!realizadoDoCanal(item, canal)) {
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
  // cima do que veio do backend: filtra os itens do centro por
  // Cliente+Etapa+canal, descarta centro de custo sem nenhum item sobrando,
  // e recalcula o total do badge do centro pelo que sobrou (senão o número
  // do badge ficaria maior que a quantidade de linhas visíveis). A ordem
  // dos itens que sobram é a mesma que veio do backend (filter preserva
  // ordem) — já vem certa (etapa mais crítica, depois maior valor).
  const centrosFiltrados = useMemo(() => {
    return centros
      .map((centro) => {
        const itens = centro.itens.filter(
          (item) =>
            itemVisivel(item) &&
            (filtroCliente.length === 0 || filtroCliente.includes(nomeCliente(item))) &&
            (filtroEtapa.length === 0 || filtroEtapa.includes(item.etapa_nome))
        );
        return { ...centro, itens, total_itens: itens.length };
      })
      .filter((centro) => centro.itens.length > 0);
  }, [centros, itemVisivel, filtroCliente, filtroEtapa]);

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
  const primeiraCarga = carregando && centros.length === 0;
  const atualizandoEmSegundoPlano = carregando && centros.length > 0;
  const semDados = !carregando && !erro && centros.length === 0;
  const semResultadoFiltro = !carregando && !erro && !semDados && centrosFiltrados.length === 0;

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
              Nenhuma etapa sob sua responsabilidade tem parcela entrando no período selecionado.
            </p>
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${atualizandoEmSegundoPlano ? 'opacity-60' : ''}`}>
            {/* table-layout fixed + colgroup: sem isso, a largura de cada
                coluna é recalculada a partir do conteúdo das linhas
                visíveis — com o filtro de canal escondendo linhas (ou
                deixando 0), as colunas "encolhiam"/reposicionavam sozinhas.
                Com largura fixa por coluna, elas ficam do mesmo jeito
                sempre, com ou sem linha nenhuma na tela. */}
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col className="w-[26%]" />
                <col />
                <col className="w-[110px]" />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th ref={thClienteRef} className="py-3 pl-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <FiltroColuna
                        valor={filtroCliente}
                        onChange={setFiltroCliente}
                        opcoes={opcoesClientes}
                        label="cliente"
                        colunaRef={thClienteRef}
                      />
                      Cliente
                    </span>
                  </th>
                  <th ref={thEtapaRef} className="py-3 pl-4 font-medium">
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
                  <th className="whitespace-nowrap py-3 text-center font-medium">Valor</th>
                  <th className="whitespace-nowrap py-3 text-center font-medium">Título</th>
                  <th className="py-3 text-center font-medium">Vencimento</th>
                  <th className="py-3 text-center font-medium">Data</th>
                  <th className="py-3 text-center font-medium">
                    <BotaoFiltroCanal
                      canal="whatsapp"
                      ativo={canaisFiltro.whatsapp}
                      onClick={() => toggleFiltroCanal('whatsapp')}
                      Icone={MessageCircle}
                      label="WhatsApp"
                    />
                  </th>
                  <th className="py-3 text-center font-medium">
                    <BotaoFiltroCanal
                      canal="email"
                      ativo={canaisFiltro.email}
                      onClick={() => toggleFiltroCanal('email')}
                      Icone={Mail}
                      label="E-mail"
                    />
                  </th>
                  <th className="py-3 text-center font-medium">
                    <BotaoFiltroCanal
                      canal="ligacao"
                      ativo={canaisFiltro.ligacao}
                      onClick={() => toggleFiltroCanal('ligacao')}
                      Icone={Phone}
                      label="Ligação"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {semResultadoFiltro && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">Nenhuma linha corresponde aos filtros selecionados.</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-gray-400">
                        Ajuste os filtros de Cliente/Etapa ou ligue de novo o WhatsApp, o e-mail ou a ligação nos
                        botões do cabeçalho pra ver as linhas de novo.
                      </p>
                    </td>
                  </tr>
                )}
                {centrosFiltrados.map((centro) => {
                  const aberto = !centrosFechados.has(centro.cost_center_id);
                  return (
                    <Fragment key={centro.cost_center_id}>
                      <tr
                        onClick={() => toggleCentro(centro.cost_center_id)}
                        className={`cursor-pointer border-b border-gray-50 hover:bg-gray-100 ${aberto ? 'bg-gray-100 font-semibold' : ''}`}
                      >
                        <td className="py-3 pl-3 text-gray-900">
                          <span className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-500">
                              {aberto ? <Minus size={12} /> : <Plus size={12} />}
                            </span>
                            {centro.cost_center_name}
                            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                              {centro.total_itens}
                            </span>
                          </span>
                        </td>
                        <td colSpan={8}></td>
                      </tr>

                      {aberto &&
                        centro.itens.map((item) => {
                            const Icone = CLUSTER_ICON[item.cluster];
                            const chave = `${item.bill_id}-${item.installment_id}-${item.data}`;
                            return (
                              <tr
                                key={`${item.bill_id}-${item.installment_id}-${item.etapa_id}-${item.data}`}
                                className="border-b border-gray-50 hover:bg-gray-50"
                              >
                                <td
                                  onClick={() => handleCliqueCliente(item, item.client_name)}
                                  className="cursor-pointer py-2 pl-9 text-gray-900 hover:text-primary-700 hover:underline"
                                  title="Ver histórico de etapas"
                                >
                                  {item.client_name || `Cliente ${item.client_id}`}
                                </td>
                                <td className="py-2 pl-4 text-gray-700">
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${CLUSTER_TAG_ESTILO[item.cluster]}`}
                                      title={item.cluster}
                                    >
                                      {Icone && <Icone size={11} className={CLUSTER_ICON_COR[item.cluster]} />}
                                    </span>
                                    {item.etapa_nome}
                                  </span>
                                </td>
                                <td className="py-2 text-center text-xs font-medium text-gray-700">
                                  {formatarMoeda(item.valor)}
                                </td>
                                <td className="py-2 text-center text-xs text-gray-500">
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
                                <td className="py-2 text-center text-xs text-gray-500">{formatarData(item.due_date)}</td>
                                <td className="py-2 text-center text-xs text-gray-500">{formatarData(item.data)}</td>
                                <td className="py-2 text-center">
                                  {comunicacaoAutomaticaAtiva ? (
                                    <FlagCanal ativo={item.canal_whatsapp} realizado={item.whatsapp_enviado} />
                                  ) : (
                                    <CheckboxCanal
                                      ativo={item.canal_whatsapp}
                                      realizado={item.whatsapp_enviado}
                                      erro={item.whatsapp_erro}
                                      mensagemErro={item.whatsapp_erro_mensagem}
                                      carregando={alternando === `${chave}-whatsapp`}
                                      titulo={item.whatsapp_enviado ? 'WhatsApp registrado — clique para desmarcar' : 'Marcar WhatsApp como enviado'}
                                      onClick={() => handleCliqueCanal(item, 'whatsapp', item.client_name)}
                                    />
                                  )}
                                </td>
                                <td className="py-2 text-center">
                                  {comunicacaoAutomaticaAtiva ? (
                                    <FlagCanal ativo={item.canal_email} realizado={item.email_enviado} />
                                  ) : (
                                    <CheckboxCanal
                                      ativo={item.canal_email}
                                      realizado={item.email_enviado}
                                      erro={item.email_erro}
                                      mensagemErro={item.email_erro_mensagem}
                                      carregando={alternando === `${chave}-email`}
                                      titulo={item.email_enviado ? 'E-mail registrado — clique para desmarcar' : 'Marcar e-mail como enviado'}
                                      onClick={() => handleCliqueCanal(item, 'email', item.client_name)}
                                    />
                                  )}
                                </td>
                                <td className="py-2 text-center">
                                  <CheckboxCanal
                                    ativo={item.canal_ligacao}
                                    realizado={item.ligacao_realizada}
                                    carregando={alternando === `${chave}-ligacao`}
                                    titulo={item.ligacao_realizada ? 'Ligação registrada — clique para desmarcar' : 'Marcar ligação como realizada'}
                                    onClick={() => handleCliqueCanal(item, 'ligacao', item.client_name)}
                                  />
                                </td>
                              </tr>
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
        onRegistrado={carregar}
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
