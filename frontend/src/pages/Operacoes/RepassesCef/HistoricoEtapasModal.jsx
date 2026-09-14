import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Paperclip, X, UploadCloud, Save, User } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  getHistoricoEtapasRepassesCef,
  listUnidadesDisponiveisRepassesCef,
  atualizarNumeroInstituicaoFinanceiraRepassesCef,
  registrarMovimentacaoMicroEtapaRepassesCef,
  baixarAnexoMicroEtapaRepassesCef,
} from '../../../api/repassesCef.api';
import { listMascaras } from '../../../api/mascaras.api';

// `identificador.tipo` diz qual card originou o clique — decide qual
// parâmetro mandar pro backend resolver a cadeia inteira (ver
// getHistoricoEtapas no backend) e se a seção de editar o Número da
// Instituição Financeira aparece (só no bucket Contrato).
const PARAM_POR_TIPO = {
  reserva: (id) => ({ idreserva: id }),
  contrato: (id) => ({ siengeContractId: id }),
  assinatura: (id) => ({ extratoUnidadeId: id }),
  registro: (id) => ({ extratoUnidadeId: id }),
};

// Mesmo código usado como `grupo` em mascara_itens (ver
// frontend/src/config/macroEtapasRepasses.js) — decide de qual macro etapa
// vêm as micro etapas listadas no combobox do formulário de movimentação.
const GRUPO_POR_TIPO = {
  reserva: 'VENDA',
  contrato: 'CONTRATO',
  assinatura: 'ASSINATURA',
  registro: 'REGISTRO',
};

