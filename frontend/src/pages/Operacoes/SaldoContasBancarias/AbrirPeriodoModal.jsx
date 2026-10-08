import { useEffect, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, HelpCircle, Wifi, Download } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { abrirPeriodoSaldos, buscarSaldosVanpix } from '../../../api/saldoContasBancarias.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { formatarDataBR, hojeISO } from './constantes';

// Fluxo: 'form' (escolher a data) -> 'vanpix' (período já aberto, buscando saldo automático
// na VanPix) -> 'resultado' (resumo do que foi encontrado, antes de fechar). Encerrar o
// período aberto é uma simples confirmação (useConfirm), disparada direto pela página — não
// precisa de modal próprio.
export default function AbrirPeriodoModal({ open, onClose, empresaId, onAberto }) {
  const confirm = useConfirm();
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [etapa, setEtapa] = useState('form');
  const [relatorioVanpix, setRelatorioVanpix] = useState(null);
  const [erroVanpix, setErroVanpix] = useState('');

  useEffect(() => {
    if (open) {
      setData(hojeISO());
      setErro('');
      setEtapa('form');
      setRelatorioVanpix(null);
      setErroVanpix('');
    }
  }, [open]);

  async function tentarAbrir(alvo, reabrirEncerrado) {
    await abrirPeriodoSaldos(empresaId, alvo, reabrirEncerrado);
    onAberto(alvo);
    setEtapa('vanpix');
    try {
      setRelatorioVanpix(await buscarSaldosVanpix(empresaId, alvo));
    } catch (err) {
      setErroVanpix(err.response?.data?.message || 'Não foi possível buscar os saldos automaticamente.');
    } finally {
      setEtapa('resultado');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
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

  const log = etapa === 'resultado' ? montarLog(data, relatorioVanpix, erroVanpix) : null;

  return (
    <Modal open={open} onClose={etapa === 'vanpix' ? () => {} : onClose} title="Abrir período">
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
            Período de {formatarDataBR(data)} aberto. Buscando os saldos automaticamente nas contas que
            já têm integração cadastrada…
          </p>
          <LinhaIntegracao nome="Conexão VanPix · Extrato Bancário" status="carregando" texto="Conectando…" />
          <LinhaIntegracao nome="Conexão API Itaú" status="carregando" texto="Conectando…" />
          <LinhaIntegracao nome="Conexão VanPix · Cobrança" status="carregando" texto="Conectando…" />
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-4">
          <LinhaExtrato relatorio={relatorioVanpix} erro={erroVanpix} />
          <LinhaItau relatorio={relatorioVanpix?.itau} erro={erroVanpix} />
          <LinhaCobranca relatorio={relatorioVanpix?.cobranca} erro={erroVanpix} />
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

// Uma linha só por integração (pedido do usuário: reduzir os logs da busca automática) — VanPix e
// API Itaú, genérico pra caber outras integrações no futuro sem crescer a lista nem precisar de
// rolagem. Os detalhes dos avisos não aparecem na tela: a linha só diz "com avisos" e o botão
// "Baixar log" (ver montarLog) gera um .txt com tudo. Mesmo selo "positivo" (pill esmeralda +
// CheckCircle2) já usado em CertificadosDigitaisPage.jsx pra status de conexão/validade.
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
    ...(relatorio?.semCorrespondencia || []).map((s) => `${s.conexao} (${s.conta}): conta não encontrada no cadastro de contas bancárias`),
  ];
}
function avisosCobranca(relatorio) {
  return (relatorio?.falhas || []).map((f) => `${f.apelido}${f.conta ? ` (${f.conta})` : ''}: ${f.mensagem}`);
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

// Cobrança: boletos liquidados com Dt Crédito no dia, somados no saldo das contas que têm
// código cedente cobrança.
function LinhaCobranca({ relatorio, erro }) {
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
    texto = 'Nenhuma conta com cedente de cobrança';
  } else if (falhas.length) {
    status = 'erro';
    texto = `${integradas} conta(s) integrada(s)${COM_AVISOS}`;
  }
  return <LinhaIntegracao nome="Conexão VanPix · Cobrança" status={status} texto={texto} />;
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
