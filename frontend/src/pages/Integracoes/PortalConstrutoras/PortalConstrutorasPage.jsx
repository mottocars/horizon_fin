import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Download, FileSpreadsheet, CalendarClock, FileBarChart, Search, FileText, Sheet, Trash2 } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  listEprEmpreendimentos,
  importarEpr,
  baixarEpr,
  exportarEpr,
  exportarEprTodos,
  excluirEpr,
} from '../../../api/epr.api';
import {
  listDcdContratos,
  importarDcd,
  baixarDcd,
  exportarDcd,
  exportarDcdTodos,
  excluirDcd,
} from '../../../api/dcd.api';
import {
  listExtratoEmpreendimentos,
  importarExtrato,
  baixarExtrato,
  exportarExtrato,
  exportarExtratoTodos,
  excluirExtrato,
} from '../../../api/extrato.api';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import iconPortalConstrutoras from '../../../assets/integracoes/portal-construtoras.svg';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';

const TIPO_CORES = {
  EPR: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    bgHover: 'group-hover:bg-blue-100',
    textHover: 'group-hover:text-blue-500',
  },
  DCD: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    bgHover: 'group-hover:bg-emerald-100',
    textHover: 'group-hover:text-emerald-500',
  },
  EXTRATO: {
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    bgHover: 'group-hover:bg-orange-100',
    textHover: 'group-hover:text-orange-500',
  },
};

const IMPORT_CARDS = [
  {
    key: 'EPR',
    title: 'Importar EPR',
    subtitle: 'Consulta Extrato Empreendimento',
    icon: FileSpreadsheet,
  },
  {
    key: 'DCD',
    title: 'Importar DCD',
    subtitle: 'Demonstrativo de Cronograma de Desembolso',
    icon: CalendarClock,
  },
  {
    key: 'EXTRATO',
    title: 'Extrato dos Empreendimentos',
    subtitle: 'Extrato completo por empreendimento',
    icon: FileBarChart,
  },
];

const TIPO_LABELS = {
  EPR: 'EPR',
  DCD: 'DCD',
  EXTRATO: 'Extrato Empreendimentos',
};

const TABS = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'EPR', label: 'EPR' },
  { key: 'DCD', label: 'DCD' },
  { key: 'EXTRATO', label: 'Extrato' },
];

// API por tipo — permite tratar EPR, DCD e EXTRATO de forma genérica nos handlers abaixo.
const TIPO_API = {
  EPR: {
    listar: listEprEmpreendimentos,
    importar: importarEpr,
    baixar: baixarEpr,
    exportar: exportarEpr,
    exportarTodos: exportarEprTodos,
    excluir: excluirEpr,
    idField: 'contrato_mestre_obra',
    extensaoArquivo: 'pdf',
    resumoImportacao: (r) =>
      `${r.nome_empreendimento || r.contrato_mestre_obra} — ${r.quantidade_mutuarios} mutuário(s) importado(s).`,
  },
  DCD: {
    listar: listDcdContratos,
    importar: importarDcd,
    baixar: baixarDcd,
    exportar: exportarDcd,
    exportarTodos: exportarDcdTodos,
    excluir: excluirDcd,
    idField: 'numero_contrato',
    extensaoArquivo: 'pdf',
    resumoImportacao: (r) =>
      `${r.nome_empreendimento || r.numero_contrato} — ${r.quantidade_parcelas_ff} parcela(s) no cronograma físico-financeiro, ${r.quantidade_parcelas_liberacao} na liberação.`,
  },
  EXTRATO: {
    listar: listExtratoEmpreendimentos,
    importar: importarExtrato,
    baixar: baixarExtrato,
    exportar: exportarExtrato,
    exportarTodos: exportarExtratoTodos,
    excluir: excluirExtrato,
    idField: 'contrato_empreendimento',
    extensaoArquivo: 'xls',
    resumoImportacao: (r) =>
      `${r.quantidade_empreendimentos} empreendimento(s) importado(s): ${r.empreendimentos
        .map((e) => `${e.nome_empreendimento} (${e.quantidade_unidades} unidade(s))`)
        .join(', ')}`,
  },
};

