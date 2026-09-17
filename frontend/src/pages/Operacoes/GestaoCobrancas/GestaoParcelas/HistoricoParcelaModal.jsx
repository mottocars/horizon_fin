import { useEffect, useState } from 'react';
import { Paperclip, UploadCloud, User, X } from 'lucide-react';
import Modal from '../../../../components/Modal';
import Button from '../../../../components/Button';
import {
  getHistoricoParcelaRegua,
  registrarObservacaoHistoricoRegua,
  baixarAnexoHistoricoRegua,
} from '../../../../api/reguaCobrancaHistorico.api';
import { listSiengeIntegracoes } from '../../../../api/sienge.api';
import { CLUSTER_LABEL, CLUSTER_TAG_ESTILO, CLUSTER_ICON, CLUSTER_ICON_COR, formatarData, formatarMoeda } from './constantes';

const TAMANHO_MAXIMO_ANEXO = 2 * 1024 * 1024;

// Canal de cada registro — mesmas 3 cores já usadas pros mesmos canais em
// RotinasTab.jsx::CORES_FILTRO_CANAL (duplicado aqui de propósito, mesma
// convenção do resto do projeto). Sem canal (observação simples, sem
// disparo nenhum) sempre vira "Observação Manual" — nunca fica em branco,
// pedido do usuário: "a comunicação deverá informar o canal".
const CANAL_LABEL = { whatsapp: 'WhatsApp', email: 'E-mail', ligacao: 'Ligação' };
const CANAL_ESTILO = {
  whatsapp: 'bg-emerald-50 text-emerald-600',
  email: 'bg-primary-50 text-primary-600',
  ligacao: 'bg-amber-50 text-amber-600',
};
function infoCanal(canal) {
  return { label: CANAL_LABEL[canal] || 'Observação Manual', className: canal ? CANAL_ESTILO[canal] : 'bg-gray-100 text-gray-600' };
}

// Os mesmos 4 status de GestaoParcelasTab.jsx::STATUS_PARCELA (duplicado
// aqui de propósito) — badge do cabeçalho, "herdado da tela anterior".
const STATUS_PARCELA = {
  em_dia: { label: 'Paga em Dia', className: 'bg-emerald-50 text-emerald-700' },
  atraso: { label: 'Paga com Atraso', className: 'bg-amber-50 text-amber-700' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-50 text-red-700' },
  a_vencer: { label: 'A vencer', className: 'bg-blue-50 text-blue-700' },
};

// Retrato de como a parcela estava no momento de CADA registro (não o
// status atual dela) — ver historicoCliente.service.js::
// montarRegistrosParcela. "Futura" não tem dias (ainda não venceu); em
// atraso/inadimplente sempre mostram há quantos dias.
const STATUS_NA_DATA = {
  futura: { label: 'Parcela futura', className: 'bg-blue-50 text-blue-700' },
  em_atraso: { label: 'Em atraso', className: 'bg-amber-50 text-amber-700' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-50 text-red-700' },
};
function infoStatusNaData(item) {
  const base = STATUS_NA_DATA[item.status_na_data];
  if (!base) return null;
  if (item.status_na_data === 'futura') return base;
  const dias = item.dias_na_data;
  return { ...base, label: `${base.label} (${dias} ${dias === 1 ? 'dia' : 'dias'})` };
}

// installment_number (sie_income) vem no formato "3/12" — mesmo helper de
// GestaoParcelasTab.jsx::numeroParcela, duplicado aqui de propósito. Só o
// número antes da barra, pra colar com bill_id no campo Título.
function numeroParcela(installmentNumber) {
  return String(installmentNumber ?? '').split('/')[0];
}

// Mesmo link de GestaoParcelasTab.jsx::urlTituloSienge — direto pro título
// dentro do Sienge de verdade (precisa do tenant da integração da empresa).
function urlTituloSienge(tenant, billId) {
  return `https://${tenant}.sienge.com.br/sienge/CRC/editTitulo.do?entity.tituloPK.nuTitulo=${billId}`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CampoCabecalho({ label, valor }) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{valor}</p>
    </div>
  );
}

// Avatar de quem registrou — usuário de verdade (iniciais ou foto) ou a
// logomarca do sistema quando é uma mensagem automática (tipo='automatico',
// sem usuario_id) — nunca deixar parecer que uma pessoa mandou uma
// mensagem que na verdade saiu sozinha pela régua.
function AvatarRegistro({ tipo, nome, avatarUrl }) {
  if (tipo === 'automatico') {
    return (
      <span
        title="Disparo automático do sistema"
        className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-gray-200"
      >
        <img src="/logomarca.svg" alt="" className="h-4 w-4" />
      </span>
    );
  }
  if (!nome) {
    return (
      <span
        title="Usuário removido"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400"
      >
        <User size={13} />
      </span>
    );
  }
  const iniciais = nome
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
  return (
    <span
      title={nome}
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700"
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : iniciais}
    </span>
  );
}

