import { useMemo, useRef, useState } from 'react';
import { ArrowDown, FileSpreadsheet, MessageCircle, Plus, Trash2, TriangleAlert, Zap } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import TransferList from '../../../components/TransferList';

// Troca {chave} pelos exemplos (a prévia da mensagem).
const preencher = (texto, valores) => String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (valores[k] !== undefined ? valores[k] : m));

// Um passo do fluxo (o desenho do Power Automate: cartões em coluna, ligados por uma seta).
function Passo({ icone: Icone, cor, rotulo, titulo, children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center gap-2.5 px-4 py-2.5 ${cor}`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/80">
          <Icone size={15} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{rotulo}</span>
        <span className="text-sm font-semibold">{titulo}</span>
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  );
}

function Campo({ rotulo, dica, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      {children}
      {dica && <p className="mt-1 text-xs text-gray-400">{dica}</p>}
    </div>
  );
}

// O texto de cada destinatário, conforme o sistema do gatilho (DRE ou DFC — versões da DFC, 25/11/2026).
const descricaoDestino = (id, sistema = 'DRE') =>
  ({
    APROVADOR: `O usuário de Cadastros › Matriz de Alçadas › ${sistema} › Aprovador (na hora do envio).`,
    RESPONSAVEL: `Quem salvou a versão da ${sistema}.`,
    USUARIOS: 'Usuários desta empresa (o telefone vem do cadastro de cada um).',
  })[id];

// Um tópico: "Quando" (gatilho) → "Então: enviar WhatsApp" (conexão, quem recebe, mensagem com variáveis e o
// Excel de auditoria da DRE anexo). `passo` no formato da tela (ver paraTela/paraApi).
function Topico({ numero, passo, opcoes, onChange, onRemover }) {
  const textoRef = useRef(null);
  const g = opcoes.gatilhos.find((x) => x.id === passo.gatilho);
  const exemplos = useMemo(() => Object.fromEntries((g?.variaveis || []).map((v) => [v.chave, v.exemplo])), [g]);
  const muda = (patch) => onChange({ ...passo, ...patch });

  function inserir(chave) {
    const el = textoRef.current;
    const marca = `{${chave}}`;
    if (!el) return muda({ mensagem: passo.mensagem + marca });
    const ini = el.selectionStart ?? passo.mensagem.length;
    const fim = el.selectionEnd ?? passo.mensagem.length;
    muda({ mensagem: passo.mensagem.slice(0, ini) + marca + passo.mensagem.slice(fim) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tópico {numero}</span>
        {onRemover && (
          <button type="button" onClick={onRemover} title="Remover o tópico" className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <div className="space-y-2">
        <Passo icone={Zap} cor="bg-violet-50 text-violet-800" rotulo="Quando" titulo={g?.rotulo || 'escolha o gatilho'}>
          <Campo rotulo="Gatilho" dica={g?.descricao}>
            <SearchableSelect
              value={passo.gatilho}
              onChange={(v) => muda({ gatilho: v || '' })}
              options={opcoes.gatilhos.map((x) => ({ value: x.id, label: x.rotulo }))}
              placeholder="Escolha o evento"
              clearable={false}
            />
          </Campo>
        </Passo>

        <div className="flex justify-center text-gray-300">
          <ArrowDown size={20} />
        </div>

        <Passo icone={MessageCircle} cor="bg-emerald-50 text-emerald-800" rotulo="Então" titulo="Enviar WhatsApp">
          <Campo rotulo="Conexão de WhatsApp (Z-API)" dica="As conexões ativas desta empresa (Integrações › Z-API).">
            <SearchableSelect
              value={passo.conexao}
              onChange={(v) => muda({ conexao: v || '' })}
              options={opcoes.conexoes.map((c) => ({ value: String(c.id), label: c.nome }))}
              placeholder={opcoes.conexoes.length ? 'Escolha a conexão' : 'Nenhuma conexão Z-API ativa nesta empresa'}
              emptyMessage="Nenhuma conexão Z-API ativa nesta empresa."
            />
          </Campo>

          <Campo rotulo="Para quem">
            <div className="flex flex-col gap-2 sm:flex-row">
              {opcoes.destinatarios.map((d) => (
                <label
                  key={d.id}
                  className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                    passo.modo === d.id ? 'border-primary-300 bg-primary-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input type="radio" className="mt-0.5" checked={passo.modo === d.id} onChange={() => muda({ modo: d.id })} />
                  <span>
                    <span className="block font-medium text-gray-800">{d.rotulo.replace(/ \(.*\)$/, '')}</span>
                    <span className="text-xs text-gray-500">{descricaoDestino(d.id, g?.sistema)}</span>
                  </span>
                </label>
              ))}
            </div>
          </Campo>
          {passo.modo === 'USUARIOS' && (
            <TransferList
              itens={opcoes.usuarios}
              selecionados={passo.usuarios}
              onChange={(usuarios) => muda({ usuarios })}
              getId={(u) => u.id}
              getLabel={(u) => u.nome}
              tituloDisponiveis="Usuários da empresa"
              tituloSelecionados="Recebem a mensagem"
              vazioDisponiveisTexto="Nenhum usuário disponível."
              vazioSelecionadosTexto="Nenhum usuário escolhido."
            />
          )}

          <Campo rotulo="Mensagem">
            <textarea
              ref={textoRef}
              value={passo.mensagem}
              onChange={(e) => muda({ mensagem: e.target.value })}
              rows={5}
              maxLength={4000}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {g && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-400">Inserir:</span>
                {g.variaveis.map((v) => (
                  <button
                    key={v.chave}
                    type="button"
                    onClick={() => inserir(v.chave)}
                    title={`${v.rotulo} — ex.: ${v.exemplo}`}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                  >
                    {`{${v.chave}}`}
                  </button>
                ))}
              </div>
            )}
          </Campo>

          {passo.mensagem.trim() && g && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Prévia (com exemplos)</p>
              <div className="rounded-xl bg-[#e7f7e9] p-3">
                <div className="max-w-md whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                  {passo.excel && (
                    <span className="mb-2 flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                      <FileSpreadsheet size={15} className="text-emerald-600" /> {g?.anexo?.arquivo || 'DRE - auditoria.xlsx'}
                    </span>
                  )}
                  {preencher(passo.mensagem, exemplos)}
                </div>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={passo.excel} onChange={(e) => muda({ excel: e.target.checked })} />
            <span>
              <span className="font-medium text-gray-800">Anexar o {g?.anexo?.rotulo || 'Excel de auditoria da DRE'}</span>
              <span className="block text-xs text-gray-500">
                O mesmo da {g?.sistema === 'DFC' ? 'DFC Construtoras' : 'DRE Construtoras'}, da versão do evento, de janeiro a dezembro do ano do realizado. A
                mensagem vai como legenda do arquivo.
              </span>
            </span>
          </label>
        </Passo>
      </div>
    </div>
  );
}

// API ↔ tela (na tela: conexão e usuários como texto — o formato dos seletores).
const paraTela = (p, conexaoPadrao) => ({
  gatilho: p?.gatilho || '',
  conexao: p?.acao?.conexao_id ? String(p.acao.conexao_id) : conexaoPadrao,
  modo: p?.acao?.destinatarios?.modo || 'APROVADOR',
  usuarios: (p?.acao?.destinatarios?.usuarios || []).map(String),
  mensagem: p?.acao?.mensagem || '',
  excel: Boolean(p?.acao?.anexar_excel_dre),
});
const paraApi = (p) => ({
  gatilho: p.gatilho,
  acao: {
    tipo: 'WHATSAPP',
    conexao_id: p.conexao ? Number(p.conexao) : null,
    destinatarios: { modo: p.modo, usuarios: p.modo === 'USUARIOS' ? p.usuarios.map(Number) : [] },
    mensagem: p.mensagem,
    anexar_excel_dre: p.excel,
  },
});

// Operações > Workflows: criar / alterar um workflow — o nome e os TÓPICOS (cada um: "Quando" um evento →
// "Então" enviar WhatsApp). Ex.: o modelo "Pedir aprovação da versão da DRE" vem com 3 tópicos (salva → Aprovador;
// reprovada → Responsável com o motivo; aprovada → Responsável).
export default function EditorWorkflow({ aberto, inicial, opcoes, salvando, erro, onSalvar, onFechar }) {
  const conexaoPadrao = opcoes.conexoes.length === 1 ? String(opcoes.conexoes[0].id) : '';
  const [nome, setNome] = useState(inicial?.nome || '');
  const [passos, setPassos] = useState(() => (inicial?.passos?.length ? inicial.passos : [{}]).map((p) => paraTela(p, conexaoPadrao)));

  const mudar = (i, novo) => setPassos((ps) => ps.map((p, j) => (j === i ? novo : p)));
  // Tópico novo: a mesma conexão do último (o caso comum).
  const adicionar = () => setPassos((ps) => [...ps, { ...paraTela(null, conexaoPadrao), conexao: ps[ps.length - 1]?.conexao || conexaoPadrao }]);

  return (
    <Modal open={aberto} onClose={onFechar} title={inicial?.id ? 'Alterar workflow' : 'Novo workflow'} maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        <Campo rotulo="Nome do workflow">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            placeholder="Ex.: Pedir aprovação da versão da DRE"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </Campo>

        {passos.map((p, i) => (
          <Topico
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            numero={i + 1}
            passo={p}
            opcoes={opcoes}
            onChange={(novo) => mudar(i, novo)}
            onRemover={passos.length > 1 ? () => setPassos((ps) => ps.filter((_, j) => j !== i)) : null}
          />
        ))}

        <button
          type="button"
          onClick={adicionar}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition hover:border-primary-400 hover:bg-primary-50/40 hover:text-primary-700"
        >
          <Plus size={16} /> Adicionar tópico
        </button>

        {erro && (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <TriangleAlert size={15} /> {erro}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSalvar({ nome, passos: passos.map(paraApi) })} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar workflow'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
