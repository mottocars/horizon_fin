import { useEffect, useState } from 'react';
import { CheckCircle2, FilePlus2, HandCoins, Landmark, Receipt, XCircle } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { atualizarProjecaoCef, listElegiveisProjecaoCef } from '../../../api/dfcProjecaoCef.api';
import { atualizarBaseAgingDfc, getAgingDfc, getExecucaoBaseAgingDfc } from '../../../api/dfcAging.api';

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
}

// Uma base da janela: ícone + título + situação curta + botão "Atualizar" e, rodando, a barra.
function LinhaBase({ icone: Icone, cor, titulo, situacao, erro, rodando, pct, bloqueado, onAtualizar }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cor}`}>
          <Icone size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          {situacao && <p className={`truncate text-[11px] ${erro ? 'text-red-600' : 'text-gray-400'}`}>{situacao}</p>}
        </div>
        <Button type="button" variant="secondary" onClick={onAtualizar} loading={rodando} disabled={rodando || bloqueado}>
          Atualizar
        </Button>
      </div>
      {rodando && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
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

// Aging a receber / a pagar: dispara a rotina do Monitor de Integrações e acompanha por polling.
function useAging(open, empresaId, tipo) {
  const [base, setBase] = useState(null);
  const [exec, setExec] = useState(null);
  const [erro, setErro] = useState('');
  const rodando = exec?.status === 'executando';

  const carregarBase = () =>
    getAgingDfc(empresaId, tipo)
      .then((r) => setBase(r.base))
      .catch(() => setBase(null));

  useEffect(() => {
    if (!open || !empresaId) return;
    setErro('');
    carregarBase();
    getExecucaoBaseAgingDfc(empresaId, tipo)
      .then(setExec)
      .catch(() => setExec(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId, tipo]);

  useEffect(() => {
    if (!open || !rodando) return undefined;
    const timer = setInterval(() => {
      getExecucaoBaseAgingDfc(empresaId, tipo)
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
      setExec(await atualizarBaseAgingDfc(empresaId, tipo));
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível iniciar a atualização.');
    }
  }

  let situacao = base?.parcelas ? `Atualizada em ${dataHora(base.atualizado_em)}` : 'Ainda não carregada';
  let falhou = false;
  if (rodando) situacao = 'Atualizando — pode levar alguns minutos';
  else if (erro) [situacao, falhou] = [erro, true];
  else if (exec && exec.status !== 'sucesso' && exec.finalizadoEm) {
    [situacao, falhou] = [exec.status === 'interrompida' ? 'A última atualização foi interrompida' : exec.erro || 'A última atualização falhou', true];
  }
  return { rodando, situacao, falhou, atualizar };
}

// Ícone "Nova versão" da aba Orçamentos (pedido do usuário): as bases que alimentam o orçamento,
// cada uma com o botão de atualizar (Aging a receber e a pagar do Sienge — rotinas do Monitor de
// Integrações; Projeção CEF — obra a obra), e embaixo "Nova versão", que monta na grade a versão
// nova a partir do que está no banco agora (`onGerar`) — com ou sem atualizar alguma base antes,
// incluindo o que foi digitado em HORIZON - INFORMADO. Ela só vira a última versão ao ser salva.
export default function NovaVersaoOrcamentoModal({ open, onClose, empresaId, onGerar }) {
  const receber = useAging(open, empresaId, 'receber');
  const pagar = useAging(open, empresaId, 'pagar');

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

  const ocupado = receber.rodando || pagar.rodando || cefRodando;

  return (
    <Modal open={open} onClose={cefRodando ? () => {} : onClose} title="Nova versão" maxWidthClass="max-w-lg">
      <div className="space-y-2.5">
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

        {cefResultado && !cefRodando && (
          <p className={`flex items-center gap-1.5 px-1 text-xs ${cefResultado.falhas ? 'text-amber-600' : 'text-emerald-600'}`}>
            {cefResultado.falhas ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            Projeção CEF concluída.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={cefRodando}>
            Cancelar
          </Button>
          <Button type="button" onClick={onGerar} disabled={ocupado} title={ocupado ? 'Espere as atualizações terminarem' : undefined}>
            <FilePlus2 size={16} />
            Nova versão
          </Button>
        </div>
      </div>
    </Modal>
  );
}
