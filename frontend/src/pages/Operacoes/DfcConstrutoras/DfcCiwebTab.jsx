import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Download, Globe, Sheet, Trash2, TriangleAlert } from 'lucide-react';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';
import ImportarCiwebModal from './ImportarCiwebModal';
// Mesmas APIs e regras da tela Integrações > Portal das Construtoras (ver ciwebTipos.js).
import { TIPOS_CIWEB } from './ciwebTipos';

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
      ) : (
        <div>
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Número Contrato</span>
            <span>Empreendimento</span>
            <span>Tipo</span>
            <span>Enviado por</span>
            <span>Importado em</span>
            <span className="text-right">Ações</span>
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhum registro (pedido do usuário). */}
          {envios.length === 0 ? (
            <div className="flex flex-col items-center gap-1 border-b border-gray-100 py-10 text-center">
              <Globe size={26} className="mb-1 text-gray-300" />
              <p className="text-sm text-gray-600">
                {importados.DCD.length + importados.EXTRATO.length === 0
                  ? 'Nenhum DCD ou Geral importado ainda.'
                  : 'Nenhuma importação encontrada para esse filtro.'}
              </p>
              <p className="max-w-sm text-xs text-gray-400">Use o botão de importar no canto direito, acima.</p>
            </div>
          ) : (
            envios.map((envio) => {
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
          })
          )}
        </div>
      )}

      <ImportarCiwebModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        empresaId={empresaId}
        onImportado={(t) => carregar([t])}
      />
    </div>
  );
});

export default DfcCiwebTab;
