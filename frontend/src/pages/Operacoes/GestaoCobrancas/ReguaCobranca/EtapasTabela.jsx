import { useEffect, useState } from 'react';
import { Eye, Mail, MessageCircle, Phone, Plus, X } from 'lucide-react';
import TemplatePreviewModal from '../../../../components/TemplatePreviewModal';
import { faixaAtiva } from './constantes';
import { substituirVariaveis } from '../Comunicacao/constantes';

// Mesmo estado visual do Motor de Risco (ver MotorRisco/estadoCampo.js):
// campo obrigatório em branco fica âmbar — chama atenção pro que falta
// preencher numa etapa recém-criada, que já nasce inativa e com nome/dias/
// template/responsável em branco (ver
// reguaCobranca.service.js::criarEtapa). Assim que ganha valor, vira azul
// claro (a cor da marca) — fica óbvio de relance o que já foi preenchido.
function estadoCampo(vazio) {
  return vazio
    ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
    : 'border-primary-100 bg-primary-50 hover:border-primary-500';
}

// Campo de texto/número com buffer local — evita disparar 1 chamada à API
// por tecla digitada (só grava no blur/change), mas ainda reflete de volta
// qualquer ajuste que o servidor faça no valor (ex.: clamp de `dias` fora
// do intervalo permitido) assim que o pai atualizar a etapa. A cor
// âmbar/azul reage ao buffer local (`local`), não ao `valor` já salvo —
// digitar já pinta de azul, sem esperar o blur. `className` entra sem cor
// de borda/fundo (só largura/raio/tipografia); a cor quem decide é
// `estadoCampo` aqui dentro.
function CampoBuffer({ valor, onCommit, className, ...props }) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  const vazio = local === '' || local === null || local === undefined;
  return (
    <input
      {...props}
      value={local ?? ''}
      className={`${className} ${estadoCampo(vazio)}`}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (String(local) !== String(valor)) onCommit(local);
      }}
    />
  );
}

function Flag({ ativo, tipo, onClick, label, Icone }) {
  const coresAtivo = {
    // Zap em verde (cor do WhatsApp), não mais azul.
    zap: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    mail: 'border-primary-100 bg-primary-50 text-primary-600',
    call: 'border-amber-200 bg-amber-50 text-amber-600',
  };
  const cores = ativo ? coresAtivo[tipo] : 'border-gray-200 bg-gray-50 text-gray-300';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={ativo}
      title={label}
      className={`flex h-6 w-6 items-center justify-center rounded border ${cores}`}
    >
      <Icone size={13} />
    </button>
  );
}

