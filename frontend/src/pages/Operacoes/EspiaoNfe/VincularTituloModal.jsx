import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Info,
  Link2,
  Link2Off,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import {
  desvincularTituloSiengeNota,
  listTitulosSiengeParaNota,
  vincularTituloSiengeNota,
} from '../../../api/espiao.api';
import logoSienge from '../../../assets/integracoes/sienge.svg';

// ─── formatação ────────────────────────────────────────────────────────────

function formatarMoeda(valor) {
  if (valor == null) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// 'YYYY-MM-DD' (data pura do Sienge) -> 'DD/MM/YYYY', sem passar por Date
// (evita o recuo de fuso que transformaria 01/09 em 31/08).
function formatarDataIso(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// CNPJ/CPF só com dígitos (o que sai da chave de acesso) -> com máscara.
function formatarDocumento(doc) {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '—';
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const semAcento = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// ─── sugestão ──────────────────────────────────────────────────────────────

// Como o backend avaliou cada título contra a nota (ver
// vinculo.service.js::avaliarSugestao).
const SUGESTAO = {
  forte: { rotulo: 'Nº e fornecedor conferem', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  numero: { rotulo: 'Nº confere', classe: 'bg-primary-50 text-primary-700 ring-primary-100' },
  fornecedor: { rotulo: 'Fornecedor confere', classe: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

const numeroConfere = (sugestao) => sugestao === 'forte' || sugestao === 'numero';
const fornecedorConfere = (sugestao) => sugestao === 'forte' || sugestao === 'fornecedor';

// ─── peças visuais ─────────────────────────────────────────────────────────

function Rotulo({ children }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{children}</p>;
}

function CartaoNota({ nota }) {
  const [copiado, setCopiado] = useState(false);
  const ehServico = nota.tipo === 'NFSE';
  const TipoIcon = ehServico ? Wrench : Package;

  function copiarChave() {
    navigator.clipboard?.writeText(nota.chaveAcesso).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <Rotulo>Nota fiscal recebida</Rotulo>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            ehServico ? 'bg-violet-50 text-violet-700' : 'bg-primary-50 text-primary-700'
          }`}
        >
          <TipoIcon size={11} />
          {ehServico ? 'Serviço · NFS-e' : 'Produto · NF-e'}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-gray-900" title={nota.emissor}>
        {nota.emissor || 'Emissor não informado'}
      </p>
      <p className="font-mono text-xs text-gray-500">{formatarDocumento(nota.documentoEmissor)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <Rotulo>Número</Rotulo>
          <p className="mt-0.5 font-mono text-sm text-gray-800">
            {nota.numero || '—'}
            {nota.serie && <span className="text-gray-400"> / {nota.serie}</span>}
          </p>
        </div>
        <div>
          <Rotulo>Emissão</Rotulo>
          <p className="mt-0.5 text-sm text-gray-800">{formatarDataIso(nota.dataEmissao)}</p>
        </div>
      </div>
      <div className="mt-3">
        <Rotulo>Chave de acesso</Rotulo>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-500" title={nota.chaveAcesso}>
            {nota.chaveAcesso}
          </p>
          <button
            type="button"
            onClick={copiarChave}
            title="Copiar chave"
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            {copiado ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartaoConsulta({ dados, carregando, onAtualizar }) {
  const parametros = dados?.parametros || {};
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <Rotulo>Consulta no Sienge</Rotulo>
        <button
          type="button"
          onClick={onAtualizar}
          disabled={carregando || !dados?.configurado}
          title="Buscar de novo no Sienge (ignora o cache de 2 minutos)"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary-600 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>
      <dl className="mt-3 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-gray-500">
            <FileText size={13} /> Documento
          </dt>
          <dd>
            {parametros.codigoDocumento ? (
              <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-gray-800 ring-1 ring-gray-200">
                {parametros.codigoDocumento}
              </span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-gray-500">
            <CalendarRange size={13} /> Período
          </dt>
          <dd className="text-xs font-medium text-gray-800">
            {formatarDataIso(parametros.dataInicio)} a {formatarDataIso(parametros.dataFim)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-gray-500">
            <img src={logoSienge} alt="" className="h-3.5 w-3.5" /> Ambiente
          </dt>
          <dd className="font-mono text-xs text-gray-800">{parametros.tenant || '—'}</dd>
        </div>
      </dl>
      <p className="mt-auto pt-3 text-[11px] text-gray-400">
        {carregando
          ? 'Consultando...'
          : dados?.consultadoEm
            ? `${dados.titulos.length.toLocaleString('pt-BR')} título(s) · consultado às ${new Date(dados.consultadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : ''}
      </p>
    </div>
  );
}

function BannerVinculoAtual({ vinculo, onDesvincular, desvinculando }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Link2 size={16} />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-emerald-800">
          Vinculada ao título <span className="font-mono">{vinculo.tituloId}</span>
          {vinculo.documentoNumero && (
            <>
              {' '}
              · {vinculo.documentoIdentificacao} <span className="font-mono">{vinculo.documentoNumero}</span>
            </>
          )}
          {vinculo.valor != null && <> · {formatarMoeda(vinculo.valor)}</>}
        </p>
        <p className="truncate text-xs text-emerald-700/80">
          {vinculo.credorNome || 'Fornecedor não informado'}
          {vinculo.credorDocumento && ` · ${vinculo.credorDocumento}`}
          {vinculo.vinculadoEm &&
            ` · vinculado em ${formatarDataHora(vinculo.vinculadoEm)}${vinculo.vinculadoPorNome ? ` por ${vinculo.vinculadoPorNome}` : ''}`}
        </p>
      </div>
      <Button variant="secondary" onClick={onDesvincular} loading={desvinculando} className="shrink-0">
        <Link2Off size={15} />
        Desvincular
      </Button>
    </div>
  );
}

function EstadoVazio({ Icon, tom = 'text-gray-300', titulo, texto, acao }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon size={28} className={`mb-3 ${tom}`} />
      <p className="text-sm font-semibold text-gray-900">{titulo}</p>
      {texto && <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

function LinhasCarregando() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-3">
          <span className="h-4 w-4 rounded-full bg-gray-200" />
          <span className="h-3 w-14 rounded bg-gray-200" />
          <span className="h-3 w-12 rounded bg-gray-100" />
          <span className="h-3 w-16 rounded bg-gray-100" />
          <span className="h-3 flex-1 rounded bg-gray-200" />
          <span className="h-3 w-20 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

// ─── janela ────────────────────────────────────────────────────────────────

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'sugeridos', rotulo: 'Sugeridos' },
  { id: 'disponiveis', rotulo: 'Disponíveis' },
];

// Janela de vinculação de uma nota recebida a um título do contas a pagar do
// Sienge (coluna VINCULAR da aba Recebidas). Lista todos os títulos do
// período da tela com o código de documento configurado pro tipo da nota
// (aba Configurações), já ordenados pelos que mais parecem ser desta nota
// (mesmo nº de documento e/ou mesmo fornecedor — ver
// vinculo.service.js::avaliarSugestao). O vínculo gravado é 1 título por
// nota, e um título não pode estar em duas notas.
export default function VincularTituloModal({ nota, dataInicio, dataFim, onClose, onVinculoAlterado, onIrParaConfiguracoes }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [desvinculando, setDesvinculando] = useState(false);
  const [erroAcao, setErroAcao] = useState('');

  function carregar({ atualizar = false } = {}) {
    if (!nota) return;
    setCarregando(true);
    setErro('');
    setErroAcao('');
    listTitulosSiengeParaNota(nota.id, { dataInicio, dataFim, atualizar })
      .then((resposta) => {
        setDados(resposta);
        // Já deixa marcado o título atual; sem vínculo, pré-seleciona a
        // sugestão forte quando ela é única e livre (o usuário só confirma).
        const atual = resposta.vinculoAtual?.tituloId ?? null;
        const fortes = resposta.titulos.filter((t) => t.sugestao === 'forte' && !t.vinculadoAOutraNota);
        setSelecionadoId(atual ?? (fortes.length === 1 ? fortes[0].id : null));
      })
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível consultar os títulos no Sienge.'))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    setDados(null);
    setBusca('');
    setFiltro('todos');
    setSelecionadoId(null);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota?.id]);

  const titulos = useMemo(() => dados?.titulos || [], [dados]);
  const contagem = useMemo(
    () => ({
      todos: titulos.length,
      sugeridos: titulos.filter((t) => t.sugestao).length,
      disponiveis: titulos.filter((t) => !t.vinculadoAOutraNota).length,
    }),
    [titulos]
  );

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    const termoDigitos = soDigitos(busca);
    return titulos.filter((t) => {
      if (filtro === 'sugeridos' && !t.sugestao) return false;
      if (filtro === 'disponiveis' && t.vinculadoAOutraNota) return false;
      if (!termo) return true;
      if (semAcento(t.fornecedor?.nome).includes(termo)) return true;
      if (String(t.id).includes(termo) || semAcento(t.documentoNumero).includes(termo)) return true;
      return termoDigitos.length >= 3 && soDigitos(t.fornecedor?.documento).includes(termoDigitos);
    });
  }, [titulos, busca, filtro]);

  const selecionado = titulos.find((t) => t.id === selecionadoId) || null;
  const vinculoAtual = dados?.vinculoAtual || null;
  const mesmoDoAtual = Boolean(vinculoAtual && selecionadoId === vinculoAtual.tituloId);

  async function handleVincular() {
    if (!selecionado || mesmoDoAtual) return;
    if (vinculoAtual) {
      const ok = await confirm({
        title: 'Trocar o título vinculado',
        description: `Esta nota está vinculada ao título ${vinculoAtual.tituloId}. Ele será substituído pelo título ${selecionado.id}.`,
        confirmLabel: 'Trocar',
      });
      if (!ok) return;
    }
    setGravando(true);
    setErroAcao('');
    try {
      const vinculo = await vincularTituloSiengeNota(nota.id, selecionado.id);
      onVinculoAlterado(nota, vinculo);
      onClose();
    } catch (err) {
      setErroAcao(err.response?.data?.message || 'Não foi possível vincular o título.');
    } finally {
      setGravando(false);
    }
  }

  async function handleDesvincular() {
    const ok = await confirm({
      title: 'Desvincular título',
      description: `A nota deixa de estar vinculada ao título ${vinculoAtual.tituloId} do Sienge. Nada é alterado no Sienge.`,
      confirmLabel: 'Desvincular',
      variant: 'warning',
    });
    if (!ok) return;
    setDesvinculando(true);
    setErroAcao('');
    try {
      await desvincularTituloSiengeNota(nota.id);
      onVinculoAlterado(nota, null);
      setDados((prev) => ({ ...prev, vinculoAtual: null }));
      setSelecionadoId(null);
    } catch (err) {
      setErroAcao(err.response?.data?.message || 'Não foi possível desvincular.');
    } finally {
      setDesvinculando(false);
    }
  }

  const titulo = (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
        <img src={logoSienge} alt="" className="h-5 w-5" />
      </span>
      <span>
        <span className="block leading-tight">Vincular ao contas a pagar</span>
        <span className="block text-xs font-normal text-gray-500">Escolha o título do Sienge que corresponde a esta nota</span>
      </span>
    </span>
  );

  let corpoLista;
  if (carregando && !dados) {
    corpoLista = (
      <>
        <p className="flex items-center gap-2 border-b border-gray-100 bg-primary-50/50 px-4 py-2.5 text-xs text-primary-700">
          <Loader2 size={13} className="animate-spin" />
          Buscando os títulos do período e os fornecedores no Sienge — a primeira consulta do período pode levar alguns segundos.
        </p>
        <LinhasCarregando />
      </>
    );
  } else if (erro) {
    corpoLista = (
      <EstadoVazio
        Icon={AlertTriangle}
        tom="text-red-400"
        titulo="Não foi possível consultar o Sienge"
        texto={erro}
        acao={
          <Button variant="secondary" onClick={() => carregar({ atualizar: true })}>
            <RefreshCw size={15} />
            Tentar de novo
          </Button>
        }
      />
    );
  } else if (dados && !dados.configurado) {
    corpoLista = (
      <EstadoVazio
        Icon={Settings}
        tom="text-amber-400"
        titulo={`Falta configurar o código do documento de notas de ${nota.tipo === 'NFSE' ? 'serviço' : 'produto'}`}
        texto="É por esse código que os títulos são buscados no contas a pagar do Sienge. Informe-o na aba Configurações desta tela."
        acao={
          <Button onClick={onIrParaConfiguracoes}>
            <Settings size={15} />
            Ir para Configurações
          </Button>
        }
      />
    );
  } else if (dados && titulos.length === 0) {
    corpoLista = (
      <EstadoVazio
        Icon={Search}
        titulo="Nenhum título encontrado no período"
        texto={`O Sienge não tem títulos com documento ${dados.parametros.codigoDocumento} emitidos entre ${formatarDataIso(dataInicio)} e ${formatarDataIso(dataFim)}. Ajuste a Data início/fim da tela e abra de novo.`}
      />
    );
  } else if (dados && visiveis.length === 0) {
    corpoLista = <EstadoVazio Icon={Search} titulo="Nenhum título corresponde à busca" texto="Tente outro termo ou troque o filtro." />;
  } else if (dados) {
    corpoLista = (
      <table className="w-full border-separate border-spacing-0 text-left text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '10%' }} />
          <col />
          <col style={{ width: '13%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="text-[11px] uppercase tracking-wide text-gray-400">
            <th className="border-b border-gray-200 py-2.5" />
            <th className="border-b border-gray-200 px-2 py-2.5 font-medium">Título</th>
            <th className="border-b border-gray-200 px-2 py-2.5 font-medium">Nº documento</th>
            <th className="border-b border-gray-200 px-2 py-2.5 font-medium">Emissão</th>
            <th className="border-b border-gray-200 px-2 py-2.5 font-medium">Fornecedor</th>
            <th className="border-b border-gray-200 px-2 py-2.5 text-right font-medium">Valor</th>
            <th className="border-b border-gray-200 px-3 py-2.5 font-medium">Conferência</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((t) => {
            const bloqueado = Boolean(t.vinculadoAOutraNota);
            const marcado = t.id === selecionadoId;
            const atual = vinculoAtual?.tituloId === t.id;
            const sugestao = SUGESTAO[t.sugestao];
            return (
              <tr
                key={t.id}
                onClick={() => !bloqueado && setSelecionadoId(t.id)}
                className={`transition-colors ${
                  bloqueado
                    ? 'cursor-not-allowed bg-gray-50/70 text-gray-400'
                    : marcado
                      ? 'cursor-pointer bg-primary-50'
                      : 'cursor-pointer hover:bg-gray-50'
                }`}
              >
                <td className={`border-b border-gray-100 py-2.5 text-center ${marcado ? 'border-l-2 border-l-primary-500' : ''}`}>
                  {bloqueado ? (
                    <Lock size={13} className="inline text-gray-300" />
                  ) : (
                    <span
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                        marcado ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {marcado && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                  )}
                </td>
                <td className="border-b border-gray-100 px-2 py-2.5 font-mono text-gray-700">
                  {t.id}
                  {atual && (
                    <span className="ml-1.5 rounded bg-emerald-100 px-1 py-px font-sans text-[10px] font-semibold text-emerald-700">
                      ATUAL
                    </span>
                  )}
                </td>
                <td
                  className={`border-b border-gray-100 px-2 py-2.5 font-mono ${
                    numeroConfere(t.sugestao) ? 'font-semibold text-emerald-700' : 'text-gray-700'
                  }`}
                >
                  {t.documentoNumero || '—'}
                </td>
                <td className="border-b border-gray-100 px-2 py-2.5 text-gray-600">{formatarDataIso(t.dataEmissao)}</td>
                <td className="border-b border-gray-100 px-2 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={`truncate ${fornecedorConfere(t.sugestao) ? 'font-semibold text-emerald-700' : bloqueado ? '' : 'text-gray-900'}`}
                      title={t.fornecedor?.nome || ''}
                    >
                      {t.fornecedor?.nome || 'Fornecedor não encontrado'}
                    </p>
                    {t.observacao && (
                      <span title={t.observacao} className="shrink-0 text-gray-300 hover:text-gray-500">
                        <Info size={12} />
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[11px] text-gray-400">{t.fornecedor?.documento || '—'}</p>
                </td>
                <td className="border-b border-gray-100 px-2 py-2.5 text-right tabular-nums text-gray-800">
                  {formatarMoeda(t.valor)}
                </td>
                <td className="border-b border-gray-100 px-3 py-2.5">
                  {bloqueado ? (
                    <span
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
                      title={`Já vinculado à nota ${t.vinculadoAOutraNota.numero || '—'} — ${t.vinculadoAOutraNota.emissor || ''}`}
                    >
                      <Lock size={10} className="shrink-0" />
                      Nota {t.vinculadoAOutraNota.numero || '—'}
                    </span>
                  ) : sugestao ? (
                    <span
                      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${sugestao.classe}`}
                    >
                      {t.sugestao === 'forte' && <Sparkles size={10} className="shrink-0" />}
                      {sugestao.rotulo}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const podeInteragir = dados?.configurado && titulos.length > 0;

  return (
    <Modal open={Boolean(nota)} onClose={onClose} title={titulo} maxWidthClass="max-w-6xl">
      {nota && (
        <div className="flex min-h-0 flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_300px]">
            <CartaoNota nota={dados?.nota || nota} />
            <CartaoConsulta dados={dados} carregando={carregando} onAtualizar={() => carregar({ atualizar: true })} />
          </div>

          {vinculoAtual && (
            <BannerVinculoAtual vinculo={vinculoAtual} onDesvincular={handleDesvincular} desvinculando={desvinculando} />
          )}

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200">
            {podeInteragir && (
              <div className="flex flex-col gap-2 border-b border-gray-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por título, nº do documento, fornecedor ou CPF/CNPJ"
                    className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-0.5">
                  {FILTROS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFiltro(f.id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        filtro === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {f.rotulo}
                      <span className={`ml-1 tabular-nums ${filtro === f.id ? 'text-primary-600' : 'text-gray-400'}`}>
                        {contagem[f.id].toLocaleString('pt-BR')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="max-h-[46vh] min-h-60 overflow-y-auto">{corpoLista}</div>
          </div>

          {/* Rodapé — resumo do que vai ser gravado + ações. */}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              {erroAcao ? (
                <p className="flex items-center gap-1.5 text-red-600">
                  <AlertTriangle size={15} className="shrink-0" />
                  {erroAcao}
                </p>
              ) : selecionado && !mesmoDoAtual ? (
                <p className="truncate text-gray-600">
                  <CheckCircle2 size={15} className="mr-1.5 inline text-primary-600" />
                  Título <span className="font-mono font-medium text-gray-900">{selecionado.id}</span> ·{' '}
                  {selecionado.documentoIdentificacao} <span className="font-mono">{selecionado.documentoNumero}</span> ·{' '}
                  {selecionado.fornecedor?.nome} · <span className="font-medium text-gray-900">{formatarMoeda(selecionado.valor)}</span>
                </p>
              ) : (
                <p className="text-gray-400">
                  {mesmoDoAtual ? 'Este já é o título vinculado. Escolha outro para trocar.' : 'Selecione um título na lista.'}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleVincular} loading={gravando} disabled={!selecionado || mesmoDoAtual || carregando}>
                <Link2 size={15} />
                {vinculoAtual ? 'Trocar título' : 'Vincular título'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
