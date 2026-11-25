import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';

// Operações > DFC Construtoras > Máscaras > botão "TIPO PARCELAS" (máscara de nível 2 detalhada por tipo
// de parcela): escolhe quais tipos de parcela do Sienge (PM, FI, AT, CH… — os da empresa) compõem a
// máscara. A mesma conta pode estar em várias máscaras, que se diferenciam pelos tipos — então o tipo que
// já está em outra máscara da mesma conta aparece travado, com o nome dela. Só grava ao Salvar.
// `tipos`: [{ sigla, nome, parcelas }] da empresa; `ocupados`: { sigla: nome da outra máscara }.
// `unico`: máscara com origem CEF — um tipo só (é nele que a Projeção CEF aparece).
export default function TiposParcelaModal({ open, mascara, tipos, ocupados = {}, unico = false, onClose, onSalvar }) {
  const [marcados, setMarcados] = useState([]);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (open) {
      setMarcados(mascara?.parcela_tipos || []);
      setBusca('');
    }
  }, [open, mascara]);

  // Tipo gravado que não existe mais no Sienge continua na lista (pra poder desmarcar).
  const lista = useMemo(() => {
    const conhecidos = new Set(tipos.map((t) => t.sigla));
    const sobras = (mascara?.parcela_tipos || [])
      .filter((s) => !conhecidos.has(s))
      .map((s) => ({ sigla: s, nome: 'Não encontrado nas parcelas do Sienge', parcelas: 0 }));
    const termo = busca.trim().toLowerCase();
    return [...tipos, ...sobras].filter(
      (t) => !termo || t.sigla.toLowerCase().includes(termo) || (t.nome || '').toLowerCase().includes(termo)
    );
  }, [tipos, mascara, busca]);

  function alternar(sigla) {
    setMarcados((atual) =>
      atual.includes(sigla) ? atual.filter((s) => s !== sigla) : unico ? [sigla] : [...atual, sigla]
    );
  }

  const iguais =
    marcados.length === (mascara?.parcela_tipos || []).length &&
    marcados.every((s) => (mascara?.parcela_tipos || []).includes(s));

  return (
    <Modal open={open} onClose={onClose} title="Tipo parcelas" maxWidthClass="max-w-lg">
      <p className="mb-3 text-xs text-gray-500">
        Tipos de parcela do Sienge que compõem <span className="font-semibold text-gray-700">{mascara?.descricao}</span>.
        {unico && (
          <span className="mt-1 block text-amber-700">
            Com origem CEF, a máscara tem um tipo só: é nele que a Projeção CEF aparece (no lugar do Aging desse tipo).
          </span>
        )}
      </p>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar sigla ou nome"
          className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-100">
        {lista.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">
            {tipos.length === 0 ? 'Nenhum tipo de parcela encontrado nas parcelas desta empresa.' : 'Nenhum tipo para essa busca.'}
          </p>
        ) : (
          lista.map((t) => {
            const ativo = marcados.includes(t.sigla);
            const outra = ocupados[t.sigla];
            return (
              <button
                key={t.sigla}
                type="button"
                disabled={!!outra}
                onClick={() => alternar(t.sigla)}
                title={outra ? `Já está na máscara "${outra}", com a mesma conta` : undefined}
                className="flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-primary-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    ativo ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white'
                  } ${outra ? 'opacity-40' : ''}`}
                >
                  {ativo && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={`w-8 shrink-0 text-xs font-semibold tabular-nums ${outra ? 'text-gray-300' : 'text-gray-500'}`}>
                  {t.sigla}
                </span>
                <span className={`min-w-0 flex-1 truncate ${outra ? 'text-gray-300' : 'text-gray-800'}`}>{t.nome}</span>
                {outra ? (
                  <span className="max-w-40 shrink-0 truncate text-[11px] text-gray-400">em {outra}</span>
                ) : (
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                    {t.parcelas.toLocaleString('pt-BR')} parcelas
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {marcados.length} {marcados.length === 1 ? 'tipo selecionado' : 'tipos selecionados'}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={iguais} onClick={() => onSalvar(marcados)}>
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
