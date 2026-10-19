import { useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  FilePlus2,
  FileSpreadsheet,
  Globe,
  HandCoins,
  Landmark,
  Lock,
  Receipt,
  Wallet,
  XCircle,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { atualizarProjecaoCef, listElegiveisProjecaoCef } from '../../../api/dfcProjecaoCef.api';
import { atualizarBaseAgingDfc, getAgingDfc, getExecucaoBaseAgingDfc } from '../../../api/dfcAging.api';
import {
  atualizarBaseEmpresarialDfc,
  getBaseEmpresarialDfc,
  getExecucaoEmpresarialDfc,
} from '../../../api/dfcEmpresarial.api';
import { listDcdContratos } from '../../../api/dcd.api';
import { listExtratoEmpreendimentos } from '../../../api/extrato.api';
import ImportarCiwebModal from './ImportarCiwebModal';
import ImportarPlanilhaOrcamentariaModal from './ImportarPlanilhaOrcamentariaModal';
import { getSituacaoPlanilhaOrcamentaria } from '../../../api/dfcPlanilhaOrcamentaria.api';
import {
  atualizarSaldosContasDfc,
  getBaseSaldosContasDfc,
  getExecucaoSaldosContasDfc,
} from '../../../api/dfcSaldos.api';

// Bases que rodam pela rotina do Monitor de Integrações: como ler a situação, disparar e acompanhar.
const BASES = {
  receber: {
    base: (e) => getAgingDfc(e, 'receber'),
    atualizar: (e) => atualizarBaseAgingDfc(e, 'receber'),
    execucao: (e) => getExecucaoBaseAgingDfc(e, 'receber'),
  },
  pagar: {
    base: (e) => getAgingDfc(e, 'pagar'),
    atualizar: (e) => atualizarBaseAgingDfc(e, 'pagar'),
    execucao: (e) => getExecucaoBaseAgingDfc(e, 'pagar'),
  },
  empresarial: { base: getBaseEmpresarialDfc, atualizar: atualizarBaseEmpresarialDfc, execucao: getExecucaoEmpresarialDfc },
  saldos: { base: getBaseSaldosContasDfc, atualizar: atualizarSaldosContasDfc, execucao: getExecucaoSaldosContasDfc },
};

// Mês atual em Brasília (o mesmo que o backend usa pra travar) -> "OUT/2026".
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
function rotuloMesAtual() {
  const [ano, mes] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-');
  return `${MESES_CAB[Number(mes) - 1]}/${ano}`;
}

// Última escolha de períodos (conveniência do navegador; sem ela, o padrão é travar o passado).
const CHAVE_PERIODOS = 'dfc.novaVersao.periodos';
function periodosSalvos() {
  try {
    return localStorage.getItem(CHAVE_PERIODOS) === 'todos' ? 'todos' : 'atual_em_diante';
  } catch {
    return 'atual_em_diante';
  }
}

const OPCOES_PERIODOS = [
  {
    id: 'atual_em_diante',
    icone: Lock,
    titulo: 'Alterar do mês atual em diante',
    dica: (mes) => `Meses antes de ${mes} ficam como na versão salva.`,
  },
  {
    id: 'todos',
    icone: CalendarRange,
    titulo: 'Alterar todos os períodos',
    dica: () => 'Recalcula também os meses passados.',
  },
];

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
}

