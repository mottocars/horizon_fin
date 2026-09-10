import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import Card from '../../components/Card';
import SearchableSelect from '../../components/SearchableSelect';
import MascaraItensEditor from '../../components/MascaraItensEditor';
import { listEmpresas } from '../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

// "Repasses CEF" saiu daqui — agora é a aba Máscaras da própria tela de
// Repasses CEF (ver RepassesCef/MascarasRepassesCef.jsx), porque faz mais
// sentido cadastrar aquela máscara junto do Kanban que ela alimenta. O tipo
// COBRANCAS (nunca chegou a ser usado) saiu de vez: a aba "Régua de
// Cobrança" de Gestão de Cobranças (ver GestaoCobrancas/ReguaCobranca/) não
// é uma máscara, é uma tela própria.
const TIPOS = [
  { value: 'DRE', label: 'DRE' },
  { value: 'DFC', label: 'DFC' },
  { value: 'PACOTES', label: 'Pacotes' },
  { value: 'UNIDADES_NEGOCIO', label: 'Unidades de Negócio' },
  { value: 'ETAPAS_CENTRO_CUSTO', label: 'Etapas do Centro de Custo' },
  { value: 'SUBMASCARA_DRE', label: 'Submáscara DRE' },
  { value: 'SUBMASCARA_DFC', label: 'Submáscara DFC' },
];

export default function MascarasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [tipo, setTipo] = useState('DRE');

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

  const tipoLabel = TIPOS.find((t) => t.value === tipo)?.label;

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
              Cada empresa tem sua própria estrutura de DRE, DFC, Pacotes e Unidades de Negócio.
            </p>
          </div>
        ) : (
          <MascaraItensEditor tipo={tipo} empresaId={empresaId} grupo="" itemLabel={tipoLabel} />
        )}
      </Card>
    </div>
  );
}
