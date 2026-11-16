import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';
import Card from '../../components/Card';
import TransferList from '../../components/TransferList';
import CampoData from '../../components/CampoData';
import { useConfirm } from '../../confirm/ConfirmContext';
import { listEmpresas } from '../../api/empresas.api';
import { gerarNovoLinkFormulario, linkPublico, usuariosPublicoAlvo } from '../../api/formularios.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { CORES_TEMA, MODALIDADES, mensagemErro } from './tipos';
import { useAviso } from './Aviso';

const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400';

function SectionHeader({ titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Cartões de rádio (mesmo desenho das Configurações de Cronogramas Obras).
function OpcoesRadio({ nome, valor, opcoes, onChange, colunas = 'sm:grid-cols-3' }) {
  return (
    <div role="radiogroup" className={`mt-4 grid gap-3 ${colunas}`}>
      {opcoes.map((o) => {
        const ativo = valor === o.value;
        const Icone = o.icone;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${ativo ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <input type="radio" name={nome} checked={ativo} onChange={() => onChange(o.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                {Icone && <Icone size={15} className={ativo ? 'text-primary-600' : 'text-gray-400'} />}
                {o.titulo}
              </span>
              {o.texto && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{o.texto}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// Aba Configurações do construtor: um Card por parâmetro. Salva sozinho, como as perguntas.
export default function ConfiguracoesFormulario({ form, alterar, onAtualizado }) {
  const confirm = useConfirm();
  const aviso = useAviso();
  const privado = form.modalidade !== 'PUBLICO';
  const [empresas, setEmpresas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!privado) return;
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .catch(() => {});
    usuariosPublicoAlvo()
      .then(setUsuarios)
      .catch(() => {});
  }, [privado]);

  const link = linkPublico(form.token_publico);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      aviso('Link copiado.');
    } catch {
      aviso(link);
    }
  }

  async function novoLink() {
    const ok = await confirm({
      title: 'Gerar um link novo',
      description: 'O link atual para de funcionar na hora — quem tiver o antigo não consegue mais responder. Continuar?',
      confirmLabel: 'Gerar link novo',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      const f = await gerarNovoLinkFormulario(form.id);
      onAtualizado({ token_publico: f.token_publico });
      aviso('Link novo gerado.');
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível gerar o link.'));
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <SectionHeader
          titulo="Modalidade"
          texto="Quem responde e como o formulário chega até a pessoa. A modalidade pode ser trocada a qualquer momento; as respostas já recebidas continuam guardadas."
        />
        <OpcoesRadio
          nome="modalidade"
          valor={form.modalidade}
          onChange={(v) => alterar({ modalidade: v })}
          opcoes={Object.entries(MODALIDADES).map(([value, m]) => ({ value, titulo: m.rotulo, texto: m.texto, icone: m.icone }))}
        />
      </Card>

      {!privado ? (
        <Card>
          <SectionHeader
            titulo="Link público"
            texto="Envie este endereço por e-mail, WhatsApp ou onde preferir. Ele só funciona com o formulário publicado e dentro do período de respostas."
          />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${INPUT} font-mono text-xs text-gray-700 sm:max-w-xl`} />
            <div className="flex gap-2">
              <button type="button" onClick={copiar} title="Copiar link" className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                <Copy size={15} />
                Copiar
              </button>
              <a href={link} target="_blank" rel="noreferrer" title="Abrir em outra aba" className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <ExternalLink size={18} />
              </a>
              <button type="button" onClick={novoLink} title="Gerar um link novo (o atual deixa de funcionar)" className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
          {form.status !== 'PUBLICADO' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {form.status === 'RASCUNHO' ? 'Ainda é um rascunho: publique o formulário para o link começar a funcionar.' : 'O formulário está encerrado: o link mostra que não aceita mais respostas.'}
            </p>
          )}
          {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
          <OpcoesRadio
            nome="limite"
            valor={form.uma_resposta_por_pessoa ? 'UMA' : 'VARIAS'}
            onChange={(v) => alterar({ uma_resposta_por_pessoa: v === 'UMA' })}
            colunas="sm:grid-cols-2 max-w-3xl"
            opcoes={[
              { value: 'UMA', titulo: 'Uma resposta por pessoa', texto: 'Quem já respondeu, ao abrir o link de novo no mesmo navegador, vê que a resposta já foi enviada.' },
              { value: 'VARIAS', titulo: 'Várias respostas', texto: 'A mesma pessoa pode responder quantas vezes quiser (ex.: um formulário de registro).' },
            ]}
          />
        </Card>
      ) : (
        <>
          <Card>
            <SectionHeader
              titulo="Público-alvo"
              texto="Quem vê a janela ao entrar no sistema. Só usuários ativos; cada um responde uma vez. Quem entrar no público depois de publicado também passa a ver."
            />
            <OpcoesRadio
              nome="publico"
              valor={form.publico_alvo}
              onChange={(v) => alterar({ publico_alvo: v })}
              opcoes={[
                { value: 'TODOS', titulo: 'Todos os usuários', texto: 'Qualquer usuário ativo do sistema.' },
                { value: 'EMPRESAS', titulo: 'Usuários de empresas', texto: 'Quem está vinculado a uma das empresas escolhidas.' },
                { value: 'USUARIOS', titulo: 'Usuários escolhidos', texto: 'Só as pessoas escolhidas, uma a uma.' },
              ]}
            />
            {form.publico_alvo === 'EMPRESAS' && (
              <div className="mt-4 max-w-4xl">
                <TransferList
                  itens={empresas}
                  getLabel={(e) => nomeExibicaoEmpresa(e)}
                  selecionados={(form.empresa_ids || []).map(String)}
                  onChange={(ids) => alterar({ empresa_ids: ids.map(Number) })}
                  tituloDisponiveis="Empresas"
                  tituloSelecionados="Empresas do público"
                  corSelecionados={(form.empresa_ids || []).length ? 'border-primary-300 bg-primary-50/40' : 'border-amber-300 bg-amber-50/40'}
                />
              </div>
            )}
            {form.publico_alvo === 'USUARIOS' && (
              <div className="mt-4 max-w-4xl">
                <TransferList
                  itens={usuarios}
                  getLabel={(u) => u.nome}
                  selecionados={(form.usuario_ids || []).map(String)}
                  onChange={(ids) => alterar({ usuario_ids: ids.map(Number) })}
                  tituloDisponiveis="Usuários"
                  tituloSelecionados="Usuários do público"
                  corSelecionados={(form.usuario_ids || []).length ? 'border-primary-300 bg-primary-50/40' : 'border-amber-300 bg-amber-50/40'}
                />
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader titulo="Identificação" texto="Se o nome de quem respondeu aparece nos resultados. A lista de quem já respondeu e de quem falta continua visível nos dois casos." />
            <OpcoesRadio
              nome="anonimo"
              valor={form.anonimo ? 'ANONIMA' : 'IDENTIFICADA'}
              onChange={(v) => alterar({ anonimo: v === 'ANONIMA' })}
              colunas="sm:grid-cols-2 max-w-3xl"
              opcoes={[
                { value: 'IDENTIFICADA', titulo: 'Identificada', texto: 'Cada resposta mostra quem respondeu e quando.' },
                { value: 'ANONIMA', titulo: 'Anônima', texto: 'As respostas aparecem sem nome nem horário — ideal para pesquisa de clima.' },
              ]}
            />
          </Card>
        </>
      )}

      <Card>
        <SectionHeader
          titulo="Período de respostas"
          texto="Opcional. Fora do período o formulário não aparece para os usuários e o link público avisa que está fechado. Sem datas, vale enquanto estiver publicado."
        />
        <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
          {[
            ['inicio_em', 'Início'],
            ['fim_em', 'Fim'],
          ].map(([campo, rotulo]) => (
            <div key={campo}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
              <div className="relative">
                <CampoData
                  value={form[campo] || ''}
                  min={campo === 'fim_em' ? form.inicio_em || undefined : undefined}
                  max={campo === 'inicio_em' ? form.fim_em || undefined : undefined}
                  onChange={(v) => alterar({ [campo]: v })}
                  className={`${INPUT} ${form[campo] ? 'border-primary-300 bg-primary-50/40' : ''}`}
                />
                {form[campo] && (
                  <button type="button" onClick={() => alterar({ [campo]: null })} title="Limpar" className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader titulo="Cor do formulário" texto="A cor da faixa do cabeçalho, dos botões e das marcações de quem responde." />
        <div className="mt-4 flex flex-wrap gap-2.5">
          {CORES_TEMA.map((c) => {
            const ativo = form.cor_tema?.toLowerCase() === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => alterar({ cor_tema: c })}
                title={c}
                aria-label={`Cor ${c}`}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-110 ${ativo ? 'ring-2 ring-offset-2' : ''}`}
                style={{ backgroundColor: c, '--tw-ring-color': c }}
              >
                {ativo && <Check size={16} strokeWidth={3} className="text-white" />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeader titulo="Mensagem de confirmação" texto="O que aparece depois que a pessoa envia a resposta. Em branco, mostra “Sua resposta foi registrada. Obrigado por participar!”." />
        <textarea
          value={form.mensagem_final || ''}
          onChange={(e) => alterar({ mensagem_final: e.target.value })}
          maxLength={2000}
          rows={3}
          placeholder="Sua resposta foi registrada. Obrigado por participar!"
          className={`${INPUT} mt-4 max-w-2xl`}
        />
      </Card>
    </div>
  );
}
