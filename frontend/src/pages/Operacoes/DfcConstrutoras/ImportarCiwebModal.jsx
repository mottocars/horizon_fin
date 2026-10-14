import { useEffect, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useAlert } from '../../../confirm/ConfirmContext';
import { TIPOS_CIWEB } from './ciwebTipos';

// Janela de importação do CIWEB: escolhe o tipo (DCD ou Geral), seleciona um ou mais arquivos e
// importa. Usada na aba CIWEB e na janela "Nova versão" da aba Orçamentos (mesma rotina).
// Mostra o progresso ali mesmo; no fim só avisa que deu certo (sem log detalhado — pedido do
// usuário), listando apenas os arquivos que falharam, se algum falhar.
export default function ImportarCiwebModal({ open, onClose, empresaId, onImportado }) {
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
