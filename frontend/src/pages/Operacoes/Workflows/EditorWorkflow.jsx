import { useMemo, useRef, useState } from 'react';
import { ArrowDown, FileSpreadsheet, MessageCircle, TriangleAlert, Zap } from 'lucide-react';
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

// Operações > Workflows: criar / alterar um workflow — o gatilho ("Quando") e a ação ("Então: enviar WhatsApp"):
// a conexão Z-API da empresa, quem recebe (o Aprovador da DRE na Matriz de Alçadas ou usuários escolhidos), a
// mensagem (com as variáveis do gatilho — clique pra inserir) e o Excel de auditoria da DRE anexo.
export default function EditorWorkflow({ aberto, inicial, opcoes, salvando, erro, onSalvar, onFechar }) {
  const [nome, setNome] = useState(inicial?.nome || '');
  const [gatilho, setGatilho] = useState(inicial?.gatilho || '');
  const [conexao, setConexao] = useState(inicial?.acao?.conexao_id ? String(inicial.acao.conexao_id) : opcoes.conexoes.length === 1 ? String(opcoes.conexoes[0].id) : '');
  const [modo, setModo] = useState(inicial?.acao?.destinatarios?.modo || 'APROVADOR');
  // ids em texto (o formato da TransferList).
  const [usuarios, setUsuarios] = useState(() => (inicial?.acao?.destinatarios?.usuarios || []).map(String));
  const [mensagem, setMensagem] = useState(inicial?.acao?.mensagem || '');
  const [excel, setExcel] = useState(Boolean(inicial?.acao?.anexar_excel_dre));
  const textoRef = useRef(null);

  const g = opcoes.gatilhos.find((x) => x.id === gatilho);
  const exemplos = useMemo(() => Object.fromEntries((g?.variaveis || []).map((v) => [v.chave, v.exemplo])), [g]);

  function inserir(chave) {
    const el = textoRef.current;
    const marca = `{${chave}}`;
    if (!el) return setMensagem((m) => m + marca);
    const ini = el.selectionStart ?? mensagem.length;
    const fim = el.selectionEnd ?? mensagem.length;
    const novo = mensagem.slice(0, ini) + marca + mensagem.slice(fim);
    setMensagem(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function salvar() {
    onSalvar({
      nome,
      gatilho,
      acao: {
        tipo: 'WHATSAPP',
        conexao_id: conexao ? Number(conexao) : null,
        destinatarios: { modo, usuarios: modo === 'USUARIOS' ? usuarios.map(Number) : [] },
        mensagem,
        anexar_excel_dre: excel,
      },
    });
  }

  const radio = (valor, rotulo, descricao) => (
    <label
      className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
        modo === valor ? 'border-primary-300 bg-primary-50/60' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <input type="radio" className="mt-0.5" checked={modo === valor} onChange={() => setModo(valor)} />
      <span>
        <span className="block font-medium text-gray-800">{rotulo}</span>
        <span className="text-xs text-gray-500">{descricao}</span>
      </span>
    </label>
  );

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

        <Passo icone={Zap} cor="bg-violet-50 text-violet-800" rotulo="Quando" titulo={g?.rotulo || 'escolha o gatilho'}>
          <Campo rotulo="Gatilho" dica={g?.descricao}>
            <SearchableSelect
              value={gatilho}
              onChange={(v) => setGatilho(v || '')}
              options={opcoes.gatilhos.map((x) => ({ value: x.id, label: x.rotulo }))}
              placeholder="Escolha o evento"
              clearable={false}
            />
          </Campo>
        </Passo>

        <div className="flex justify-center text-gray-300">
          <ArrowDown size={22} />
        </div>

        <Passo icone={MessageCircle} cor="bg-emerald-50 text-emerald-800" rotulo="Então" titulo="Enviar WhatsApp">
          <Campo rotulo="Conexão de WhatsApp (Z-API)" dica="As conexões ativas desta empresa (Integrações › Z-API).">
            <SearchableSelect
              value={conexao}
              onChange={(v) => setConexao(v || '')}
              options={opcoes.conexoes.map((c) => ({ value: String(c.id), label: c.nome }))}
              placeholder={opcoes.conexoes.length ? 'Escolha a conexão' : 'Nenhuma conexão Z-API ativa nesta empresa'}
              emptyMessage="Nenhuma conexão Z-API ativa nesta empresa."
            />
          </Campo>

          <Campo rotulo="Para quem">
            <div className="flex flex-col gap-2 sm:flex-row">
              {radio('APROVADOR', 'Aprovador da DRE', 'O usuário de Cadastros › Matriz de Alçadas › DRE › Aprovador (na hora do envio).')}
              {radio('USUARIOS', 'Usuários escolhidos', 'Usuários desta empresa (o telefone vem do cadastro de cada um).')}
            </div>
          </Campo>
          {modo === 'USUARIOS' && (
            <TransferList
              itens={opcoes.usuarios}
              selecionados={usuarios}
              onChange={setUsuarios}
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
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={6}
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

          {mensagem.trim() && g && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Prévia (com exemplos)</p>
              <div className="rounded-xl bg-[#e7f7e9] p-3">
                <div className="max-w-md whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
                  {excel && (
                    <span className="mb-2 flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                      <FileSpreadsheet size={15} className="text-emerald-600" /> DRE - auditoria (Excel)
                    </span>
                  )}
                  {preencher(mensagem, exemplos)}
                </div>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5" checked={excel} onChange={(e) => setExcel(e.target.checked)} />
            <span>
              <span className="font-medium text-gray-800">Anexar o Excel de auditoria da DRE</span>
              <span className="block text-xs text-gray-500">
                O mesmo da DRE Construtoras, da versão do evento, de janeiro a dezembro do ano do realizado. A mensagem vai como legenda do arquivo.
              </span>
            </span>
          </label>
        </Passo>

        {erro && (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <TriangleAlert size={15} /> {erro}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar workflow'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
