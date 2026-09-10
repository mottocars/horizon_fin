import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import {
  listOpcoesFiltroReservaRepassesCef,
  getFiltrosReservaRepassesCef,
  salvarFiltrosReservaRepassesCef,
  getCoresReservaRepassesCef,
  salvarCoresReservaRepassesCef,
} from '../../../api/repassesCef.api';
import { corPadrao } from '../../../utils/coresPadrao';

export default function ConfigurarFiltrosModal({ open, onClose, empresaId, onFiltrosSalvos }) {
  return (
    <Modal open={open} onClose={onClose} title="Configurar Filtros de Visualização" maxWidthClass="max-w-lg">
      <FiltrosReserva open={open} empresaId={empresaId} onClose={onClose} onFiltrosSalvos={onFiltrosSalvos} />
    </Modal>
  );
}

function FiltrosReserva({ open, empresaId, onClose, onFiltrosSalvos }) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [opcoesTipovenda, setOpcoesTipovenda] = useState([]);
  const [opcoesSituacao, setOpcoesSituacao] = useState([]);
  const [tipovendaSelecionado, setTipovendaSelecionado] = useState([]);
  const [situacaoSelecionada, setSituacaoSelecionada] = useState([]);
  const [coresTipovenda, setCoresTipovenda] = useState({});
  const [coresSituacao, setCoresSituacao] = useState({});

  useEffect(() => {
    if (!open || !empresaId) return;
    setCarregando(true);
    setErro('');
    Promise.all([
      listOpcoesFiltroReservaRepassesCef(empresaId),
      getFiltrosReservaRepassesCef(empresaId),
      getCoresReservaRepassesCef(empresaId),
    ])
      .then(([opcoes, filtroSalvo, coresSalvas]) => {
        setOpcoesTipovenda(opcoes.tipovenda);
        setOpcoesSituacao(opcoes.situacao);
        setTipovendaSelecionado(filtroSalvo.tipovenda);
        setSituacaoSelecionada(filtroSalvo.situacao);
        // Completa com a cor padrão qualquer opção que ainda não tem cor
        // salva, pra sempre existir uma cor definida (o card usa a mesma
        // regra do lado dele — ver corPadrao em RepassesCefPage.jsx).
        setCoresTipovenda(
          Object.fromEntries(
            opcoes.tipovenda.map((o, i) => [o.value, coresSalvas.tipovenda[o.value] || corPadrao(i)])
          )
        );
        setCoresSituacao(
          Object.fromEntries(
            opcoes.situacao.map((o, i) => [o.value, coresSalvas.situacao[o.value] || corPadrao(i)])
          )
        );
      })
      .catch(() => setErro('Não foi possível carregar as opções de filtro.'))
      .finally(() => setCarregando(false));
  }, [open, empresaId]);

  function toggle(lista, setLista, valor) {
    setLista(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  async function handleSalvar() {
    setSalvando(true);
    setErro('');
    try {
      await Promise.all([
        salvarFiltrosReservaRepassesCef(empresaId, {
          tipovenda: tipovendaSelecionado,
          situacao: situacaoSelecionada,
        }),
        salvarCoresReservaRepassesCef(empresaId, {
          tipovenda: coresTipovenda,
          situacao: coresSituacao,
        }),
      ]);
      onFiltrosSalvos?.();
      onClose();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar os filtros.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="py-10 text-center text-sm text-gray-400">Carregando opções...</div>;
  }

  return (
    <div className="space-y-4">
      {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

      <ChecklistFiltro
        titulo="Tipo de Venda"
        opcoes={opcoesTipovenda}
        selecionados={tipovendaSelecionado}
        onToggle={(valor) => toggle(tipovendaSelecionado, setTipovendaSelecionado, valor)}
        cores={coresTipovenda}
        onCorChange={(valor, cor) => setCoresTipovenda((prev) => ({ ...prev, [valor]: cor }))}
      />

      <ChecklistFiltro
        titulo="Situação da Reserva"
        opcoes={opcoesSituacao}
        selecionados={situacaoSelecionada}
        onToggle={(valor) => toggle(situacaoSelecionada, setSituacaoSelecionada, valor)}
        cores={coresSituacao}
        onCorChange={(valor, cor) => setCoresSituacao((prev) => ({ ...prev, [valor]: cor }))}
      />

      <p className="text-xs text-gray-400">
        Sem nenhuma opção marcada numa lista, o bucket mostra reservas de todos os valores dela. A cor
        escolhida em cada opção é a que aparece no card.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleSalvar} loading={salvando}>
          Salvar filtros
        </Button>
      </div>
    </div>
  );
}

function ChecklistFiltro({ titulo, opcoes, selecionados, onToggle, cores, onCorChange }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">{titulo}</p>
      {opcoes.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma opção encontrada.</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-2">
          {opcoes.map((opcao) => (
            <div
              key={opcao.value}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50"
            >
              <input
                type="color"
                value={cores[opcao.value] || '#e5e7eb'}
                onChange={(e) => onCorChange(opcao.value, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                title={`Cor do card para "${opcao.label}"`}
                className="h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-gray-200 p-0"
              />
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selecionados.includes(opcao.value)}
                  onChange={() => onToggle(opcao.value)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                />
                {opcao.label}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
