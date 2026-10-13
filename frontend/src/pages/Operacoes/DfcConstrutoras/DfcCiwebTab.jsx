import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Download, FileText, Globe, Sheet, Trash2, TriangleAlert } from 'lucide-react';
import {
  baixarDcd,
  excluirDcd,
  exportarDcd,
  exportarDcdTodos,
  importarDcd,
  listDcdContratos,
} from '../../../api/dcd.api';
import {
  baixarExtrato,
  excluirExtrato,
  exportarExtrato,
  exportarExtratoTodos,
  importarExtrato,
  listExtratoEmpreendimentos,
} from '../../../api/extrato.api';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';

// Mesmas APIs e regras da tela Integrações > Portal das Construtoras (PortalConstrutorasPage.jsx)
// — esta aba é um espelho dela, só com DCD e Extrato: os dados são os mesmos (importar aqui
// aparece lá, e vice-versa).
const TIPOS_CIWEB = {
  DCD: {
    label: 'DCD',
    labelLongo: 'DCD',
    cor: 'bg-emerald-50 text-emerald-600',
    listar: listDcdContratos,
    importar: importarDcd,
    baixar: baixarDcd,
    exportar: exportarDcd,
    exportarTodos: exportarDcdTodos,
    excluir: excluirDcd,
    idField: 'numero_contrato',
    extensaoArquivo: 'pdf',
    aceita: '.pdf,application/pdf',
    resumoImportacao: (r) =>
      `${r.nome_empreendimento || r.numero_contrato} — ${r.quantidade_parcelas_ff} parcela(s) no cronograma físico-financeiro, ${r.quantidade_parcelas_liberacao} na liberação.`,
  },
  EXTRATO: {
    label: 'Extrato',
    labelLongo: 'Extrato Empreendimentos',
    cor: 'bg-orange-50 text-orange-600',
    listar: listExtratoEmpreendimentos,
    importar: importarExtrato,
    baixar: baixarExtrato,
    exportar: exportarExtrato,
    exportarTodos: exportarExtratoTodos,
    excluir: excluirExtrato,
    idField: 'contrato_empreendimento',
    extensaoArquivo: 'xls',
    aceita: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    resumoImportacao: (r) =>
      `${r.quantidade_empreendimentos} empreendimento(s) importado(s): ${r.empreendimentos
        .map((e) => `${e.nome_empreendimento} (${e.quantidade_unidades} unidade(s))`)
        .join(', ')}`,
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

// Operações > DFC Construtoras > CIWEB: os DCDs e Extratos importados do portal da Caixa, na
// mesma tabela (cabeçalho azul, linhas compactas) das outras abas da DFC. Os botões de importar
// e "Exportar Tudo" ficam na barra de filtros da página (padrão do sistema) — esta aba expõe
// `importar(tipo)` e `exportarTudo(tipo)` via ref.
const DfcCiwebTab = forwardRef(function DfcCiwebTab({ empresaId, search, tipo }, ref) {
  const alert = useAlert();
  const confirm = useConfirm();
  const fileInputRef = useRef(null);
  const [tipoArquivo, setTipoArquivo] = useState('DCD');
  const [importados, setImportados] = useState({ DCD: [], EXTRATO: [] });
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, arquivo: '', tipo: '' });
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

  function abrirSeletor(t) {
    setTipoArquivo(t);
    // adia o clique pro `accept` do input já estar com o tipo novo
    requestAnimationFrame(() => fileInputRef.current?.click());
  }

  async function exportarTudo(t) {
    const api = TIPOS_CIWEB[t];
    if (importados[t].length === 0) {
      await alert({
        title: `Nenhum ${api.labelLongo} importado`,
        description: `Importe pelo menos um ${api.labelLongo} antes de exportar tudo.`,
        variant: 'default',
      });
      return;
    }
    try {
      baixarBlob(await api.exportarTodos(empresaId), `${t}-empresa-${empresaId}-todos.xlsx`);
    } catch {
      await alert({ title: 'Não foi possível exportar o Excel', description: 'Tente novamente em instantes.', variant: 'warning' });
    }
  }

  useImperativeHandle(ref, () => ({ importar: abrirSeletor, exportarTudo }));

  // Mesmo fluxo de PortalConstrutorasPage.jsx::handleFileSelected: vários arquivos, um por vez,
  // com barra de progresso e um resumo no final.
  async function handleArquivos(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    const t = tipoArquivo;
    const api = TIPOS_CIWEB[t];

    setImportando(true);
    setProgresso({ atual: 0, total: arquivos.length, arquivo: '', tipo: t });
    const sucessos = [];
    const falhas = [];
    try {
      for (let i = 0; i < arquivos.length; i += 1) {
        setProgresso({ atual: i + 1, total: arquivos.length, arquivo: arquivos[i].name, tipo: t });
        try {
          sucessos.push(await api.importar(empresaId, arquivos[i]));
        } catch (err) {
          falhas.push({ arquivo: arquivos[i], message: err.response?.data?.message || 'Erro ao processar o arquivo.' });
        }
      }
      await carregar([t]);

      if (arquivos.length === 1 && sucessos.length === 1) {
        await alert({ title: `${api.labelLongo} importado com sucesso`, description: api.resumoImportacao(sucessos[0]), variant: 'default' });
      } else if (arquivos.length === 1 && falhas.length === 1) {
        await alert({ title: `Não foi possível importar o ${api.labelLongo}`, description: falhas[0].message, variant: 'warning' });
      } else {
        const linhas = [
          ...sucessos.map((r) => `• ${api.resumoImportacao(r)}`),
          ...falhas.map((f) => `• ${f.arquivo.name}: ${f.message}`),
        ];
        await alert({
          title: `Importação concluída: ${sucessos.length} de ${arquivos.length} arquivo(s)`,
          description: linhas.join('\n') || 'Nenhum arquivo processado.',
          variant: falhas.length > 0 ? 'warning' : 'default',
        });
      }
    } finally {
      setImportando(false);
    }
  }

  async function handleBaixar(envio) {
    const api = TIPOS_CIWEB[envio.tipo];
    setOcupado(`baixar|${envio.tipo}|${envio.contrato}`);
    try {
      baixarBlob(await api.baixar(empresaId, envio.contrato), `${envio.tipo}-${envio.contrato}.${api.extensaoArquivo}`);
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
      baixarBlob(await api.exportar(empresaId, envio.contrato), `${envio.tipo}-${envio.contrato}.xlsx`);
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
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver e importar os DCDs e Extratos.</p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      <input
        ref={fileInputRef}
        type="file"
        accept={TIPOS_CIWEB[tipoArquivo].aceita}
        multiple
        className="hidden"
        onChange={handleArquivos}
      />

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
              ? 'Nenhum DCD ou Extrato importado ainda.'
              : 'Nenhuma importação encontrada para esse filtro.'}
          </p>
          <p className="max-w-sm text-xs text-gray-400">Use os botões Importar DCD / Importar Extrato acima.</p>
        </div>
      ) : (
        <div className="rounded-b-card pb-1">
          <div
            className={`${GRADE} border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
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

      {importando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="w-full max-w-sm rounded-card bg-white p-6 shadow-card">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={22} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">
              Importando arquivos {TIPOS_CIWEB[progresso.tipo]?.labelLongo || ''}
            </h2>
            <p className="mt-1.5 truncate text-sm text-gray-500">{progresso.arquivo || 'Preparando...'}</p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }}
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
});

export default DfcCiwebTab;