// Uma base da janela: ícone + título + situação curta + botão "Atualizar" e, rodando, a barra.
function LinhaBase({ icone: Icone, cor, titulo, situacao, erro, rodando, pct, bloqueado, onAtualizar, rotuloBotao = 'Atualizar' }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-1">
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cor}`}>
          <Icone size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          {situacao && <p className={`truncate text-[11px] ${erro ? 'text-red-600' : 'text-gray-400'}`}>{situacao}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={onAtualizar} loading={rodando} disabled={rodando || bloqueado} className="!py-1">
          {rotuloBotao}
        </Button>
      </div>
      {rodando && (
        <div className="my-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          {pct === null ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-600" />
          ) : (
            <div className="h-full rounded-full bg-primary-600 transition-all duration-300" style={{ width: `${pct}%` }} />
          )}
        </div>
      )}
    </div>
  );
}

// Base que roda pela rotina do Monitor (Aging a receber / a pagar, Orçamento Empresarial): dispara
// e acompanha por polling.
function useBase(open, empresaId, tipo) {
  const api = BASES[tipo];
  const [base, setBase] = useState(null);
  const [exec, setExec] = useState(null);
  const [erro, setErro] = useState('');
  const rodando = exec?.status === 'executando';

  const carregarBase = () =>
    api
      .base(empresaId)
      .then((r) => setBase(r.base))
      .catch(() => setBase(null));

  useEffect(() => {
    if (!open || !empresaId) return;
    setErro('');
    carregarBase();
    api
      .execucao(empresaId)
      .then(setExec)
      .catch(() => setExec(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId, tipo]);

  useEffect(() => {
    if (!open || !rodando) return undefined;
    const timer = setInterval(() => {
      api
        .execucao(empresaId)
        .then((atual) => {
          setExec(atual);
          if (atual?.status !== 'executando') carregarBase();
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rodando, empresaId, tipo]);

  async function atualizar() {
    setErro('');
    try {
      setExec(await api.atualizar(empresaId));
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível iniciar a atualização.');
    }
  }

  let situacao = base?.parcelas ? `Atualizada em ${dataHora(base.atualizado_em)}` : 'Ainda não carregada';
  let falhou = false;
  if (rodando) situacao = exec?.progresso?.texto || 'Atualizando — pode levar alguns minutos';
  else if (erro) [situacao, falhou] = [erro, true];
  else if (exec && exec.status !== 'sucesso' && exec.finalizadoEm) {
    [situacao, falhou] = [
      exec.status === 'interrompida' ? 'A última atualização foi interrompida' : exec.status === 'cancelada' ? `A última atualização foi parada (${exec.erro})` : exec.erro || 'A última atualização falhou',
      true,
    ];
  }
  return { rodando, situacao, falhou, atualizar };
}

// Ícone "Nova versão" da aba Orçamentos (pedido do usuário): as bases que alimentam o orçamento,
// cada uma com o botão de atualizar (CIWEB — DCD e Geral, a mesma importação da aba CIWEB; Aging a
// receber e a pagar e Orçamento Empresarial do Sienge — rotinas do Monitor de Integrações; Projeção
// CEF — obra a obra), e embaixo "Nova versão", que monta na grade a versão
// nova a partir do que está no banco agora (`onGerar`) — com ou sem atualizar alguma base antes,
// incluindo o que foi digitado em HORIZON - INFORMADO. Ela só vira a última versão ao ser salva.
// "Saldos das Contas" (extrato do Sienge das contas com Projeta DFC, rotina do Monitor — o Saldo inicial
// realizado da aba DFC) vem primeiro. "Planilha Orçamentária": importa o Excel do "Layout do orçamento" —
// os valores entram como HORIZON - INFORMADO, como se digitados.
export default function NovaVersaoOrcamentoModal({
  open,
  onClose,
  empresaId,
  onGerar,
  titulo = 'Nova versão',
  rotuloFinal = 'Nova versão',
}) {
  const [periodos, setPeriodos] = useState(periodosSalvos);
  const escolherPeriodos = (id) => {
    setPeriodos(id);
    try {
      localStorage.setItem(CHAVE_PERIODOS, id);
    } catch {
      // sem armazenamento: vale só nesta janela
    }
  };
  const mesAtual = rotuloMesAtual();
  const saldos = useBase(open, empresaId, 'saldos');
  const receber = useBase(open, empresaId, 'receber');
  const pagar = useBase(open, empresaId, 'pagar');
  const empresarial = useBase(open, empresaId, 'empresarial');

  // CIWEB (DCD e Geral dos empreendimentos): mesma importação da aba CIWEB. Situação = último envio.
  const [ciwebAberto, setCiwebAberto] = useState(false);
  const [ultimoCiweb, setUltimoCiweb] = useState(undefined);
  const carregarCiweb = () =>
    Promise.all([listDcdContratos(empresaId), listExtratoEmpreendimentos(empresaId)])
      .then((listas) => {
        const datas = listas
          .flat()
          .map((x) => x.atualizado_em || x.importado_em)
          .filter(Boolean)
          .sort();
        setUltimoCiweb(datas.at(-1) || null);
      })
      .catch(() => setUltimoCiweb(null));

  // Planilha Orçamentária: situação = última importação.
  const [planilhaAberta, setPlanilhaAberta] = useState(false);
  const [ultimaPlanilha, setUltimaPlanilha] = useState(undefined);
  const carregarPlanilha = () =>
    getSituacaoPlanilhaOrcamentaria(empresaId)
      .then((r) => setUltimaPlanilha(r.ultima))
      .catch(() => setUltimaPlanilha(null));

  const [obras, setObras] = useState([]);
  const [cefRodando, setCefRodando] = useState(false);
  const [cefProgresso, setCefProgresso] = useState({ atual: 0, total: 0 });
  const [cefResultado, setCefResultado] = useState(null); // { ok, falhas }
  const [cefErro, setCefErro] = useState('');

  const carregarObras = () =>
    listElegiveisProjecaoCef(empresaId)
      .then(setObras)
      .catch((e) => setCefErro(e.response?.data?.message || 'Não foi possível carregar as obras.'));

  useEffect(() => {
    if (!open || !empresaId) return;
    setCefResultado(null);
    setCefErro('');
    carregarObras();
    carregarCiweb();
    carregarPlanilha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId]);

  const elegiveis = obras.filter((o) => o.elegivel);

  async function atualizarCef() {
    setCefRodando(true);
    setCefResultado(null);
    let ok = 0;
    let falhas = 0;
    for (let i = 0; i < elegiveis.length; i += 1) {
      setCefProgresso({ atual: i, total: elegiveis.length });
      try {
        await atualizarProjecaoCef(empresaId, elegiveis[i].sienge_id);
        ok += 1;
      } catch {
        falhas += 1;
      }
    }
    setCefProgresso({ atual: elegiveis.length, total: elegiveis.length });
    setCefRodando(false);
    setCefResultado({ ok, falhas });
    carregarObras();
  }

  const ultimaCef = elegiveis
    .map((o) => o.ultima_atualizacao)
    .filter(Boolean)
    .sort()
    .at(-1);
  const situacaoCef = cefRodando
    ? `Projetando obra ${cefProgresso.atual + 1} de ${cefProgresso.total}`
    : cefErro
      ? cefErro
      : cefResultado
        ? `${cefResultado.ok} obra(s) atualizada(s)${cefResultado.falhas ? `, ${cefResultado.falhas} com erro` : ''}`
        : elegiveis.length === 0
          ? 'Nenhuma obra com Contrato Caixa e Parâmetros publicados'
          : ultimaCef
            ? `Atualizada em ${dataHora(ultimaCef)}`
            : 'Ainda não projetada';

  const ocupado = saldos.rodando || receber.rodando || pagar.rodando || empresarial.rodando || cefRodando;

  return (
    // Linhas compactas e quase a tela toda de altura: as 7 bases e a escolha de períodos cabem sem barra
    // de rolagem mesmo em notebook (testado até 1280×600).
    <Modal open={open} onClose={cefRodando ? () => {} : onClose} title={titulo} maxWidthClass="max-w-xl" maxHeightClass="max-h-[calc(100vh-1rem)]">
      <div className="space-y-1.5">
        <LinhaBase
          icone={Wallet}
          cor="bg-teal-50 text-teal-600"
          titulo="Saldos das Contas"
          situacao={saldos.situacao}
          erro={saldos.falhou}
          rodando={saldos.rodando}
          pct={null}
          bloqueado={cefRodando}
          onAtualizar={saldos.atualizar}
        />
        <LinhaBase
          icone={Globe}
          cor="bg-sky-50 text-sky-600"
          titulo="CIWEB (DCD e Geral)"
          situacao={
            ultimoCiweb === undefined ? '' : ultimoCiweb ? `Último envio em ${dataHora(ultimoCiweb)}` : 'Nenhum arquivo enviado'
          }
          rodando={false}
          pct={null}
          bloqueado={cefRodando}
          rotuloBotao="Enviar arquivos"
          onAtualizar={() => setCiwebAberto(true)}
        />
        <LinhaBase
          icone={HandCoins}
          cor="bg-emerald-50 text-emerald-600"
          titulo="Aging a Receber (Sienge)"
          situacao={receber.situacao}
          erro={receber.falhou}
          rodando={receber.rodando}
          pct={null}
          bloqueado={cefRodando}
          onAtualizar={receber.atualizar}
        />
        <LinhaBase
          icone={Receipt}
          cor="bg-rose-50 text-rose-600"
          titulo="Aging a Pagar (Sienge)"
          situacao={pagar.situacao}
          erro={pagar.falhou}
          rodando={pagar.rodando}
          pct={null}
          bloqueado={cefRodando}
          onAtualizar={pagar.atualizar}
        />
        <LinhaBase
          icone={BriefcaseBusiness}
          cor="bg-violet-50 text-violet-600"
          titulo="Orçamento Empresarial (Sienge)"
          situacao={empresarial.situacao}
          erro={empresarial.falhou}
          rodando={empresarial.rodando}
          pct={null}
          bloqueado={cefRodando}
          onAtualizar={empresarial.atualizar}
        />
        <LinhaBase
          icone={Landmark}
          cor="bg-blue-50 text-blue-600"
          titulo="Projeção CEF"
          situacao={situacaoCef}
          erro={Boolean(cefErro) || Boolean(cefResultado?.falhas)}
          rodando={cefRodando}
          pct={cefProgresso.total ? Math.round((cefProgresso.atual / cefProgresso.total) * 100) : 0}
          bloqueado={elegiveis.length === 0}
          onAtualizar={atualizarCef}
        />

        <LinhaBase
          icone={FileSpreadsheet}
          cor="bg-amber-50 text-amber-600"
          titulo="Planilha Orçamentária"
          situacao={
            ultimaPlanilha === undefined
              ? ''
              : ultimaPlanilha
                ? `Última importação em ${dataHora(ultimaPlanilha.criado_em)}${ultimaPlanilha.usuario ? ` por ${ultimaPlanilha.usuario}` : ''} · ${
                    ultimaPlanilha.incluidos + ultimaPlanilha.alterados + ultimaPlanilha.limpos
                  } valor(es)`
                : 'Nenhuma planilha importada — baixe o "Layout do orçamento" na barra da aba'
          }
          rodando={false}
          pct={null}
          bloqueado={cefRodando}
          rotuloBotao="Importar"
          onAtualizar={() => setPlanilhaAberta(true)}
        />

        {cefResultado && !cefRodando && (
          <p className={`flex items-center gap-1.5 px-1 text-xs ${cefResultado.falhas ? 'text-amber-600' : 'text-emerald-600'}`}>
            {cefResultado.falhas ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            Projeção CEF concluída.
          </p>
        )}

        <ImportarPlanilhaOrcamentariaModal
          open={planilhaAberta}
          onClose={() => setPlanilhaAberta(false)}
          empresaId={empresaId}
          onImportado={carregarPlanilha}
        />

        <ImportarCiwebModal
          open={ciwebAberto}
          onClose={() => setCiwebAberto(false)}
          empresaId={empresaId}
          onImportado={async () => {
            await carregarCiweb();
            carregarObras(); // DCD / Geral mudam Parâmetros e quais obras entram na Projeção CEF
          }}
        />

        <div className="border-t border-gray-100 pt-2.5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Períodos que a nova versão altera">
            {OPCOES_PERIODOS.map(({ id, icone: Icone, titulo: rotulo, dica }) => {
              const marcado = periodos === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() => escolherPeriodos(id)}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors ${
                    marcado ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icone size={15} className={`mt-0.5 shrink-0 ${marcado ? 'text-primary-600' : 'text-gray-400'}`} />
                  <span className="min-w-0">
                    <span className={`block text-xs font-semibold ${marcado ? 'text-primary-700' : 'text-gray-800'}`}>{rotulo}</span>
                    <span className="block text-[11px] leading-snug text-gray-500">{dica(mesAtual)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={cefRodando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onGerar({ periodos })} disabled={ocupado} title={ocupado ? 'Espere as atualizações terminarem' : undefined}>
            <FilePlus2 size={16} />
            {rotuloFinal}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
