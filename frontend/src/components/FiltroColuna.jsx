import { ListFilter } from 'lucide-react';
import SearchableSelect from './SearchableSelect';

// Filtro multi-seleção no título de uma coluna de relatório (Empreendimentos
// Masa, NF-e / NFS-e Pendentes). Nasce com TODAS as opções marcadas e usa
// "Selecionar todos" no lugar de "Limpar" (pedido do usuário). O estado guarda
// `null` pra "todas marcadas" — ou seja, sem filtro nenhum — em vez da lista
// inteira: assim quem não tem valor naquela dimensão continua aparecendo
// enquanto o usuário não restringir nada, e uma opção nova que chegue depois
// já nasce marcada.
export function valoresDoFiltro(filtro, opcoes) {
  return filtro ?? opcoes.map((opcao) => opcao.value);
}

export function proximoFiltro(selecionados, opcoes) {
  const todas = opcoes.every((opcao) => selecionados.some((v) => String(v) === String(opcao.value)));
  return todas ? null : selecionados;
}

export function passaNoFiltro(filtro, valor) {
  return filtro == null || filtro.some((v) => String(v) === String(valor));
}

// Ícone de filtro compacto ao lado do nome da coluna — mesmo padrão de
// GestaoCobrancas/RotinasTab.jsx::FiltroColuna (SearchableSelect com `multiple` e
// `renderTrigger`, painel com a largura do <th> via `colunaRef`). O ícone só fica
// destacado quando há restrição de fato (filtro != null).
export default function FiltroColuna({ filtro, onChange, opcoes, label, colunaRef }) {
  const ativo = filtro != null;
  return (
    <SearchableSelect
      multiple
      selecionarTodos
      value={valoresDoFiltro(filtro, opcoes)}
      onChange={(selecionados) => onChange(proximoFiltro(selecionados, opcoes))}
      options={opcoes}
      placeholder="Todos"
      emptyMessage="Nenhuma opção encontrada."
      larguraRef={colunaRef}
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title={`Filtrar por ${label}`}
          aria-pressed={ativo}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
            ativo ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-400 hover:bg-white/60 hover:text-primary-700'
          }`}
        >
          <ListFilter size={13} />
        </button>
      )}
    />
  );
}
