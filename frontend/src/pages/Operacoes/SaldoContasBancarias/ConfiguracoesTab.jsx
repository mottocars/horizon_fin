import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Settings } from 'lucide-react';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { getComunicarSaldos, salvarComunicarSaldos } from '../../../api/saldoContasBancarias.api';

const ROTULO_PERMISSAO = { MASTER: 'Master', ADMINISTRADOR: 'Administrador', BASICO: 'Básico' };

// Parâmetros da tela de Saldo Contas Bancárias — por enquanto só "Comunicar Saldos": quem deve
// ser avisado sobre os saldos lançados desta empresa. A lista de elegíveis (todo MASTER +
// ADMINISTRADOR/BASICO vinculado a esta empresa) vem pronta do backend — ver
// saldos.service.js::listUsuariosComunicarSaldos. Só guarda os destinatários escolhidos; o
// envio em si ainda não existe, isso fica pra quando for pedido.
export default function ConfiguracoesTab({ empresaId }) {
  const [carregando, setCarregando] = useState(true);
  const [elegiveis, setElegiveis] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    getComunicarSaldos(empresaId)
      .then((dados) => {
        setElegiveis(dados.elegiveis);
        setSelecionados(dados.selecionados);
      })
      .catch(() => setErro('Não foi possível carregar os usuários.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleSalvar() {
    setErro('');
    setSalvo(false);
    setSalvando(true);
    try {
      await salvarComunicarSaldos(empresaId, selecionados);
      setSalvo(true);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e ajustar os parâmetros desta tela.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      <div className="max-w-lg space-y-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Comunicar Saldos</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Quem deve ser avisado sobre os saldos lançados desta empresa. A lista já traz todos os
            Master e os Administradores/Básicos com acesso a esta empresa.
          </p>
        </div>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        {carregando ? (
          <div className="py-6 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <>
            <SearchableSelect
              multiple
              value={selecionados}
              onChange={(valores) => {
                setSelecionados(valores);
                setSalvo(false);
              }}
              options={elegiveis.map((u) => ({ value: u.id, label: `${u.nome} (${ROTULO_PERMISSAO[u.permissao] || u.permissao})` }))}
              placeholder="Nenhum usuário selecionado"
              emptyMessage="Nenhum usuário elegível encontrado."
            />

            <div className="flex items-center gap-3 pt-1">
              <Button type="button" onClick={handleSalvar} loading={salvando}>
                Salvar
              </Button>
              {salvo && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 size={15} /> Salvo
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