function ChipAnexo({ anexo, onBaixar }) {
  return (
    <button
      type="button"
      onClick={() => onBaixar(anexo)}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-primary-700"
      title={`Baixar ${anexo.nome_original}`}
    >
      <Paperclip size={11} />
      <span className="max-w-[10rem] truncate">{anexo.nome_original}</span>
    </button>
  );
}

// Cartão de 1 registro (manual, WhatsApp, e-mail ou ligação) — lista plana
// em ordem cronológica, sem mais agrupar por etapa da régua (saiu da tela).
// Os 2 badges (canal + retrato da parcela naquele momento) são o que
// substitui a etapa: mostram o que a etapa mostrava (onde a parcela estava)
// de um jeito direto, sem o funil.
function CartaoRegistro({ item, onBaixarAnexo }) {
  const automatico = item.tipo === 'automatico';
  const canal = infoCanal(item.canal);
  const statusNaData = infoStatusNaData(item);
  return (
    <div
      className={`flex gap-2.5 rounded-lg border-2 px-3 py-2 ${
        automatico ? 'border-primary-100 bg-primary-50/50' : 'border-gray-200 bg-gray-50'
      }`}
    >
      <AvatarRegistro tipo={item.tipo} nome={item.usuario_nome} avatarUrl={item.usuario_avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-gray-800">
            {item.usuario_nome || (automatico ? 'Sistema' : 'Usuário removido')}
          </p>
          <p className="shrink-0 text-[11px] text-gray-400">{formatarData(item.data_registro)}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${canal.className}`}>
            {canal.label}
          </span>
          {statusNaData && (
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${statusNaData.className}`}>
              {statusNaData.label}
            </span>
          )}
        </div>
        {item.descricao && <p className="mt-1.5 whitespace-pre-wrap text-xs text-gray-600">{item.descricao}</p>}
        {item.anexos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.anexos.map((anexo) => (
              <ChipAnexo key={anexo.id} anexo={anexo} onBaixar={onBaixarAnexo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Réplica do padrão de HistoricoEtapasModal.jsx (Repasses CEF): esquerda
// com os dados da parcela + formulário de registro, direita com o funil da
// régua rolável — mesmo `max-w-6xl` e mesma divisão de colunas que nunca
// deixa o modal inteiro rolar, só a coluna da direita quando não cabe.
// Sempre escopado a 1 PARCELA (bill_id+installment_id) — nunca ao cliente
// inteiro, que pode ter outras parcelas em etapas completamente diferentes.
export default function HistoricoParcelaModal({ open, onClose, empresaId, billId, installmentId, clientName }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);

  const [dataRegistro, setDataRegistro] = useState(hoje());
  const [descricao, setDescricao] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistrar, setErroRegistrar] = useState('');

  // Tenant da integração Sienge desta empresa — só pra montar o link do
  // campo Título (mesmo padrão de GestaoParcelasTab.jsx). Sem Sienge
  // configurado, o Título continua aparecendo, só sem virar link.
  const [siengeTenant, setSiengeTenant] = useState('');

  useEffect(() => {
    if (!open || !empresaId) {
      setSiengeTenant('');
      return;
    }
    let ativo = true;
    listSiengeIntegracoes({ ativo: true, limit: 100 })
      .then((resultado) => {
        if (!ativo) return;
        const integracao = resultado.data.find((i) => String(i.empresa_id) === String(empresaId));
        setSiengeTenant(integracao?.tenant || '');
      })
      .catch(() => {
        if (ativo) setSiengeTenant('');
      });
    return () => {
      ativo = false;
    };
  }, [open, empresaId]);

  function carregarHistorico() {
    if (!open || !billId || !installmentId) return undefined;
    setCarregando(true);
    setErro('');
    return getHistoricoParcelaRegua(empresaId, billId, installmentId)
      .then(setDados)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar o histórico.'))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    if (!open) return;
    setDados(null);
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId, billId, installmentId]);

  // Toda vez que o histórico chega (ou é atualizado depois de registrar
  // algo), o formulário volta pro estado em branco — pronto pro próximo
  // registro, que por padrão é "hoje".
  useEffect(() => {
    if (!dados) return;
    setDataRegistro(hoje());
    setDescricao('');
    setArquivos([]);
    setErroRegistrar('');
  }, [dados]);

  function handleEscolherArquivos(e) {
    const novos = Array.from(e.target.files || []);
    e.target.value = '';
    const grandes = novos.filter((f) => f.size > TAMANHO_MAXIMO_ANEXO);
    if (grandes.length > 0) {
      setErroRegistrar(`Arquivo${grandes.length > 1 ? 's' : ''} acima de 2MB: ${grandes.map((f) => f.name).join(', ')}`);
    } else {
      setErroRegistrar('');
    }
    setArquivos((prev) => [...prev, ...novos.filter((f) => f.size <= TAMANHO_MAXIMO_ANEXO)]);
  }

  function handleRemoverArquivo(nome) {
    setArquivos((prev) => prev.filter((f) => f.name !== nome));
  }

  async function handleRegistrar() {
    if (!dataRegistro) {
      setErroRegistrar('Informe a data.');
      return;
    }
    setRegistrando(true);
    setErroRegistrar('');
    try {
      await registrarObservacaoHistoricoRegua(empresaId, {
        billId,
        installmentId,
        dataRegistro,
        descricao,
        arquivos,
      });
      await carregarHistorico();
    } catch (err) {
      setErroRegistrar(err.response?.data?.message || 'Não foi possível registrar a observação.');
    } finally {
      setRegistrando(false);
    }
  }

  async function handleBaixarAnexo(anexo) {
    try {
      const blob = await baixarAnexoHistoricoRegua(empresaId, anexo.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = anexo.nome_original || 'anexo';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Falha silenciosa é aceitável aqui — mesmo critério de
      // HistoricoEtapasModal.jsx (não há onde reportar dentro do chip).
    }
  }

  const cluster = dados?.cluster;
  const Icone = cluster ? CLUSTER_ICON[cluster] : null;
  const statusParcela = dados?.parcela?.status ? STATUS_PARCELA[dados.parcela.status] : null;
  // Só uma das 3 colunas vem preenchida por vez (mesmo trio de
  // GestaoParcelasTab.jsx) — mostra a que corresponde ao status desta
  // parcela, nunca as 3 juntas.
  const valorParcela = dados?.parcela
    ? dados.parcela.status === 'inadimplente'
      ? dados.parcela.valor_vencido
      : dados.parcela.status === 'a_vencer'
        ? dados.parcela.valor_a_vencer
        : dados.parcela.valor_pago
    : 0;
  // Sem observação nova pra parcela já paga (em dia ou com atraso) — pedido
  // do usuário; o histórico já registrado antes continua sempre visível
  // (ver dados.registros abaixo), só o formulário some.
  const podeRegistrar = dados?.parcela && dados.parcela.status !== 'em_dia' && dados.parcela.status !== 'atraso';

  return (
    <Modal open={open} onClose={onClose} title="Histórico da Parcela" maxWidthClass="max-w-6xl">
      {carregando ? (
        <div className="flex min-h-[32rem] items-center justify-center text-sm text-gray-400">
          Carregando histórico...
        </div>
      ) : erro ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>
      ) : dados ? (
        <div className="flex min-h-0 flex-col gap-6 sm:flex-1 sm:flex-row">
          {/* Coluna esquerda: dados da parcela + formulário de registro —
              sempre sem rolagem própria, cresce naturalmente com o
              conteúdo. */}
          <div className="space-y-3 sm:w-1/2 sm:shrink-0 sm:border-r-2 sm:border-gray-200 sm:pr-6">
            <div>
              <p className="text-base font-semibold text-gray-900">{dados.cliente?.name || clientName || `Cliente ${dados.parcela?.client_id}`}</p>
              {/* Cluster do cliente, status (pago/em atraso/inadimplente/a
                  vencer) e valor — as mesmas 3 informações já visíveis na
                  linha desta parcela em Gestão das Parcelas, herdadas aqui
                  no cabeçalho (pedido do usuário). */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {cluster && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${CLUSTER_TAG_ESTILO[cluster]}`}
                  >
                    {Icone && <Icone size={13} className={CLUSTER_ICON_COR[cluster]} />}
                    {CLUSTER_LABEL[cluster]}
                  </span>
                )}
                {statusParcela && (
                  <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${statusParcela.className}`}>
                    {statusParcela.label}
                  </span>
                )}
                {dados.parcela && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                    title="Valor desta parcela"
                  >
                    {formatarMoeda(valorParcela)}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border-2 border-gray-200 p-3">
              <CampoCabecalho label="Telefone" valor={dados.cliente?.telefone} />
              <CampoCabecalho label="E-mail" valor={dados.cliente?.email} />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Título</p>
                {dados.parcela && (
                  <p className="mt-0.5 text-sm font-medium">
                    {siengeTenant ? (
                      <a
                        href={urlTituloSienge(siengeTenant, dados.parcela.bill_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir título no Sienge"
                        className="text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {dados.parcela.bill_id} / {numeroParcela(dados.parcela.installment_number)}
                      </a>
                    ) : (
                      <span className="text-gray-900">
                        {dados.parcela.bill_id} / {numeroParcela(dados.parcela.installment_number)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <CampoCabecalho label="Vencimento" valor={dados.parcela ? formatarData(dados.parcela.due_date) : ''} />
            </div>

            {podeRegistrar && (
              <div className="rounded-lg border-2 border-gray-200 p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">Registrar observação</p>
                <div className="space-y-2.5">
                  {/* Sem seleção de etapa: uma observação manual não depende
                      de nenhuma etapa da régua (só WhatsApp/e-mail dependem,
                      pro template — ver
                      historicoCliente.service.js::registrarObservacao) —
                      não precisa perguntar. */}
                  <div className="w-[9.5rem]">
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Data</label>
                    <input
                      type="date"
                      value={dataRegistro}
                      onChange={(e) => setDataRegistro(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Observação
                    </label>
                    <textarea
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      rows={3}
                      placeholder="O que foi feito/conversado (opcional)"
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="historico-parcela-anexos"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                    >
                      <UploadCloud size={14} />
                      Anexar arquivos (até 2MB cada)
                    </label>
                    <input
                      id="historico-parcela-anexos"
                      type="file"
                      multiple
                      onChange={handleEscolherArquivos}
                      className="hidden"
                    />
                    {arquivos.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {arquivos.map((f) => (
                          <div
                            key={f.name}
                            className="flex items-center justify-between gap-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Paperclip size={11} className="shrink-0" />
                              <span className="truncate">{f.name}</span>
                              <span className="shrink-0 text-gray-400">({formatarTamanho(f.size)})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoverArquivo(f.name)}
                              className="shrink-0 text-gray-400 hover:text-red-600"
                              title="Remover"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {erroRegistrar && <p className="text-xs text-red-600">{erroRegistrar}</p>}

                  <div className="flex justify-end">
                    <Button type="button" onClick={handleRegistrar} loading={registrando}>
                      Registrar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita: rolagem independente — só ela absorve o
              aperto quando o histórico não cabe (ver comentário detalhado
              em HistoricoEtapasModal.jsx). Lista plana (sem funil de
              etapas) — cada cartão já carrega o canal e o retrato da
              parcela naquele momento (ver CartaoRegistro). O histórico
              continua aparecendo mesmo pra parcela paga (só o formulário
              acima é que some). */}
          <div className="sm:flex sm:w-1/2 sm:min-h-0 sm:flex-col">
            <p className="mb-3 shrink-0 text-sm font-semibold text-gray-900">Histórico de observações</p>
            <div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:pr-2">
              {dados.registros.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma observação registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {dados.registros.map((item) => (
                    <CartaoRegistro key={item.id} item={item} onBaixarAnexo={handleBaixarAnexo} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
