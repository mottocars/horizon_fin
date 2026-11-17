import { useEffect, useState } from 'react';
import { CheckCircle2, UserRound } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { getRedistribuicaoCliente, redistribuirCliente } from '../../../api/reguaCobranca.api';

function dataBR(iso) {
  return iso ? iso.split('-').reverse().join('/') : '';
}

// Aberto pelo botão "Redistribuir" da última coluna da Rotina (só Usuário
// Administrador da Gestão de Cobranças e Master, só na Distribuição
// automática). Manda o cliente pra outro atendente a partir de agora: ele vai
// pra carteira do escolhido e o que estava distribuído de hoje em diante muda
// de dono (ver backend distribuicao.service.js::redistribuirCliente). Dias
// anteriores não mudam.
export default function RedistribuirClienteModal({ open, onClose, empresaId, clientId, clientName, responsavelAtualId, onRedistribuido }) {
  const [info, setInfo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [escolhido, setEscolhido] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [concluido, setConcluido] = useState(null);

  useEffect(() => {
    if (!open || !clientId) return;
    let ativo = true;
    setInfo(null);
    setEscolhido(null);
    setErro('');
    setConcluido(null);
    setCarregando(true);
    getRedistribuicaoCliente(empresaId, clientId)
      .then((r) => ativo && setInfo(r))
      .catch((err) => ativo && setErro(err.response?.data?.message || 'Não foi possível carregar os atendentes.'))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [open, empresaId, clientId]);

  // Quem está com o cliente agora: o da linha clicada (dono do dia na Rotina)
  // ou, sem ele, o dono da carteira.
  const atualId = responsavelAtualId ?? info?.dono_atual?.usuario_id ?? null;
  const atualNome =
    info?.atendentes.find((a) => String(a.usuario_id) === String(atualId))?.nome ||
    (String(info?.dono_atual?.usuario_id) === String(atualId) ? info?.dono_atual?.nome : null);
  const opcoes = (info?.atendentes || []).filter((a) => String(a.usuario_id) !== String(atualId));

  async function handleConfirmar() {
    setSalvando(true);
    setErro('');
    try {
      const r = await redistribuirCliente(empresaId, clientId, escolhido);
      setConcluido(r);
      onRedistribuido?.();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível redistribuir o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Redistribuir cliente" maxWidthClass="max-w-md">
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-900">{info?.cliente.nome || clientName}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {atualNome ? `Hoje com: ${atualNome}` : 'Ainda sem atendente (A distribuir)'}
          </p>
        </div>

        {carregando && <div className="py-4 text-center text-sm text-gray-400">Carregando...</div>}

        {info && info.modo !== 'automatica' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Redistribuir cliente só existe na Distribuição automática (Configurações).
          </p>
        )}

        {info && info.modo === 'automatica' && !concluido && (
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Enviar este cliente para a atendente:
            </label>
            {opcoes.length === 0 ? (
              <p className="text-xs text-gray-500">Não há outro atendente na distribuição.</p>
            ) : (
              <div className="space-y-1.5">
                {opcoes.map((a) => {
                  const pausado = Boolean(a.pausado_ate);
                  const ativo = String(escolhido) === String(a.usuario_id);
                  return (
                    <button
                      key={a.usuario_id}
                      type="button"
                      disabled={pausado}
                      onClick={() => setEscolhido(a.usuario_id)}
                      aria-pressed={ativo}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        ativo
                          ? 'border-primary-500 bg-primary-50 text-primary-800 ring-1 ring-primary-500'
                          : 'border-gray-200 text-gray-700 hover:border-primary-200 hover:bg-primary-50/40'
                      } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-transparent`}
                    >
                      <span className="flex items-center gap-2">
                        <UserRound size={14} className={ativo ? 'text-primary-600' : 'text-gray-400'} />
                        {a.nome}
                      </span>
                      {pausado && <span className="text-[11px] text-gray-500">pausado(a) até {dataBR(a.pausado_ate)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-gray-500">
              A partir de agora o cliente passa para a carteira da atendente escolhida, e as tarefas dele de hoje em diante
              vão para ela. O que já foi distribuído em dias anteriores continua com quem estava.
            </p>
          </div>
        )}

        {concluido && (
          <p className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} className="mt-px shrink-0" />
            {concluido.resultado}
          </p>
        )}

        {erro && <p className="text-xs text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          {concluido ? (
            <Button type="button" onClick={onClose}>
              Fechar
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmar}
                loading={salvando}
                disabled={!escolhido || info?.modo !== 'automatica'}
              >
                Redistribuir
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
