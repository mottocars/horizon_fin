import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, Plus, RefreshCw, UploadCloud } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import Modal from '../../../components/Modal';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { listCertificados, criarCertificado, substituirCertificado } from '../../../api/certificados.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

function estaVencido(validadeAte) {
  if (!validadeAte) return false;
  return new Date(validadeAte) < new Date();
}

function formatarData(data) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

const emptyForm = { senha: '', arquivo: null };

export default function CertificadosDigitaisPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  const [certificados, setCertificados] = useState([]);
  const [loadingCertificados, setLoadingCertificados] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [certificadoEditando, setCertificadoEditando] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

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

  function carregarCertificados() {
    if (!empresaId) return;
    setLoadingCertificados(true);
    listCertificados(empresaId)
      .then(setCertificados)
      .finally(() => setLoadingCertificados(false));
  }

  useEffect(() => {
    setCertificados([]);
    carregarCertificados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function abrirModalNovo() {
    setCertificadoEditando(null);
    setForm(emptyForm);
    setFieldErrors({});
    setError('');
    setModalAberto(true);
  }

  function abrirModalSubstituir(certificado) {
    setCertificadoEditando(certificado);
    setForm({ senha: '', arquivo: null });
    setFieldErrors({});
    setError('');
    setModalAberto(true);
  }

  function fecharModal() {
    if (saving) return;
    setModalAberto(false);
    setCertificadoEditando(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.senha) errors.senha = 'Informe a senha do certificado.';
    if (!form.arquivo) errors.arquivo = 'Selecione o arquivo .pfx.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (certificadoEditando) {
        await substituirCertificado(certificadoEditando.id, form);
      } else {
        await criarCertificado(empresaId, form);
      }
      fecharModal();
      carregarCertificados();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o certificado.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Certificados Digitais</h2>
              <p className="text-xs text-gray-500">
                Cada empresa pode ter vários certificados .pfx instalados no servidor.
              </p>
            </div>
          </div>

          <div className="sm:w-96">
            <label className="mb-1 block text-xs font-medium text-gray-500">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={setEmpresaId}
              disabled={loadingEmpresas || empresaTravada}
              options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
              placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
        </div>
      </Card>

      {empresaId && (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Certificados cadastrados</h3>
            <Button onClick={abrirModalNovo}>
              <Plus size={16} />
              Adicionar certificado
            </Button>
          </div>

          {loadingCertificados ? (
            <div className="py-10 text-center text-sm text-gray-400">Carregando...</div>
          ) : certificados.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              Nenhum certificado cadastrado para esta empresa ainda.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">Validade</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {certificados.map((certificado) => {
                  const vencido = estaVencido(certificado.validade_ate);
                  return (
                    <tr
                      key={certificado.id}
                      className={`border-b border-gray-50 last:border-0 ${vencido ? 'bg-red-100' : 'bg-emerald-100'}`}
                    >
                      <td
                        className={`border-l-4 px-5 py-1.5 text-gray-900 ${
                          vencido ? 'border-l-red-500' : 'border-l-emerald-500'
                        }`}
                      >
                        {certificado.nome}
                      </td>
                      <td className="px-5 py-1.5">
                        {vencido ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                            <AlertTriangle size={13} />
                            Vencido em {formatarData(certificado.validade_ate)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={13} />
                            Válido até {formatarData(certificado.validade_ate)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="Substituir certificado"
                            onClick={() => abrirModalSubstituir(certificado)}
                            className="hover:text-primary-600"
                          >
                            <RefreshCw size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Modal
        open={modalAberto}
        onClose={fecharModal}
        title={certificadoEditando ? `Substituir certificado — ${certificadoEditando.nome}` : 'Adicionar certificado'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <p className="text-xs text-gray-500">
            O nome do certificado é lido automaticamente de dentro do arquivo .pfx.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Arquivo (.pfx)</label>
            <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">
              <UploadCloud size={16} />
              {form.arquivo ? form.arquivo.name : 'Selecionar arquivo .pfx'}
              <input
                type="file"
                accept=".pfx"
                disabled={saving}
                className="hidden"
                onChange={(e) => setForm((prev) => ({ ...prev, arquivo: e.target.files?.[0] || null }))}
              />
            </label>
            {fieldErrors.arquivo && <p className="mt-1 text-xs text-red-600">{fieldErrors.arquivo}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha do certificado</label>
            <input
              type="password"
              name="certificado_senha"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              value={form.senha}
              onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
              disabled={saving}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {fieldErrors.senha && <p className="mt-1 text-xs text-red-600">{fieldErrors.senha}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={fecharModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {certificadoEditando ? 'Substituir' : 'Instalar certificado'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
