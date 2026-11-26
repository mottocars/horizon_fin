import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import Card from '../../components/Card';
import SearchableSelect from '../../components/SearchableSelect';
import EtapasCentroCustoEditor from './EtapasCentroCustoEditor';
import PacotesPilaresEditor from './PacotesPilaresEditor';
import { listEmpresas } from '../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

// "Repasses CEF" saiu daqui — agora é a aba Máscaras da própria tela de
// Repasses CEF (ver RepassesCef/MascarasRepassesCef.jsx), porque faz mais
// sentido cadastrar aquela máscara junto do Kanban que ela alimenta. O tipo
// COBRANCAS (nunca chegou a ser usado) saiu de vez: a aba "Régua de
// Cobrança" de Gestão de Cobranças (ver GestaoCobrancas/ReguaCobranca/) não
// é uma máscara, é uma tela própria. DRE, DFC, Submáscara DRE e Submáscara DFC
// saíram em 26/11/2026 (pedido do usuário): a DRE e a DFC têm as máscaras
// delas nas próprias telas (DRE Gerencial e DFC Construtoras › Máscaras).
// Pacotes e Pilares têm Responsável (seletor na linha, MascaraItensEditor).
const TIPOS = [
  { value: 'PACOTES', label: 'Pacotes' },
  { value: 'PILARES', label: 'Pilares' },
  { value: 'ETAPAS_CENTRO_CUSTO', label: 'Etapas do Centro de Custo' },
];

export default function MascarasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [tipo, setTipo] = useState('PACOTES');

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  // Administrador é restrito à própria empresa — o seletor já vem
  // preenchido com ela e travado.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);


  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={setEmpresaId}
              disabled={loadingEmpresas || empresaTravada}
              options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
              placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>

          {empresaId && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Classificação</label>
              <SearchableSelect
                value={tipo}
                onChange={setTipo}
                options={TIPOS}
                placeholder="Selecione"
                clearable={false}
              />
            </div>
          )}
        </div>

        {!empresaId ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <Building2 size={22} />
            </div>
            <p className="text-sm font-medium text-gray-700">
              Selecione uma empresa para ver ou cadastrar a máscara.
            </p>
            <p className="text-xs text-gray-400">
              Cada empresa tem seus próprios Pacotes, Pilares e Etapas do Centro de Custo.
            </p>
          </div>
        ) : tipo === 'ETAPAS_CENTRO_CUSTO' ? (
          // Etapas do Centro de Custo é a lista única de etapas de obra — editor próprio, com cor,
          // arrastar e o resto (pedido do usuário).
          <EtapasCentroCustoEditor
            key={empresaId}
            empresaId={empresaId}
            aviso="Usada no Histórico de Etapas dos centros de custo e no cronograma de Operações › Cronogramas Obras."
          />
        ) : (
          // Pacotes e Pilares: a mesma tabela das Etapas, com o Responsável de cada item (pedido do usuário).
          <PacotesPilaresEditor
            key={`${tipo}-${empresaId}`}
            tipo={tipo}
            empresaId={empresaId}
            aviso={
              tipo === 'PACOTES'
                ? 'Pacote de cada conta em Cadastros › Planos Financeiros; usado na Gestão Matricial (dashboard Econômico/Financeiro).'
                : 'Pilar de cada centro de custo em Cadastros › Centros de Custos; usado na Gestão Matricial (dashboard Econômico/Financeiro).'
            }
          />
        )}
      </Card>
    </div>
  );
}