function Switch({ ativo, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={ativo}
      className={`relative h-[19px] w-[34px] shrink-0 rounded-full border transition-colors ${
        ativo ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-gray-100'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white shadow transition-all ${
          ativo ? 'left-[17px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

// Tabela de etapas + caixa de escopo + legenda + bloco extra (só na régua
// de Inadimplência) — réplica do card "Etapas da régua" do protótipo. Cada
// edição chama a API na hora (`onAtualizar`/`onRemover`/`onNovaEtapa`, que
// vêm de ReguaCobrancaTab.jsx e já cuidam de persistir e atualizar o
// estado) — não existe rascunho pendente nem botão de salvar.
export default function EtapasTabela({
  cluster,
  limite,
  etapas,
  usuarios,
  templates,
  onAtualizar,
  onRemover,
  onNovaEtapa,
}) {
  const risco = cluster.tipo === 'inad';
  // Mesma regra de reguaCobranca.service.js::limitesDias — o dia exato da
  // fronteira ainda é do cluster de score, a Inadimplência só começa no
  // dia seguinte (`diasSigned > limite` na classificação de verdade).
  const lim = risco ? { min: limite + 1, max: 365 } : { min: -90, max: limite };

  // Só os templates da biblioteca de Comunicação autorizados pra este
  // cluster (`clusters` inclui `cluster.id`) entram no combobox — mesma
  // regra validada de novo no backend (ver
  // reguaCobranca.service.js::garantirTemplateElegivel), pra uma chamada
  // direta à API não conseguir contornar.
  const templatesDoCluster = templates.filter((t) => t.clusters.includes(cluster.id));

  // Template sendo pré-visualizado no momento (ver TemplatePreviewModal.jsx)
  // — guarda o id da etapa selecionada; o objeto do template (com o
  // conteúdo real) é buscado na lista completa (não só a filtrada por
  // cluster), pra continuar mostrando algo mesmo se o template deixou de
  // estar autorizado pra este cluster depois de já escolhido.
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const templatePreview = templates.find((t) => t.id === previewTemplateId) || null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {risco ? 'Etapas da régua de inadimplência' : 'Etapas da régua de vencimento'}
        </h3>
        <button
          type="button"
          onClick={onNovaEtapa}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          <Plus size={14} />
          Nova etapa
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-2.5 pr-2 font-medium" style={{ width: '27%' }}>Etapa</th>
              <th className="py-2.5 pr-2 font-medium" style={{ width: 78 }}>Dias</th>
              <th className="py-2.5 pr-2 font-medium" style={{ width: 108 }}>Faixa ativa</th>
              <th className="py-2.5 pr-2 font-medium" style={{ width: '17%' }}>Template</th>
              <th className="py-2.5 pr-2 font-medium" style={{ width: '16%' }}>Responsável</th>
              {/* As 3 flags de canal (zap/e-mail/ligação) formam 1 coluna só,
                  "Comunicação" — sem título de propósito (os ícones já
                  falam por si), mas com um respiro maior à esquerda (pl-5
                  na célula abaixo) pra separar visualmente de Responsável. */}
              <th className="py-2.5 pl-5 pr-2" style={{ width: 148 }}></th>
              <th className="py-2.5 pr-2 text-center font-medium" style={{ width: 50 }}>Ativa</th>
              {/* Independente de "Ativa" — a etapa pode estar configurada e
                  contando nos badges sem ainda estar liberada pra rotina
                  automática de disparo (aba Rotinas) pegar de verdade. */}
              <th className="py-2.5 pr-2 text-center font-medium" style={{ width: 58 }}>Rotina</th>
              <th className="py-2.5" style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {etapas.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-4 text-xs text-gray-400">
                  Nenhuma etapa configurada. Use "+ Nova etapa" para começar.
                </td>
              </tr>
            ) : (
              etapas.map((e, i) => (
                <tr key={e.id} className={`border-t border-gray-100 ${e.ativa ? '' : 'opacity-45'}`}>
                  <td className="py-2 pr-2">
                    <CampoBuffer
                      type="text"
                      valor={e.nome}
                      placeholder="Nome da etapa"
                      onCommit={(v) => onAtualizar(e.id, { nome: v.trim() || 'Nova etapa' })}
                      className="w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-100"
                      aria-label="Nome da etapa"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <CampoBuffer
                      type="number"
                      valor={e.dias}
                      min={lim.min}
                      max={lim.max}
                      step={1}
                      onCommit={(v) => onAtualizar(e.id, { dias: v === '' ? null : Number(v) })}
                      className="w-full rounded border px-1.5 py-1 text-center font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary-100"
                      aria-label="Dias em relação ao vencimento"
                    />
                  </td>
                  <td className="py-2 pr-2 font-mono text-[11px] whitespace-nowrap text-gray-400">
                    {faixaAtiva(etapas, i, cluster, limite)}
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={e.template_id || ''}
                      onChange={(ev) => onAtualizar(e.id, { template_id: ev.target.value ? Number(ev.target.value) : null })}
                      className={`w-full rounded border px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-100 ${estadoCampo(!e.template_id)}`}
                    >
                      <option value="">—</option>
                      {/* Se o template já escolhido não estiver mais autorizado pra
                          este cluster (biblioteca mudou depois de salvo), mostra ele
                          mesmo assim — só pra não sumir a seleção; salvar de novo
                          exige escolher outro autorizado (mesmo espírito do
                          Responsável ao lado). */}
                      {e.template_id && !templatesDoCluster.some((t) => t.id === e.template_id) && (
                        <option value={e.template_id}>{e.template_nome || 'Template indisponível'}</option>
                      )}
                      {templatesDoCluster.map((t) => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={e.responsavel_usuario_id || ''}
                      onChange={(ev) => onAtualizar(e.id, { responsavel_usuario_id: ev.target.value ? Number(ev.target.value) : null })}
                      className={`w-full rounded border px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-100 ${estadoCampo(!e.responsavel_usuario_id)}`}
                    >
                      <option value="">—</option>
                      {/* Se o responsável já atribuído não estiver mais na lista de
                          elegíveis (desativado, perdeu a empresa, virou Master), mostra
                          ele mesmo assim — só pra não sumir a seleção; salvar de novo
                          exige escolher outro alguém elegível. */}
                      {e.responsavel_usuario_id && !usuarios.some((u) => u.id === e.responsavel_usuario_id) && (
                        <option value={e.responsavel_usuario_id}>{e.responsavel_nome || 'Usuário indisponível'}</option>
                      )}
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </td>
                  {/* Comunicação: as 3 flags juntas num grupo só (gap pequeno
                      entre elas), com respiro maior (pl-5) separando de
                      Responsável — pra ficar claro que são uma coisa só,
                      não 3 colunas soltas. */}
                  <td className="py-2 pl-5 pr-2">
                    <div className="flex items-center gap-1">
                      <Flag
                        ativo={e.canal_whatsapp}
                        tipo="zap"
                        Icone={MessageCircle}
                        label="WhatsApp"
                        onClick={() => onAtualizar(e.id, { canal_whatsapp: !e.canal_whatsapp })}
                      />
                      <Flag
                        ativo={e.canal_email}
                        tipo="mail"
                        Icone={Mail}
                        label="E-mail"
                        onClick={() => onAtualizar(e.id, { canal_email: !e.canal_email })}
                      />
                      <Flag
                        ativo={e.canal_ligacao}
                        tipo="call"
                        Icone={Phone}
                        label="Ligação"
                        onClick={() => onAtualizar(e.id, { canal_ligacao: !e.canal_ligacao })}
                      />
                      {/* Pré-visualizar: não é um canal, por isso separado
                          dos 3 anteriores por um respiro maior (ml-2.5) —
                          mesmo formato com borda dos Flags, só que neutro
                          (não liga/desliga nada, é uma ação). */}
                      <button
                        type="button"
                        onClick={() => setPreviewTemplateId(e.template_id)}
                        disabled={!e.template_id}
                        aria-label="Pré-visualizar template"
                        title={e.template_id ? 'Pré-visualizar template' : 'Escolha um template pra pré-visualizar'}
                        className="ml-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-400 hover:border-primary-100 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-400"
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <Switch ativo={e.ativa} label="Etapa ativa" onClick={() => onAtualizar(e.id, { ativa: !e.ativa })} />
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <Switch
                      ativo={e.rotina_habilitada}
                      label="Habilitar rotina de disparo automático"
                      onClick={() => onAtualizar(e.id, { rotina_habilitada: !e.rotina_habilitada })}
                    />
                  </td>
                  <td className="py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onRemover(e.id)}
                      aria-label="Remover etapa"
                      className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TemplatePreviewModal
        open={Boolean(previewTemplateId)}
        onClose={() => setPreviewTemplateId(null)}
        mensagemWhatsApp={substituirVariaveis(templatePreview?.corpo)}
        mensagemEmail={substituirVariaveis(templatePreview?.corpo)}
        assuntoEmail={substituirVariaveis(templatePreview?.assunto)}
        anexo={Boolean(templatePreview?.enviar_boleto)}
        contatoNome="Horizon Financeiro"
        legenda={
          <>
            Simulação de como a mensagem apareceria pro cliente, com as variáveis (@nome_cliente etc.) já substituídas
            por dados de exemplo — texto real do template{' '}
            <b className="font-medium text-gray-700">{templatePreview?.nome}</b>, cadastrado na aba Comunicação.
          </>
        }
      />
    </div>
  );
}