const TAMANHO_MAXIMO_ANEXO = 2 * 1024 * 1024;

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mesmo padrão de recorte de string usado no resto da tela (formatarData em
// RepassesCefPage.jsx) — evita o problema de fuso horário de
// `new Date(...).toLocaleDateString()` em colunas DATE/TIMESTAMP sem hora
// relevante.
function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

// Mesmo padrão "vazio = âmbar, preenchido = azul" do Motor de Risco (ver
// GestaoCobrancas/MotorRisco/estadoCampo.js), aplicado aqui aos campos
// obrigatórios do formulário de Registrar Movimentação — deixa óbvio de
// relance o que ainda falta preencher.
function estadoCampo(preenchido) {
  return preenchido
    ? 'border-primary-100 bg-primary-50 text-gray-900 hover:border-primary-500'
    : 'border-amber-300 bg-amber-50 text-gray-900 hover:border-amber-400';
}

// Converte os 8 dígitos digitados (ddmmaaaa) pra ISO só quando formam uma
// data de calendário válida (rejeita ex.: 31/02) — incompleto ou inválido
// vira '' (o campo conta como "vazio" pro estadoCampo acima e, por causa
// dele, também deixa a Descrição bloqueada, ver mais abaixo).
function digitosParaIso(digitos) {
  if (digitos.length !== 8) return '';
  const dia = Number(digitos.slice(0, 2));
  const mes = Number(digitos.slice(2, 4));
  const ano = Number(digitos.slice(4, 8));
  const data = new Date(ano, mes - 1, dia);
  const valida = data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
  return valida ? `${digitos.slice(4, 8)}-${digitos.slice(2, 4)}-${digitos.slice(0, 2)}` : '';
}

// Input de texto com máscara dd/mm/aaaa (em vez do <input type="date">
// nativo, que segue o locale do SO/navegador e pode sair mm/dd/aaaa) — só
// chama `onChange` com o ISO quando os 8 dígitos formam uma data válida;
// enquanto isso, propaga '' (ver digitosParaIso). Sem useEffect
// sincronizando de `value`: isso ecoaria '' de volta pro texto a cada tecla
// digitada, apagando o que a pessoa acabou de escrever. Reset externo (abrir
// outro card, ou depois de registrar) é feito via `key` no componente pai.
function CampoDataMovimentacao({ value, onChange, className }) {
  const [texto, setTexto] = useState(() => formatarData(value) || '');

  function handleChange(e) {
    const digitos = e.target.value.replace(/\D/g, '').slice(0, 8);
    setTexto([digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/'));
    onChange(digitosParaIso(digitos));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={texto}
      onChange={handleChange}
      className={className}
    />
  );
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

// Foto de quem registrou a movimentação — com iniciais de fallback quando
// não há avatar_url, e o nome aparece só ao passar o mouse (title nativo),
// no lugar do nome escrito ao lado como era antes.
function AvatarUsuario({ nome, avatarUrl }) {
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

// Cartão de uma micro etapa registrada manualmente, encaixado abaixo da
// macro etapa correspondente na timeline.
function CartaoMicroEtapa({ item, onBaixarAnexo }) {
  return (
    <div className="flex gap-2.5 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2">
      <AvatarUsuario nome={item.usuario_nome} avatarUrl={item.usuario_avatar_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-gray-800">{item.micro_etapa_nome}</p>
          <p className="shrink-0 text-[11px] text-gray-400">{formatarData(item.data_movimentacao)}</p>
        </div>
        {item.descricao && <p className="mt-1 text-xs text-gray-600">{item.descricao}</p>}
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

// Uma linha do funil: bolinha preenchida + linha conectora azul quando a
// etapa já foi alcançada, bolinha vazia + linha cinza quando ainda não —
// dá a noção de progresso completo do funil (Reserva → Registro), estilo
// timeline de CRM. As micro etapas registradas manualmente aparecem
// encaixadas logo abaixo, dentro da mesma etapa.
function LinhaTimeline({ item, ultima, onBaixarAnexo }) {
  const { etapa, data, alcancada, etapaAnterior, microetapas } = item;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            alcancada ? 'bg-primary-600' : 'bg-gray-100'
          }`}
        >
          {alcancada ? (
            <CheckCircle2 size={14} className="text-white" />
          ) : (
            <Circle size={10} className="text-gray-300" />
          )}
        </span>
        {!ultima && <span className={`mt-1 w-0.5 flex-1 ${alcancada ? 'bg-primary-200' : 'bg-gray-200'}`} />}
      </div>
      <div className={`w-full pb-5 ${alcancada ? '' : 'opacity-60'}`}>
        <p className="text-sm font-medium text-gray-900">
          {etapaAnterior ? `${etapaAnterior} → ${etapa}` : `Entrada em ${etapa}`}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {alcancada ? data ? formatarData(data) : 'Data não informada' : 'Ainda não chegou aqui'}
        </p>
        {microetapas?.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {microetapas.map((m) => (
              <CartaoMicroEtapa key={m.id} item={m} onBaixarAnexo={onBaixarAnexo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoricoEtapasModal({ open, onClose, empresaId, identificador, onSalvo }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);

  const [opcoesUnidade, setOpcoesUnidade] = useState([]);
  const [numeroSelecionado, setNumeroSelecionado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  // Formulário "Registrar Movimentação".
  const [opcoesMicroEtapa, setOpcoesMicroEtapa] = useState([]);
  const [microEtapaId, setMicroEtapaId] = useState('');
  const [dataMovimentacao, setDataMovimentacao] = useState('');
  const [descricaoMov, setDescricaoMov] = useState('');
  const [arquivosMov, setArquivosMov] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [erroRegistrar, setErroRegistrar] = useState('');
  // Força o remount de CampoDataMovimentacao (limpa o texto digitado) toda
  // vez que o formulário é resetado de fora — ver comentário no componente.
  const [dataFormKey, setDataFormKey] = useState(0);

  const ehContrato = identificador?.tipo === 'contrato';
  const grupoMicroEtapa = identificador ? GRUPO_POR_TIPO[identificador.tipo] : null;

  function carregarHistorico() {
    if (!identificador) return;
    setCarregando(true);
    setErro('');
    const params = PARAM_POR_TIPO[identificador.tipo](identificador.id);
    return getHistoricoEtapasRepassesCef(empresaId, params)
      .then(setDados)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar o histórico.'))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    if (!open || !identificador) return;
    setDados(null);
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId, identificador]);

  useEffect(() => {
    if (!open || !ehContrato) return;
    setErroSalvar('');
    setOpcoesUnidade([]);
    listUnidadesDisponiveisRepassesCef(empresaId, identificador.id).then(setOpcoesUnidade);
  }, [open, ehContrato, empresaId, identificador]);

  useEffect(() => {
    if (dados) setNumeroSelecionado(dados.cabecalho.numero_contrato_caixa || '');
  }, [dados]);

  // Reseta o formulário de movimentação e recarrega as opções de micro
  // etapa toda vez que o modal abre um card diferente — só as micro etapas
  // cadastradas na macro etapa atual do card (não permite escolher outra).
  useEffect(() => {
    if (!open || !grupoMicroEtapa) return;
    setMicroEtapaId('');
    setDataMovimentacao('');
    setDataFormKey((k) => k + 1);
    setDescricaoMov('');
    setArquivosMov([]);
    setErroRegistrar('');
    listMascaras('REPASSES', empresaId, grupoMicroEtapa).then(setOpcoesMicroEtapa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId, grupoMicroEtapa]);

  async function handleSalvarNumero() {
    if (!numeroSelecionado) {
      setErroSalvar('Selecione uma unidade.');
      return;
    }
    setSalvando(true);
    setErroSalvar('');
    try {
      await atualizarNumeroInstituicaoFinanceiraRepassesCef(empresaId, identificador.id, numeroSelecionado);
      onSalvo?.();
      onClose();
    } catch (err) {
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar na API do Sienge.');
    } finally {
      setSalvando(false);
    }
  }

  function handleEscolherArquivos(e) {
    const novos = Array.from(e.target.files || []);
    e.target.value = '';
    const grandes = novos.filter((f) => f.size > TAMANHO_MAXIMO_ANEXO);
    if (grandes.length > 0) {
      setErroRegistrar(`Arquivo${grandes.length > 1 ? 's' : ''} acima de 2MB: ${grandes.map((f) => f.name).join(', ')}`);
    } else {
      setErroRegistrar('');
    }
    setArquivosMov((prev) => [...prev, ...novos.filter((f) => f.size <= TAMANHO_MAXIMO_ANEXO)]);
  }

  function handleRemoverArquivo(nome) {
    setArquivosMov((prev) => prev.filter((f) => f.name !== nome));
  }

  async function handleRegistrarMovimentacao() {
    if (!microEtapaId) {
      setErroRegistrar('Selecione a micro etapa.');
      return;
    }
    if (!dataMovimentacao) {
      setErroRegistrar('Informe a data.');
      return;
    }
    setRegistrando(true);
    setErroRegistrar('');
    try {
      await registrarMovimentacaoMicroEtapaRepassesCef(empresaId, {
        idreserva: dados.cabecalho.numero_reserva,
        macroEtapa: grupoMicroEtapa,
        mascaraItemId: microEtapaId,
        dataMovimentacao,
        descricao: descricaoMov,
        arquivos: arquivosMov,
      });
      setMicroEtapaId('');
      setDataMovimentacao('');
      setDataFormKey((k) => k + 1);
      setDescricaoMov('');
      setArquivosMov([]);
      await carregarHistorico();
    } catch (err) {
      setErroRegistrar(err.response?.data?.message || 'Não foi possível registrar a movimentação.');
    } finally {
      setRegistrando(false);
    }
  }

  async function handleBaixarAnexo(anexo) {
    try {
      const blob = await baixarAnexoMicroEtapaRepassesCef(empresaId, anexo.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = anexo.nome_original || 'anexo';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Falha silenciosa é aceitável aqui — não há onde reportar dentro do chip.
    }
  }

  // `max-w-6xl` é ~50% mais largo que o `max-w-3xl` usado antes. As colunas
  // são esticadas pra mesma altura (`sm:h-full` na linha + `align-items`
  // padrão) de propósito: a esquerda nunca encolhe (`shrink-0`) e a
  // direita absorve todo o aperto por dentro de si mesma (`min-h-0` +
  // `flex-1` no miolo rolável) — assim só ela ganha barra de rolagem, só
  // quando o histórico de fato não cabe, nunca o modal inteiro.
  return (
    <Modal open={open} onClose={onClose} title="Histórico de Etapas" maxWidthClass="max-w-6xl">
      {carregando ? (
        <div className="flex min-h-[32rem] items-center justify-center text-sm text-gray-400">
          Carregando histórico...
        </div>
      ) : erro ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>
      ) : dados ? (
        <div className="flex min-h-0 flex-col gap-6 sm:flex-1 sm:flex-row">
          {/* Coluna esquerda (1/2): dados do card + edição do Nº Contrato
              Caixa (só vindo do bucket Contrato) + registrar movimentação.
              Sempre sem rolagem própria — cresce naturalmente com o
              conteúdo (`sm:shrink-0` recusa encolher; é a direita quem
              absorve o aperto quando falta espaço, ver comentário abaixo). */}
          <div className="space-y-3 sm:w-1/2 sm:shrink-0 sm:border-r-2 sm:border-gray-200 sm:pr-6">
            <div>
              <p className="text-base font-semibold text-gray-900">{dados.cabecalho.empreendimento || '—'}</p>
              {dados.cabecalho.cliente && <p className="mt-0.5 text-sm text-gray-600">{dados.cabecalho.cliente}</p>}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border-2 border-gray-200 p-3">
              <CampoCabecalho label="Nº Reserva" valor={dados.cabecalho.numero_reserva} />
              <CampoCabecalho label="Nº Contrato" valor={dados.cabecalho.numero_contrato} />
              {ehContrato ? (
                <div className="col-span-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Nº Contrato Caixa</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        value={numeroSelecionado}
                        onChange={setNumeroSelecionado}
                        options={opcoesUnidade.map((u) => ({
                          value: u.numero_contrato_unidade,
                          label: `${u.numero_contrato_unidade} - ${u.nome_mutuario || 'Sem nome'}`,
                        }))}
                        placeholder="Selecione a unidade..."
                        emptyMessage="Nenhuma unidade disponível."
                        corClasses={estadoCampo(Boolean(numeroSelecionado))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSalvarNumero}
                      disabled={salvando}
                      title="Salvar no Sienge"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                    >
                      <Save size={15} />
                    </button>
                  </div>
                  {erroSalvar && <p className="mt-1 text-xs text-red-600">{erroSalvar}</p>}
                </div>
              ) : (
                <CampoCabecalho label="Nº Contrato Caixa" valor={dados.cabecalho.numero_contrato_caixa} />
              )}
              <CampoCabecalho label="Data de Assinatura" valor={formatarData(dados.cabecalho.data_assinatura)} />
              <CampoCabecalho label="Data de Registro" valor={formatarData(dados.cabecalho.data_registro)} />
            </div>

            {dados.cabecalho.numero_reserva ? (
              <div className="rounded-lg border-2 border-gray-200 p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">Registrar Movimentação</p>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Micro Etapa
                      </label>
                      <SearchableSelect
                        value={microEtapaId}
                        onChange={setMicroEtapaId}
                        options={opcoesMicroEtapa.map((m) => ({ value: m.id, label: m.descricao }))}
                        placeholder="Selecione a micro etapa..."
                        emptyMessage="Nenhuma micro etapa cadastrada nesta etapa."
                        corClasses={estadoCampo(Boolean(microEtapaId))}
                      />
                    </div>

                    <div className="w-[9.5rem] shrink-0">
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        Data
                      </label>
                      <CampoDataMovimentacao
                        key={dataFormKey}
                        value={dataMovimentacao}
                        onChange={setDataMovimentacao}
                        className={`w-full rounded-lg border px-2 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampo(Boolean(dataMovimentacao))}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Descrição
                    </label>
                    <textarea
                      value={descricaoMov}
                      onChange={(e) => setDescricaoMov(e.target.value)}
                      rows={3}
                      disabled={!dataMovimentacao}
                      placeholder={dataMovimentacao ? 'Detalhes da movimentação (opcional)' : 'Preencha a data para liberar a observação'}
                      className={`w-full resize-none rounded-lg border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 ${
                        dataMovimentacao ? estadoCampo(Boolean(descricaoMov)) : 'border-gray-200 text-gray-800'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="microetapa-arquivos"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                    >
                      <UploadCloud size={14} />
                      Anexar arquivos (até 2MB cada)
                    </label>
                    <input
                      id="microetapa-arquivos"
                      type="file"
                      multiple
                      onChange={handleEscolherArquivos}
                      className="hidden"
                    />
                    {arquivosMov.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {arquivosMov.map((f) => (
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
                    <Button type="button" onClick={handleRegistrarMovimentacao} loading={registrando}>
                      Registrar
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Sem reserva vinculada, não é possível registrar movimentações de micro etapa.
              </p>
            )}
          </div>

          {/* Coluna direita (1/2): rolagem independente, mas agora ancorada
              no espaço real que sobra dentro do modal (`sm:min-h-0` +
              `flex-1` no miolo) em vez de um teto fixo em vh. Antes, um
              `max-h-[64vh]` fixo tanto podia cortar a lista sem necessidade
              (em telas mais baixas) quanto — o bug relatado — deixar o
              corpo do Modal (que também tem overflow-y-auto, ver
              Modal.jsx) rolar o conjunto inteiro quando só a ESQUERDA
              ficava alta, arrastando esta coluna mesmo com pouquíssimo
              histórico. Com `sm:h-full` na linha acima e `shrink-0` na
              esquerda, é sempre esta coluna que absorve o aperto — só ela
              ganha barra de rolagem, e só quando o histórico de fato não
              cabe no espaço restante. */}
          <div className="sm:flex sm:w-1/2 sm:min-h-0 sm:flex-col">
            <p className="mb-3 shrink-0 text-sm font-semibold text-gray-900">Histórico de movimentações</p>
            <div className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:pr-2">
              {dados.historico.map((item, i) => (
                <LinhaTimeline
                  key={item.etapa}
                  item={item}
                  ultima={i === dados.historico.length - 1}
                  onBaixarAnexo={handleBaixarAnexo}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