export default function PortalConstrutorasPage() {
  const alert = useAlert();
  const confirm = useConfirm();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const fileInputRef = useRef(null);
  const [fileInputTipo, setFileInputTipo] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [activeTab, setActiveTab] = useState('TODOS');
  const [searchEmpreendimento, setSearchEmpreendimento] = useState('');
  const [importados, setImportados] = useState({ EPR: [], DCD: [], EXTRATO: [] });
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, arquivo: '', tipo: '' });
  const [baixandoContrato, setBaixandoContrato] = useState('');
  const [exportandoContrato, setExportandoContrato] = useState('');
  const [excluindoContrato, setExcluindoContrato] = useState('');
  const [exportandoTudo, setExportandoTudo] = useState(false);

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

  const loadImportados = useCallback(
    async (tipo) => {
      if (!empresaId) return;
      const result = await TIPO_API[tipo].listar(empresaId);
      setImportados((prev) => ({ ...prev, [tipo]: result }));
    },
    [empresaId]
  );

  useEffect(() => {
    loadImportados('EPR');
    loadImportados('DCD');
    loadImportados('EXTRATO');
  }, [loadImportados]);

  const enviosCombinados = useMemo(() => {
    return ['EPR', 'DCD', 'EXTRATO'].flatMap((tipo) =>
      importados[tipo].map((item) => ({
        numero_contrato: item[TIPO_API[tipo].idField],
        empreendimento: item.nome_empreendimento,
        enviadoPor: item.enviado_por,
        tipo,
        real: true,
      }))
    );
  }, [importados]);

  const enviosFiltrados = useMemo(() => {
    const termo = searchEmpreendimento.trim().toLowerCase();
    return enviosCombinados.filter((envio) => {
      const passaTab = activeTab === 'TODOS' || envio.tipo === activeTab;
      const passaBusca = !termo || (envio.empreendimento || '').toLowerCase().includes(termo);
      return passaTab && passaBusca;
    });
  }, [enviosCombinados, activeTab, searchEmpreendimento]);

  function handleImportar(card) {
    setFileInputTipo(card.key);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0 || !fileInputTipo) return;

    const tipo = fileInputTipo;
    const api = TIPO_API[tipo];

    setImportando(true);
    setProgresso({ atual: 0, total: files.length, arquivo: '', tipo });
    const sucessos = [];
    const falhas = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgresso({ atual: i + 1, total: files.length, arquivo: files[i].name, tipo });
        try {
          const result = await api.importar(empresaId, files[i]);
          sucessos.push(result);
        } catch (err) {
          falhas.push({ file: files[i], message: err.response?.data?.message || 'Erro ao processar o arquivo.' });
        }
      }
      await loadImportados(tipo);

      if (files.length === 1 && sucessos.length === 1) {
        await alert({
          title: `${TIPO_LABELS[tipo]} importado com sucesso`,
          description: api.resumoImportacao(sucessos[0]),
          variant: 'default',
        });
      } else if (files.length === 1 && falhas.length === 1) {
        await alert({
          title: `Não foi possível importar o ${TIPO_LABELS[tipo]}`,
          description: falhas[0].message,
          variant: 'warning',
        });
      } else {
        const linhasSucesso = sucessos.map((r) => `• ${api.resumoImportacao(r)}`);
        const linhasFalha = falhas.map((f) => `• ${f.file.name}: ${f.message}`);
        await alert({
          title: `Importação concluída: ${sucessos.length} de ${files.length} arquivo(s)`,
          description: [...linhasSucesso, ...linhasFalha].join('\n') || 'Nenhum arquivo processado.',
          variant: falhas.length > 0 ? 'warning' : 'default',
        });
      }
    } finally {
      setImportando(false);
    }
  }

  async function handleDownload(envio) {
    if (!envio.real) {
      await alert({
        title: 'Arquivo de exemplo',
        description: 'Este registro é apenas ilustrativo. O download real estará disponível quando a importação desse tipo for implementada.',
        variant: 'default',
      });
      return;
    }
    setBaixandoContrato(envio.numero_contrato);
    try {
      const blob = await TIPO_API[envio.tipo].baixar(empresaId, envio.numero_contrato);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envio.tipo}-${envio.numero_contrato}.${TIPO_API[envio.tipo].extensaoArquivo}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await alert({
        title: 'Não foi possível baixar o arquivo',
        description: 'Tente novamente em instantes.',
        variant: 'warning',
      });
    } finally {
      setBaixandoContrato('');
    }
  }

  async function handleExportar(envio) {
    if (!envio.real) {
      await alert({
        title: 'Arquivo de exemplo',
        description: 'Este registro é apenas ilustrativo. A exportação real estará disponível quando a importação desse tipo for implementada.',
        variant: 'default',
      });
      return;
    }
    setExportandoContrato(envio.numero_contrato);
    try {
      const blob = await TIPO_API[envio.tipo].exportar(empresaId, envio.numero_contrato);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${envio.tipo}-${envio.numero_contrato}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await alert({
        title: 'Não foi possível exportar o Excel',
        description: 'Tente novamente em instantes.',
        variant: 'warning',
      });
    } finally {
      setExportandoContrato('');
    }
  }

  async function handleExcluir(envio) {
    if (!envio.real) return;

    const ok = await confirm({
      title: `Excluir ${TIPO_LABELS[envio.tipo]}?`,
      description: `${envio.empreendimento} (${envio.numero_contrato}) será removido permanentemente, junto com o arquivo enviado. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;

    setExcluindoContrato(envio.numero_contrato);
    try {
      await TIPO_API[envio.tipo].excluir(empresaId, envio.numero_contrato);
      await loadImportados(envio.tipo);
    } catch {
      await alert({
        title: 'Não foi possível excluir o registro',
        description: 'Tente novamente em instantes.',
        variant: 'warning',
      });
    } finally {
      setExcluindoContrato('');
    }
  }

  const tipoExportarTudo = ['EPR', 'DCD', 'EXTRATO'].includes(activeTab) ? activeTab : null;

  async function handleExportarTudo() {
    if (!tipoExportarTudo) return;
    if (importados[tipoExportarTudo].length === 0) {
      await alert({
        title: `Nenhum ${TIPO_LABELS[tipoExportarTudo]} importado`,
        description: `Importe pelo menos um ${TIPO_LABELS[tipoExportarTudo]} antes de exportar tudo.`,
        variant: 'default',
      });
      return;
    }
    setExportandoTudo(true);
    try {
      const blob = await TIPO_API[tipoExportarTudo].exportarTodos(empresaId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${tipoExportarTudo}-empresa-${empresaId}-todos.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      await alert({
        title: 'Não foi possível exportar o Excel',
        description: 'Tente novamente em instantes.',
        variant: 'warning',
      });
    } finally {
      setExportandoTudo(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      <Card>
        <div className="mb-5 flex items-center gap-2">
          <img src={iconPortalConstrutoras} alt="" className="h-6 w-6" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Portal das Construtoras</h2>
            <p className="text-xs text-gray-500">
              Selecione a empresa para importar ou consultar os últimos envios.
            </p>
          </div>
        </div>

        <div className="max-w-sm">
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
      </Card>

      {empresaId && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {IMPORT_CARDS.map((card) => {
              const Icon = card.icon;
              const cor = TIPO_CORES[card.key];
              const loading = importando && card.key === fileInputTipo;
              return (
                <button
                  key={card.key}
                  type="button"
                  disabled={importando}
                  onClick={() => handleImportar(card)}
                  className="group flex flex-col items-start gap-3 rounded-card bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
                >
                  <div className="flex w-full items-start justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${cor.bg} ${cor.text} ${cor.bgHover}`}
                    >
                      <Icon size={22} />
                    </div>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-colors ${cor.textHover}`}
                    >
                      <Download size={18} className={loading ? 'animate-bounce' : ''} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {loading ? 'Importando...' : card.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">{card.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <Card>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Últimos envios</h2>
                <p className="text-xs text-gray-500">
                  Um registro por tipo, com o arquivo mais recente enviado.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tipoExportarTudo && (
                  <button
                    type="button"
                    onClick={handleExportarTudo}
                    disabled={exportandoTudo}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Sheet size={16} className="text-emerald-600" />
                    {exportandoTudo ? 'Exportando...' : 'Exportar Tudo'}
                  </button>
                )}
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-1 border-b border-gray-100 sm:border-0">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchEmpreendimento}
                  onChange={(e) => setSearchEmpreendimento(e.target.value)}
                  placeholder="Buscar empreendimento..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {enviosFiltrados.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                Nenhum envio encontrado.
              </div>
            ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 font-medium">Número Contrato</th>
                  <th className="py-3 font-medium">Empreendimento</th>
                  <th className="py-3 font-medium">Tipo</th>
                  <th className="py-3 font-medium">Enviado por</th>
                  <th className="py-3 font-medium text-right">Download</th>
                  <th className="py-3 font-medium text-right">Exportar</th>
                  <th className="py-3 font-medium text-right">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {enviosFiltrados.map((envio) => (
                  <tr
                    key={`${envio.numero_contrato}-${envio.tipo}`}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="py-3 text-gray-600">{envio.numero_contrato}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2 text-gray-900">
                        <Building2 size={14} className="shrink-0 text-gray-300" />
                        {envio.empreendimento}
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TIPO_CORES[envio.tipo].bg} ${TIPO_CORES[envio.tipo].text}`}
                      >
                        {TIPO_LABELS[envio.tipo]}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600">{envio.enviadoPor || '—'}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownload(envio)}
                        disabled={baixandoContrato === envio.numero_contrato}
                        title="Baixar último arquivo enviado"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600 disabled:opacity-60"
                      >
                        <Download size={16} />
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleExportar(envio)}
                        disabled={exportandoContrato === envio.numero_contrato}
                        title="Exportar para Excel"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-60"
                      >
                        <Sheet size={16} />
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleExcluir(envio)}
                        disabled={excluindoContrato === envio.numero_contrato}
                        title="Excluir registro"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </Card>
        </>
      )}

      {importando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-sm rounded-card bg-white p-6 shadow-card">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={22} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Importando arquivos {TIPO_LABELS[progresso.tipo] || ''}
            </h2>
            <p className="mt-1.5 truncate text-sm text-gray-500">
              {progresso.arquivo || 'Preparando...'}
            </p>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{
                  width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-right text-xs text-gray-400">
              {progresso.atual} de {progresso.total}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
