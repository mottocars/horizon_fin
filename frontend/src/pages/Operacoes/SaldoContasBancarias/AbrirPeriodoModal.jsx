import { useEffect, useRef, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, HelpCircle, Wifi, Download, FileText, Upload, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { abrirPeriodoSaldos, buscarSaldosVanpix, getIntegracoesAbertura } from '../../../api/saldoContasBancarias.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { deISO, formatarDataBR, hojeISO } from './constantes';
import { lerArquivoCnab } from './arquivosCnab';

// Fluxo: 'form' (escolher a data e, se a empresa tem conta CNAB 240 manual, anexar os retornos)
// -> 'vanpix' (período já aberto, buscando saldo automático) -> 'resultado' (resumo do que foi
// encontrado, antes de fechar). Encerrar o período aberto é uma simples confirmação
// (useConfirm), disparada direto pela página — não precisa de modal próprio.
// Só aparecem as integrações que alguma conta da empresa usa (tipo de convênio da conta — ver
// getIntegracoesAbertura); sem a contagem (falha ao carregar), aparecem todas, como antes.

const ehFimDeSemana = (iso) => [0, 6].includes(deISO(iso).getDay());

// Campos de arquivo da abertura: retorno de extrato e de cobrança, vários arquivos em cada.
const CAMPOS_CNAB = {
  extrato: { tipo: 'EXTRATO', titulo: 'Retorno Extratos Bancários', outro: 'Retorno Cobrança' },
  cobranca: { tipo: 'COBRANCA', titulo: 'Retorno Cobrança', outro: 'Retorno Extratos Bancários' },
};

let proximoId = 1;

export default function AbrirPeriodoModal({ open, onClose, empresaId, onAberto }) {
  const confirm = useConfirm();
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [etapa, setEtapa] = useState('form');
  const [relatorioVanpix, setRelatorioVanpix] = useState(null);
  const [erroVanpix, setErroVanpix] = useState('');
  const [integracoes, setIntegracoes] = useState(null);
  const [arquivos, setArquivos] = useState({ extrato: [], cobranca: [] });

  useEffect(() => {
    if (open) {
      setData(hojeISO());
      setErro('');
      setEtapa('form');
      setRelatorioVanpix(null);
      setErroVanpix('');
      setArquivos({ extrato: [], cobranca: [] });
      setIntegracoes(null);
      getIntegracoesAbertura(empresaId)
        .then(setIntegracoes)
        .catch(() => setIntegracoes(null));
    }
  }, [open, empresaId]);

  const temCnab = integracoes?.cnab_manual > 0;
  const pedirArquivos = temCnab && !ehFimDeSemana(data);

  async function adicionarArquivos(campo, files) {
    const novos = files
      .filter((f) => !arquivos[campo].some((a) => a.file.name === f.name && a.file.size === f.size))
      .map((file) => ({ id: proximoId++, file, lendo: true }));
    if (!novos.length) return;
    setErro('');
    setArquivos((prev) => ({ ...prev, [campo]: [...prev[campo], ...novos] }));
    const lidos = await Promise.all(
      novos.map(async (a) => {
        const r = await lerArquivoCnab(a.file).catch(() => ({ erro: 'Não foi possível ler o arquivo.' }));
        const campoErrado = r.tipo && r.tipo !== CAMPOS_CNAB[campo].tipo;
        return {
          ...a,
          lendo: false,
          descricao: r.descricao,
          erro: campoErrado ? `${r.descricao} — anexe em "${CAMPOS_CNAB[campo].outro}".` : r.erro,
        };
      })
    );
    setArquivos((prev) => ({
      ...prev,
      [campo]: prev[campo].map((a) => lidos.find((l) => l.id === a.id) || a),
    }));
  }

  function removerArquivo(campo, id) {
    setErro('');
    setArquivos((prev) => ({ ...prev, [campo]: prev[campo].filter((a) => a.id !== id) }));
  }

  async function tentarAbrir(alvo, reabrirEncerrado) {
    await abrirPeriodoSaldos(empresaId, alvo, reabrirEncerrado);
    onAberto(alvo);
    setEtapa('vanpix');
    try {
      const anexos = pedirArquivos
        ? { extrato: arquivos.extrato.map((a) => a.file), cobranca: arquivos.cobranca.map((a) => a.file) }
        : {};
      setRelatorioVanpix(await buscarSaldosVanpix(empresaId, alvo, anexos));
    } catch (err) {
      setErroVanpix(err.response?.data?.message || 'Não foi possível buscar os saldos automaticamente.');
    } finally {
      setEtapa('resultado');
    }
  }

  // Contas CNAB 240 manual: os arquivos são o que dá saldo a elas — sem algum deles, confirma.
  async function arquivosConferidos() {
    if (!pedirArquivos) return true;
    const todos = [...arquivos.extrato, ...arquivos.cobranca];
    if (todos.some((a) => a.lendo)) {
      setErro('Aguarde a leitura dos arquivos.');
      return false;
    }
    if (todos.some((a) => a.erro)) {
      setErro('Remova os arquivos com problema (em amarelo) antes de abrir o período.');
      return false;
    }
    // Cobrança só faz falta se alguma conta CNAB tem código do beneficiário.
    const faltando = Object.entries(CAMPOS_CNAB)
      .filter(([campo]) => !arquivos[campo].length && (campo === 'extrato' || integracoes.cnab_manual_cobranca > 0))
      .map(([, c]) => `"${c.titulo}"`);
    if (!faltando.length) return true;
    return confirm({
      title: 'Abrir sem os arquivos?',
      description: `Nenhum arquivo em ${faltando.join(' e ')}. As contas CNAB 240 manual ficam sem esse saldo (só herdam o anterior se a classificação pedir). Abrir assim mesmo?`,
      confirmLabel: 'Abrir sem arquivo',
      variant: 'warning',
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!(await arquivosConferidos())) return;
    setSalvando(true);
    try {
      await tentarAbrir(data, false);
    } catch (err) {
      if (err.response?.data?.code === 'PERIODO_ENCERRADO') {
        // Pergunta fora do modal de data (useConfirm por cima dele) — reaproveita o mesmo
        // padrão usado em qualquer outra confirmação do sistema (ex.: remover logomarca).
        const reabrir = await confirm({
          title: 'Período já encerrado',
          description: `O período de ${formatarDataBR(data)} já foi encerrado. Deseja reabri-lo?`,
          confirmLabel: 'Reabrir período',
          variant: 'warning',
        });
        if (reabrir) {
          try {
            await tentarAbrir(data, true);
          } catch (err2) {
            setErro(err2.response?.data?.message || 'Não foi possível reabrir o período.');
          }
        }
      } else {
        setErro(err.response?.data?.message || 'Não foi possível abrir o período.');
      }
    } finally {
      setSalvando(false);
    }
  }

  // Integrações a mostrar: as que alguma conta usa (sem a contagem, todas).
  const visivel = (chave) => !integracoes || integracoes[chave] > 0;
  const integ = relatorioVanpix?.integracoes || integracoes;
  const visivelNoResultado = (chave) => !integ || integ[chave] > 0;
  const log = etapa === 'resultado' ? montarLog(data, relatorioVanpix, erroVanpix) : null;
  const linhasCarregando = [
    visivel('vanpix_extrato') && 'Conexão VanPix · Extrato Bancário',
    visivel('itau') && 'Conexão API Itaú',
    visivel('vanpix_cobranca') && 'Conexão VanPix · Cobrança',
    visivel('cnab_manual') && 'CNAB 240 · Extrato',
    visivel('cnab_manual') && 'CNAB 240 · Cobrança',
  ].filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={etapa === 'vanpix' ? () => {} : onClose}
      title="Abrir período"
      maxWidthClass={pedirArquivos && etapa === 'form' ? 'max-w-xl' : 'max-w-md'}
    >
      {etapa === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            Só o dia informado abaixo aceita lançamento de saldo — os demais ficam bloqueados até
            este período ser encerrado.
          </p>

          {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data liberada para lançamento</label>
            <input
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          {temCnab && (
            <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Arquivos CNAB 240</p>
                <p className="text-xs text-gray-500">
                  {integracoes.cnab_manual} conta(s) com convênio CNAB 240 manual. Anexe os retornos do banco
                  — pode escolher vários arquivos de uma vez.
                </p>
              </div>
              {pedirArquivos ? (
                Object.entries(CAMPOS_CNAB).map(([campo, c]) => (
                  <CampoArquivos
                    key={campo}
                    titulo={c.titulo}
                    arquivos={arquivos[campo]}
                    onAdicionar={(files) => adicionarArquivos(campo, files)}
                    onRemover={(id) => removerArquivo(campo, id)}
                  />
                ))
              ) : (
                <p className="text-xs text-gray-500">Sábado e domingo não buscam saldo automático — sem arquivos.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              <Lock size={15} />
              Abrir período
            </Button>
          </div>
        </form>
      )}

      {etapa === 'vanpix' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Período de {formatarDataBR(data)} aberto.{' '}
            {linhasCarregando.length
              ? 'Buscando os saldos automaticamente nas contas que já têm integração cadastrada…'
              : 'Aplicando o saldo anterior nas classificações com "Buscar saldo anterior"…'}
          </p>
          {linhasCarregando.map((nome) => (
            <LinhaIntegracao key={nome} nome={nome} status="carregando" texto="Conectando…" />
          ))}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-4">
          {visivelNoResultado('vanpix_extrato') && <LinhaExtrato relatorio={relatorioVanpix} erro={erroVanpix} />}
          {visivelNoResultado('itau') && <LinhaItau relatorio={relatorioVanpix?.itau} erro={erroVanpix} />}
          {visivelNoResultado('vanpix_cobranca') && <LinhaCobranca relatorio={relatorioVanpix?.cobranca} erro={erroVanpix} />}
          {visivelNoResultado('cnab_manual') && (
            <LinhaCnabExtrato relatorio={relatorioVanpix?.cnab} total={integ?.cnab_manual} erro={erroVanpix} />
          )}
          {visivelNoResultado('cnab_manual') && (
            <LinhaCobranca
              relatorio={relatorioVanpix?.cnab?.cobranca}
              erro={erroVanpix}
              nome="CNAB 240 · Cobrança"
              textoSemConvenio="Nenhuma conta com código do beneficiário"
            />
          )}
          {relatorioVanpix?.semSaldo?.length > 0 && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              {relatorioVanpix.semSaldo.length} conta(s) sem saldo nas integrações ficaram em branco para informar
              manualmente. Só herdam o saldo anterior as classificações com &quot;Buscar saldo anterior&quot;.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {log && (
              <Button type="button" variant="secondary" onClick={() => baixarLog(data, log)}>
                <Download size={15} />
                Baixar log (.txt)
              </Button>
            )}
            <Button type="button" onClick={onClose}>
              Concluir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Um campo de arquivos (clique ou arraste; vários de uma vez) com a lista do que foi escolhido —
// cada arquivo mostra o que é (lido no navegador, ver arquivosCnab.js) ou o problema, em âmbar.
function CampoArquivos({ titulo, arquivos, onAdicionar, onRemover }) {
  const inputRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{titulo}</span>
        {arquivos.length > 0 && <span className="text-xs text-gray-400">{arquivos.length} arquivo(s)</span>}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          onAdicionar([...e.dataTransfer.files]);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors ${
          arrastando
            ? 'border-primary-500 bg-primary-50 text-primary-600'
            : 'border-gray-300 bg-white text-gray-500 hover:border-primary-500 hover:bg-primary-50 hover:text-primary-600'
        }`}
      >
        <Upload size={15} />
        Escolher arquivos ou arrastar aqui
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdicionar([...e.target.files]);
          e.target.value = '';
        }}
      />
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((a) => (
            <li
              key={a.id}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${
                a.erro ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
              }`}
            >
              {a.lendo ? (
                <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-gray-400" />
              ) : a.erro ? (
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
              ) : (
                <FileText size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-700" title={a.file.name}>
                  {a.file.name}
                </p>
                <p className={`text-[11px] leading-snug ${a.erro ? 'text-amber-700' : 'text-gray-500'}`}>
                  {a.lendo ? 'Lendo…' : a.erro || a.descricao}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemover(a.id)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                aria-label={`Remover ${a.file.name}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Uma linha só por integração (pedido do usuário: reduzir os logs da busca automática) — VanPix,
// API Itaú e CNAB 240 manual, genérico pra caber outras integrações no futuro sem crescer a lista
// nem precisar de rolagem. Os detalhes dos avisos não aparecem na tela: a linha só diz "com
// avisos" e o botão "Baixar log" (ver montarLog) gera um .txt com tudo. Mesmo selo "positivo"
// (pill esmeralda + CheckCircle2) já usado em CertificadosDigitaisPage.jsx pra status de
// conexão/validade.
const STATUS_INTEGRACAO = {
  ok: { className: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  erro: { className: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  sem_convenio: { className: 'bg-gray-100 text-gray-600', Icon: HelpCircle },
  carregando: { className: 'bg-sky-50 text-sky-700', Icon: Loader2, girar: true },
};

const COM_AVISOS = ' · com avisos';

// Avisos de cada integração (o que vai pro log) — mesmo critério que pinta a linha de âmbar.
function avisosExtrato(relatorio) {
  return (relatorio?.convenios || []).filter((c) => c.aviso).map((c) => `${c.apelido}: ${c.mensagem}`);
}
function avisosItau(relatorio) {
  return [
    ...(relatorio?.falhas || []).map((f) => `${f.conexao} (${f.conta}): ${f.mensagem}`),
    ...(relatorio?.semCorrespondencia || []).map((s) => `${s.conexao} (${s.conta}): nenhuma conta com convênio API Itaú com esta agência/conta`),
  ];
}
function avisosCobranca(relatorio) {
  return (relatorio?.falhas || []).map((f) => `${f.apelido}${f.conta ? ` (${f.conta})` : ''}: ${f.mensagem}`);
}
function avisosCnabExtrato(relatorio) {
  return relatorio?.avisos || [];
}

function LinhaItau({ relatorio, erro }) {
  const atualizadas = relatorio?.atualizados.length || 0;
  let status = 'ok';
  let texto = `Ok, ${atualizadas} conta(s) integrada(s)`;
  if (erro) {
    status = 'erro';
    texto = 'Falha de conexão';
  } else if (!relatorio || relatorio.conexoes === 0) {
    status = 'sem_convenio';
    texto = 'Nenhuma conta Itaú configurada';
  } else if (avisosItau(relatorio).length) {
    status = 'erro';
    texto = `${atualizadas} de ${relatorio.conexoes} conta(s) integrada(s)${COM_AVISOS}`;
  }
  return <LinhaIntegracao nome="Conexão API Itaú" status={status} texto={texto} />;
}

function LinhaExtrato({ relatorio, erro }) {
  const convenios = relatorio?.convenios || [];
  const atualizadas = relatorio?.atualizados.length || 0;
  let status = 'ok';
  let texto = `Ok, ${atualizadas} conta(s) integrada(s)`;
  if (erro) {
    status = 'erro';
    texto = 'Falha de conexão';
  } else if (convenios.length === 0) {
    status = 'sem_convenio';
    texto = 'Nenhuma conta com código cedente extrato';
  } else if (avisosExtrato(relatorio).length) {
    status = 'erro';
    texto = `${atualizadas} conta(s) integrada(s)${COM_AVISOS}`;
  }
  return <LinhaIntegracao nome="Conexão VanPix · Extrato Bancário" status={status} texto={texto} />;
}

// Cobrança (VanPix ou CNAB 240 manual): boletos liquidados com Dt Crédito no dia, somados no
// saldo das contas com código cedente cobrança / código do beneficiário.
function LinhaCobranca({ relatorio, erro, nome = 'Conexão VanPix · Cobrança', textoSemConvenio = 'Nenhuma conta com cedente de cobrança' }) {
  const contas = relatorio?.contas || [];
  const falhas = relatorio?.falhas || [];
  // Só a quantidade de contas que receberam cobrança (pedido do usuário) — sem valores.
  const integradas = contas.filter((c) => c.titulos > 0).length;
  let status = 'ok';
  let texto = `Ok, ${integradas} conta(s) integrada(s)`;
  if (erro) {
    status = 'erro';
    texto = 'Falha de conexão';
  } else if (contas.length === 0 && falhas.length === 0) {
    status = 'sem_convenio';
    texto = textoSemConvenio;
  } else if (falhas.length) {
    status = 'erro';
    texto = `${integradas} conta(s) integrada(s)${COM_AVISOS}`;
  }
  return <LinhaIntegracao nome={nome} status={status} texto={texto} />;
}

// CNAB 240 manual · extrato: contas que receberam o saldo de um arquivo anexado (ou mantiveram o
// de uma abertura anterior do mesmo dia) sobre o total de contas CNAB 240 manual.
function LinhaCnabExtrato({ relatorio, total, erro }) {
  const integradas = (relatorio?.atualizados.length || 0) + (relatorio?.mantidos.length || 0);
  const lidos = (relatorio?.arquivos || []).filter((a) => a.tipo === 'EXTRATO').length;
  let status = 'ok';
  let texto = `Ok, ${integradas} de ${total ?? integradas} conta(s) integrada(s)`;
  if (erro) {
    status = 'erro';
    texto = 'Falha ao ler os arquivos';
  } else if (!lidos && !integradas) {
    status = 'erro';
    texto = 'Nenhum arquivo de extrato anexado';
  } else if (avisosCnabExtrato(relatorio).length) {
    status = 'erro';
    texto = `${integradas} de ${total ?? integradas} conta(s) integrada(s)${COM_AVISOS}`;
  }
  return <LinhaIntegracao nome="CNAB 240 · Extrato" status={status} texto={texto} />;
}

// Conteúdo do .txt: um bloco por integração com aviso + as contas que ficaram em branco.
// Devolve null quando não há nada a registrar (o botão nem aparece).
function montarLog(data, relatorio, erro) {
  const blocos = erro
    ? [['Busca automática', [erro]]]
    : [
        ['Conexão VanPix · Extrato Bancário', avisosExtrato(relatorio)],
        ['Conexão API Itaú', avisosItau(relatorio?.itau)],
        ['Conexão VanPix · Cobrança', avisosCobranca(relatorio?.cobranca)],
        ['CNAB 240 · Extrato', avisosCnabExtrato(relatorio?.cnab)],
        ['CNAB 240 · Cobrança', avisosCobranca(relatorio?.cnab?.cobranca)],
        [
          'Contas sem saldo nas integrações (informar manualmente)',
          (relatorio?.semSaldo || []).map((c) => `${c.nome || c.numero_conta} (conta ${c.numero_conta}) · classificação ${c.classificacao}`),
        ],
      ];
  const comItens = blocos.filter(([, itens]) => itens.length);
  if (!comItens.length) return null;
  const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const linhas = [`Abertura do período de ${formatarDataBR(data)} - avisos das conexões`, `Gerado em ${agora}`];
  for (const [titulo, itens] of comItens) {
    linhas.push('', `== ${titulo} (${itens.length}) ==`, ...itens.map((i) => `- ${i}`));
  }
  return linhas.join('\r\n') + '\r\n';
}

function baixarLog(data, conteudo) {
  // BOM: acentos corretos no Bloco de Notas
  const url = URL.createObjectURL(new Blob(['﻿', conteudo], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `Avisos abertura de período - ${formatarDataBR(data).replace(/\//g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LinhaIntegracao({ nome, status, texto }) {
  const { className, Icon, girar } = STATUS_INTEGRACAO[status];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Wifi size={16} className="text-gray-400" />
        {nome}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
        <Icon size={13} className={girar ? 'animate-spin' : ''} />
        {texto}
      </span>
    </div>
  );
}
