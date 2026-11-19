import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, History, Info, TriangleAlert } from 'lucide-react';
import { alteracoesVersaoDre } from '../../../api/dreVersoes.api';

const quando = (ts) => (ts ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts)) : '');
const mesBR = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const mb = (bytes) => `${(Number(bytes || 0) / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

// Os nomes das abas (o "Módulo" do drilldown).
const MODULOS = {
  dre: 'DRE',
  poc: 'POC',
  'centros-custos': 'Centros Custos',
  mascaras: 'Máscaras',
  'plano-de-contas': 'Plano Contas',
  orcamento: 'Orçamento',
  unidades: 'Unidades',
  correcoes: 'Correções',
  financeiro: 'Financeiro',
  configuracoes: 'Configurações',
  projecoes: 'Projeções',
  versoes: 'Versões',
};
const ORDEM_MODULOS = Object.keys(MODULOS);
const FORA = 'Fora da DRE (outras telas ou o Sienge)';

// Em edição · Aguardando aprovação (a última salva, sem aprovação) · Publicada (a última aprovada) · Aprovada
// (aprovada, mas já substituída) · Não aprovada (salva, mas outra foi salva depois sem ela ser aprovada).
function Situacao({ v, publicada, pendente }) {
  const pilula = (cor, texto) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>{texto}</span>;
  if (v.status === 'ABERTA') return pilula('bg-amber-50 text-amber-700', 'Em edição');
  if (pendente) return pilula('bg-sky-50 text-sky-700', 'Aguardando aprovação');
  if (v.reprovada_em) return pilula('bg-red-50 text-red-700', 'Reprovada');
  if (publicada) return pilula('bg-emerald-50 text-emerald-700', 'Publicada');
  if (v.aprovada_em) return pilula('bg-gray-100 text-gray-600', 'Aprovada');
  return pilula('bg-gray-100 text-gray-400', 'Não aprovada');
}

function origemTexto(v) {
  if (v.origem === 'INICIAL') return 'Versão inicial (sistema)';
  if (v.origem === 'NOVA') return `Gerar nova versão${v.base_numero ? ` · da versão ${v.base_numero}` : ''}`;
  return `Editar última versão${v.base_numero ? ` · da versão ${v.base_numero}` : ''}`;
}

// Drilldown de uma versão: Módulo (a aba) › Usuário › Alteração (o carimbo de cada uma, mais recente primeiro).
function Alteracoes({ empresaId, numero }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [abertos, setAbertos] = useState(() => new Set());

  useEffect(() => {
    let ativo = true;
    alteracoesVersaoDre(empresaId, numero)
      .then((r) => ativo && setLista(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível carregar as alterações.'));
    return () => {
      ativo = false;
    };
  }, [empresaId, numero]);

  const grupos = useMemo(() => {
    const porModulo = new Map();
    (lista || []).forEach((a) => {
      if (!porModulo.has(a.modulo)) porModulo.set(a.modulo, new Map());
      const usuario = a.usuario_nome || (a.usuario_id ? 'Usuário' : FORA);
      const m = porModulo.get(a.modulo);
      if (!m.has(usuario)) m.set(usuario, []);
      m.get(usuario).push(a);
    });
    return [...porModulo.entries()]
      .sort(([a], [b]) => (ORDEM_MODULOS.indexOf(a) + 100) % 100 - (ORDEM_MODULOS.indexOf(b) + 100) % 100)
      .map(([modulo, usuarios]) => ({
        modulo,
        total: [...usuarios.values()].reduce((t, x) => t + x.length, 0),
        usuarios: [...usuarios.entries()].map(([usuario, itens]) => ({ usuario, itens })),
      }));
  }, [lista]);

  const alternar = (chave) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  const tudo = () => {
    const todas = grupos.flatMap((g) => [g.modulo, ...g.usuarios.map((u) => `${g.modulo}|${u.usuario}`)]);
    setAbertos((s) => (s.size >= todas.length ? new Set() : new Set(todas)));
  };

  if (erro) return <p className="text-xs text-red-600">{erro}</p>;
  if (!lista) return <p className="text-xs text-gray-400">Carregando...</p>;
  if (!lista.length) return <p className="text-xs text-gray-500">Nenhuma alteração registrada nesta versão.</p>;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Módulo › Usuário › Alteração</span>
        <button type="button" onClick={tudo} className="text-xs text-primary-600 hover:underline">
          Abrir / fechar tudo
        </button>
      </div>
      <ul className="space-y-1">
        {grupos.map((g) => {
          const abertoM = abertos.has(g.modulo);
          return (
            <li key={g.modulo}>
              <button
                type="button"
                onClick={() => alternar(g.modulo)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] font-semibold text-gray-900 hover:bg-white"
              >
                {abertoM ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                {MODULOS[g.modulo] || g.modulo}
                <span className="font-normal text-gray-400">· {g.total === 1 ? '1 alteração' : `${g.total} alterações`}</span>
              </button>
              {abertoM && (
                <ul className="ml-5 space-y-0.5 border-l border-gray-200 pl-2">
                  {g.usuarios.map((u) => {
                    const chave = `${g.modulo}|${u.usuario}`;
                    const abertoU = abertos.has(chave);
                    return (
                      <li key={chave}>
                        <button
                          type="button"
                          onClick={() => alternar(chave)}
                          className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-medium hover:bg-white ${
                            u.usuario === FORA ? 'text-amber-700' : 'text-gray-700'
                          }`}
                        >
                          {abertoU ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                          {u.usuario}
                          <span className="font-normal text-gray-400">· {u.itens.length}</span>
                        </button>
                        {abertoU && (
                          <ul className="ml-5 space-y-1 py-1">
                            {u.itens.map((a) => (
                              <li key={a.id} className="flex gap-2 text-xs">
                                <span className="w-28 shrink-0 tabular-nums text-gray-400">{quando(a.criado_em)}</span>
                                <span className="text-gray-700">{a.descricao}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Operações > DRE Construtoras > Versões (pedido do usuário, como a aba Versões de Cronogramas Obras): as versões
// da DRE, da mais nova para a mais antiga — situação, até onde vai o realizado, quem abriu e quem salvou (com as
// datas), quantas alterações e, na linha aberta, o drilldown Módulo › Usuário › Alteração. O olho "Visualizar"
// transforma a DRE inteira na versão escolhida (só leitura). Os botões Gerar nova versão / Editar última
// versão / Salvar versão / Excluir ficam no topo da página (DreGerencialPage.jsx).
export default function VersoesDreTab({ empresaId, estado, erro, versaoVisualizada, onVisualizar }) {
  const [aberta, setAberta] = useState(null);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <History size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as versões da DRE.</p>
      </div>
    );
  }

  const versoes = estado?.versoes || [];
  const publicadaId = estado?.publicada?.id;
  const pendenteId = estado?.pendente?.id;

  return (
    <div className="min-h-70 rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {/* Regra das versões (pedido do usuário): só as 10 últimas salvas ficam guardadas. */}
      <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
        <Info size={14} className="shrink-0 text-gray-400" />
        Ficam guardadas só as {estado?.limite || 10} últimas versões salvas. Ao salvar a {(estado?.limite || 10) + 1}ª, a mais antiga é apagada.
      </p>
      {erro && (
        <p className="mb-3 flex items-center gap-1.5 text-sm text-red-600">
          <TriangleAlert size={15} /> {erro}
        </p>
      )}
      {!estado ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
                <th className="w-8 py-2.5 pl-3" />
                <th className="py-2.5 pr-3 font-medium">Versão</th>
                <th className="py-2.5 pr-3 font-medium">Realizado até</th>
                <th className="py-2.5 pr-3 font-medium">Aberta</th>
                <th className="py-2.5 pr-3 font-medium">Salva</th>
                <th className="py-2.5 pr-3 font-medium">Aprovação</th>
                <th className="py-2.5 pr-3 font-medium">Alterações</th>
                <th className="py-2.5 pr-3 text-right font-medium">Visualizar</th>
              </tr>
            </thead>
            <tbody>
              {versoes.map((v) => {
                const expandida = aberta === v.id;
                const vendo = versaoVisualizada === v.numero;
                return (
                  <Fragment key={v.id}>
                    <tr
                      className={`cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50 ${vendo ? 'bg-amber-50/40' : ''}`}
                      onClick={() => setAberta(expandida ? null : v.id)}
                      title={expandida ? 'Esconder as alterações' : 'Ver as alterações'}
                    >
                      <td className="py-3 pl-3 text-gray-400">{expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{v.numero}</span>
                          <Situacao v={v} publicada={v.id === publicadaId} pendente={v.id === pendenteId} />
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-400">{origemTexto(v)}</span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-700">
                        <span className="block tabular-nums">{mesBR(v.corte)}</span>
                        <span className="text-gray-400">
                          {v.status === 'ABERTA'
                            ? v.origem === 'NOVA'
                              ? 'atualizado pelo Monitor de Integrações'
                              : `congelado (como na versão ${v.base_numero ?? '—'})`
                            : 'travado'}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-600">
                        <span className="block tabular-nums text-gray-800">{quando(v.aberta_em)}</span>
                        {v.aberta_por_nome && <span className="text-gray-400">por {v.aberta_por_nome}</span>}
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-600">
                        {v.fechada_em ? (
                          <>
                            <span className="block tabular-nums text-gray-800">{quando(v.fechada_em)}</span>
                            {v.fechada_por_nome && <span className="text-gray-400">por {v.fechada_por_nome}</span>}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-600">
                        {v.aprovada_em ? (
                          <>
                            <span className="block tabular-nums text-gray-800">{quando(v.aprovada_em)}</span>
                            {v.aprovada_por_nome && <span className="text-gray-400">por {v.aprovada_por_nome}</span>}
                          </>
                        ) : v.reprovada_em ? (
                          <>
                            <span className="block font-medium text-red-700">reprovada em {quando(v.reprovada_em)}</span>
                            {v.reprovada_por_nome && <span className="text-gray-400">por {v.reprovada_por_nome}</span>}
                            {v.reprovacao_motivo && <span className="mt-0.5 block max-w-xs italic text-gray-500">“{v.reprovacao_motivo}”</span>}
                          </>
                        ) : v.id === pendenteId ? (
                          <span className="text-sky-700">aguardando {estado?.aprovador?.nome || 'o aprovador'}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-xs text-gray-700">{v.alteracoes === 1 ? '1 alteração' : `${v.alteracoes} alterações`}</td>
                      <td className="py-3 pr-3 text-right">
                        {v.status === 'FECHADA' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onVisualizar(vendo ? null : v.numero);
                            }}
                            title={
                              vendo
                                ? 'Voltar para a versão atual'
                                : `Ver a DRE inteira como estava na versão ${v.numero} (só leitura; cópia de ${mb(v.tamanho_bytes)})`
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              vendo ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <Eye size={13} />
                            {vendo ? 'Visualizando' : 'Visualizar'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">é a atual</span>
                        )}
                      </td>
                    </tr>
                    {expandida && (
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <td />
                        <td colSpan={7} className="py-3 pr-3">
                          <Alteracoes empresaId={empresaId} numero={v.numero} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
