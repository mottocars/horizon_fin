import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { CalendarClock, Download, FileBarChart, Globe, Sheet, Trash2, TriangleAlert, UploadCloud } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { baixarDcd, excluirDcd, exportarDcd, importarDcd, listDcdContratos } from '../../../api/dcd.api';
import {
  baixarExtrato,
  excluirExtrato,
  exportarExtrato,
  importarExtrato,
  listExtratoEmpreendimentos,
} from '../../../api/extrato.api';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';

// Mesmas APIs e regras da tela Integrações > Portal das Construtoras (PortalConstrutorasPage.jsx)
// — esta aba é um espelho dela, só com DCD e Geral (o antigo "Extrato dos Empreendimentos";
// por baixo, a API e as tabelas continuam com o nome extrato): os dados são os mesmos
// (importar aqui aparece lá, e vice-versa).
const TIPOS_CIWEB = {
  DCD: {
    label: 'DCD',
    labelLongo: 'DCD',
    descricao: 'Demonstrativo de Cronograma de Desembolso',
    formato: 'PDF',
    icone: CalendarClock,
    cor: 'bg-emerald-50 text-emerald-600',
    prefixoArquivo: 'DCD',
    listar: listDcdContratos,
    importar: importarDcd,
    baixar: baixarDcd,
    exportar: exportarDcd,
    excluir: excluirDcd,
    idField: 'numero_contrato',
    extensaoArquivo: 'pdf',
    aceita: '.pdf,application/pdf',
  },
  EXTRATO: {
    label: 'Geral',
    labelLongo: 'Geral dos Empreendimentos',
    descricao: 'Geral completo por empreendimento',
    formato: 'Excel (.xls / .xlsx)',
    icone: FileBarChart,
    cor: 'bg-orange-50 text-orange-600',
    prefixoArquivo: 'GERAL',
    listar: listExtratoEmpreendimentos,
    importar: importarExtrato,
    baixar: baixarExtrato,
    exportar: exportarExtrato,
    excluir: excluirExtrato,
    idField: 'contrato_empreendimento',
    extensaoArquivo: 'xls',
    aceita: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
};

const GRADE = 'grid grid-cols-[160px_minmax(0,1fr)_110px_180px_140px_120px] items-center gap-3';

function formatarDataHora(data) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function baixarBlob(blob, nome) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function BotaoIcone({ title, onClick, disabled, hover, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors disabled:opacity-60 ${hover}`}
    >
      {children}
    </button>
  );
}

// Janela de importação: escolhe o tipo (DCD ou Geral), seleciona um ou mais arquivos e importa.
// Mostra o progresso ali mesmo; no fim só avisa que deu certo (sem log detalhado — pedido do
// usuário), listando apenas os arquivos que falharam, se algum falhar.
function ImportarModal({ open, onClose, empresaId, onImportado }) {
  const alert = useAlert();
  const inputRef = useRef(null);
  const [tipo, setTipo] = useState('DCD');
  const [arquivos, setArquivos] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, arquivo: '' });

  useEffect(() => {
    if (!open) return;
    setTipo('DCD');
    setArquivos([]);
    setProgresso({ atual: 0, total: 0, arquivo: '' });
  }, [open]);

  function escolherTipo(t) {
    if (t === tipo) return;
    setTipo(t);
    setArquivos([]); // os aceitos mudam de PDF pra Excel
  }

  async function importar() {
    const api = TIPOS_CIWEB[tipo];
    setImportando(true);
    const falhas = [];
    try {
      for (let i = 0; i < arquivos.length; i += 1) {
        setProgresso({ atual: i + 1, total: arquivos.length, arquivo: arquivos[i].name });
        try {
          await api.importar(empresaId, arquivos[i]);
        } catch (err) {
          falhas.push(`• ${arquivos[i].name}: ${err.response?.data?.message || 'erro ao processar o arquivo.'}`);
        }
      }
      await onImportado(tipo);
    } finally {
      setImportando(false);
    }
    onClose();
    const ok = arquivos.length - falhas.length;
    if (falhas.length === 0) {
      await alert({
        title: 'Importação concluída com sucesso',
        description: `${ok} arquivo(s) ${api.labelLongo} importado(s).`,
        variant: 'default',
      });
    } else {
      await alert({
        title: ok > 0 ? `Importação concluída: ${ok} de ${arquivos.length} arquivo(s)` : 'Não foi possível importar',
        description: `Não importado(s):\n${falhas.join('\n')}`,
        variant: 'warning',
      });
    }
  }

  return (
    <Modal open={open} onClose={importando ? () => {} : onClose} title="Importar">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">O que vai importar?</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TIPOS_CIWEB).map(([t, info]) => {
              const Icone = info.icone;
              const ativo = tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={importando}
                  onClick={() => escolherTipo(t)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                    ativo ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-100' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${info.cor}`}>
                    <Icone size={16} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{info.label}</span>
                    <span className="block text-xs text-gray-500">{info.descricao}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_CIWEB[tipo].aceita}
            multiple
            className="hidden"
            onChange={(e) => {
              setArquivos(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={importando}
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-60"
          >
            <UploadCloud size={16} className="shrink-0" />
            {arquivos.length === 0
              ? `Selecionar arquivo(s) — ${TIPOS_CIWEB[tipo].formato}`
              : `${arquivos.length} arquivo(s) selecionado(s) — clique para trocar`}
          </button>
        </div>

        {importando && (
          <div>
            <p className="truncate text-xs text-gray-500">{progresso.arquivo}</p>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary-600 transition-all duration-300"
                style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-gray-400">
              {progresso.atual} de {progresso.total}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={importando}>
            Cancelar
          </Button>
          <Button type="button" onClick={importar} disabled={arquivos.length === 0} loading={importando}>
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Operações > DFC Construtoras > CIWEB: os DCDs e Gerais importados do portal da Caixa, na
// mesma tabela (cabeçalho azul, linhas compactas) das outras abas da DFC. O botão de importar
// fica na barra de filtros da página (padrão do sistema) — esta aba expõe `abrirImportacao()`
// via ref; a janela de importação vive aqui.
const DfcCiwebTab = forwardRef(function DfcCiwebTab({ empresaId, search, tipo }, ref) {
  const alert = useAlert();
  const confirm = useConfirm();
  const [importados, setImportados] = useState({ DCD: [], EXTRATO: [] });
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [ocupado, setOcupado] = useState(''); // `${acao}|${tipo}|${contrato}` em andamento

  const carregar = useCallback(
    async (tipos = ['DCD', 'EXTRATO']) => {
      if (!empresaId) return;
      setErroCarga('');
      try {
        const resultados = await Promise.all(tipos.map((t) => TIPOS_CIWEB[t].listar(empresaId)));
        setImportados((prev) => ({ ...prev, ...Object.fromEntries(tipos.map((t, i) => [t, resultados[i]])) }));
      } catch (err) {
        setErroCarga(err.response?.data?.message || 'Não foi possível carregar as importações.');
      } finally {
        setCarregando(false);
      }
    },
    [empresaId]
  );

  useEffect(() => {
    setImportados({ DCD: [], EXTRATO: [] });
    setCarregando(true);
    carregar();
  }, [carregar]);

  useImperativeHandle(ref, () => ({ abrirImportacao: () => setModalAberto(true) }));

  async function handleBaixar(envio) {
    const api = TIPOS_CIWEB[envio.tipo];
    setOcupado(`baixar|${envio.tipo}|${envio.contrato}`);
    try {
      baixarBlob(await api.baixar(empresaId, envio.contrato), `${api.prefixoArquivo}-${envio.contrato}.${api.extensaoArquivo}`);
    } catch {
      await alert({ title: 'Não foi possível baixar o arquivo', description: 'Tente novamente em instantes.', variant: 'warning' });
    } finally {
      setOcupado('');
    }
  }

  async function handleExportar(envio) {
    const api = TIPOS_CIWEB[envio.tipo];
    setOcupado(`exportar|${envio.tipo}|${envio.contrato}`);
    try {
      baixarBlob(await api.exportar(empresaId, envio.contrato), `${api.prefixoArquivo}-${envio.contrato}.xlsx`);
    } catch {
      await alert({ title: 'Não foi possível exportar o Excel', description: 'Tente novamente em instantes.', variant: 'warning' });
    } finally {
      setOcupado('');
    }
  }

  async function handleExcluir(envio) {
    const api = TIPOS_CIWEB[envio.tipo];
    const ok = await confirm({
      title: `Excluir ${api.labelLongo}?`,
      description: `${envio.empreendimento} (${envio.contrato}) será removido permanentemente, junto com o arquivo enviado — também da tela Portal das Construtoras. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    setOcupado(`excluir|${envio.tipo}|${envio.contrato}`);
    try {
      await api.excluir(empresaId, envio.contrato);
      await carregar([envio.tipo]);
    } catch {
      await alert({ title: 'Não foi possível excluir o registro', description: 'Tente novamente em instantes.', variant: 'warning' });
    } finally {
      setOcupado('');
    }
  }

  const envios = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return ['DCD', 'EXTRATO']
      .filter((t) => !tipo || tipo === t)
      .flatMap((t) =>
        importados[t].map((item) => ({
          tipo: t,
          contrato: item[TIPOS_CIWEB[t].idField],
          empreendimento: item.nome_empreendimento,
          enviadoPor: item.enviado_por,
          importadoEm: item.atualizado_em || item.importado_em,
        }))
      )
      .filter(
        (e) => !termo || (e.empreendimento || '').toLowerCase().includes(termo) || String(e.contrato).includes(termo)
      )
      .sort((a, b) => String(a.contrato).localeCompare(String(b.contrato)) || a.tipo.localeCompare(b.tipo));
  }, [importados, tipo, search]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Globe size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver e importar os DCDs e Gerais.</p>
      </div>
    );
  }

  return (
    // Tabela dentro do quadro branco, com margem em volta (p-5) e cabeçalho de cantos de cima
    // arredondados — mesmo padrão da tabela do Espião NFe / NFSe (pedido do usuário).
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={() => carregar()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : envios.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Globe size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">
            {importados.DCD.length + importados.EXTRATO.length === 0
              ? 'Nenhum DCD ou Geral importado ainda.'
              : 'Nenhuma importação encontrada para esse filtro.'}
          </p>
          <p className="max-w-sm text-xs text-gray-400">Use o botão de importar no canto direito, acima.</p>
        </div>
      ) : (
        <div>
          <div
            className={`${GRADE} rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Número Contrato</span>
            <span>Empreendimento</span>
            <span>Tipo</span>
            <span>Enviado por</span>
            <span>Importado em</span>
            <span className="text-right">Ações</span>
          </div>

          {envios.map((envio) => {
            const chave = `${envio.tipo}|${envio.contrato}`;
            return (
              <div key={chave} className={`${GRADE} border-b border-gray-100 bg-white py-1.5 pl-4 pr-4 hover:bg-gray-50`}>
                <span className="truncate text-xs tabular-nums text-gray-600">{envio.contrato}</span>
                <span className="truncate text-xs font-medium text-gray-800" title={envio.empreendimento}>
                  {envio.empreendimento || '—'}
                </span>
                <span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TIPOS_CIWEB[envio.tipo].cor}`}>
                    {TIPOS_CIWEB[envio.tipo].label}
                  </span>
                </span>
                <span className="truncate text-xs text-gray-600">{envio.enviadoPor || '—'}</span>
                <span className="text-xs tabular-nums text-gray-600">{formatarDataHora(envio.importadoEm)}</span>
                <span className="flex items-center justify-end gap-0.5">
                  <BotaoIcone
                    title="Baixar último arquivo enviado"
                    onClick={() => handleBaixar(envio)}
                    disabled={ocupado === `baixar|${chave}`}
                    hover="hover:bg-primary-50 hover:text-primary-600"
                  >
                    <Download size={14} />
                  </BotaoIcone>
                  <BotaoIcone
                    title="Exportar para Excel"
                    onClick={() => handleExportar(envio)}
                    disabled={ocupado === `exportar|${chave}`}
                    hover="hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Sheet size={14} />
                  </BotaoIcone>
                  <BotaoIcone
                    title="Excluir registro"
                    onClick={() => handleExcluir(envio)}
                    disabled={ocupado === `excluir|${chave}`}
                    hover="hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </BotaoIcone>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ImportarModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        empresaId={empresaId}
        onImportado={(t) => carregar([t])}
      />
    </div>
  );
});

export default DfcCiwebTab;
