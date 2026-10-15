import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, X } from 'lucide-react';
import { getMinhasConexoesIa } from '../api/mcp.api';

// Ícone "Conexões com IA" ao lado da foto do usuário (Topbar — pedido do usuário): colorido quando há
// algum conector MCP liberado para ele (Integrações > MCP > usuários do conector; MASTER vê todos),
// cinza quando não há — com a dica "Conexão com IA indisponível, procure o administrador do sistema".
// Clicando, abre a janela com cada conexão liberada e a URL para colar no Claude.

const TIPO = {
  COBRANCA: { rotulo: 'Cobrança', cor: 'bg-emerald-50 text-emerald-700' },
  DFC_CONSTRUTORAS: { rotulo: 'DFC Construtoras', cor: 'bg-primary-50 text-primary-700' },
  DFC_ORCAMENTO: { rotulo: 'DFC Construtoras · altera orçamento', cor: 'bg-amber-50 text-amber-700' },
};
const DURACAO = (h) => (h % 24 === 0 ? `${h / 24} ${h / 24 === 1 ? 'dia' : 'dias'}` : `${h} ${h === 1 ? 'hora' : 'horas'}`);
const MSG_INDISPONIVEL = 'Conexão com IA indisponível, procure o administrador do sistema';

// Ícone de IA: estrela de quatro pontas e duas faíscas. `vivo`: anima (estrela respira, faíscas piscam
// alternadas — keyframes em styles/index.css); parado quando não há conexão.
function IconeIa({ size = 18, vivo = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={vivo ? 'ia-viva' : ''}>
      <path className="ia-estrela" d="M10 3.5C10.7 9 12 10.3 17.5 11C12 11.7 10.7 13 10 18.5C9.3 13 8 11.7 2.5 11C8 10.3 9.3 9 10 3.5Z" />
      <path className="ia-faisca ia-faisca-1" d="M18.5 2C18.75 4 19.4 4.75 21.5 5C19.4 5.25 18.75 6 18.5 8C18.25 6 17.6 5.25 15.5 5C17.6 4.75 18.25 4 18.5 2Z" />
      <path className="ia-faisca ia-faisca-2" d="M18.5 15.5C18.7 17.3 19.2 17.8 21 18C19.2 18.2 18.7 18.7 18.5 20.5C18.3 18.7 17.8 18.2 16 18C17.8 17.8 18.3 17.3 18.5 15.5Z" />
    </svg>
  );
}

function Conexao({ c }) {
  const [copiado, setCopiado] = useState(false);
  const tipo = TIPO[c.escopo] || TIPO.COBRANCA;
  const dfc = c.escopo !== 'COBRANCA';
  async function copiar() {
    try {
      await navigator.clipboard.writeText(c.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem acesso à área de transferência: o campo continua selecionável */
    }
  }
  return (
    <li className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
          {c.empresa_logo ? (
            <img src={c.empresa_logo} alt="" className="h-full w-full object-contain p-0.5" />
          ) : (
            <span className="text-primary-500"><IconeIa size={18} /></span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{c.nome_conector}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tipo.cor}`}>{tipo.rotulo}</span>
          </div>
          <p className="text-xs text-gray-500">{c.empresa}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={c.url}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 focus:outline-none"
          aria-label={`URL de ${c.nome_conector}`}
        />
        <button
          type="button"
          onClick={copiar}
          title="Copiar URL"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
            copiado ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          {copiado ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
        {dfc ? (
          <>
            <KeyRound size={13} className="mt-0.5 shrink-0" />
            Ao conectar, o Claude abre o login do Horizon Fin — entre com o seu usuário. O acesso vale {DURACAO(c.sessao_horas)}
            {c.escopo === 'DFC_ORCAMENTO' ? '; as alterações no Orçamento ficam em seu nome.' : '.'}
          </>
        ) : (
          'Quem tiver esta URL consegue ler os dados de cobrança desta empresa — não compartilhe.'
        )}
      </p>
    </li>
  );
}

export default function ConexoesIa() {
  const [conexoes, setConexoes] = useState(null);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    getMinhasConexoesIa()
      .then(setConexoes)
      .catch(() => setConexoes([]));
  }, []);

  useEffect(() => {
    if (!aberta) return undefined;
    const tecla = (e) => e.key === 'Escape' && setAberta(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta]);

  const ativa = conexoes?.length > 0;
  return (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => ativa && setAberta(true)}
          aria-label={ativa ? 'Conexões com IA' : MSG_INDISPONIVEL}
          aria-disabled={!ativa}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
            ativa
              ? 'ia-fundo-vivo bg-linear-to-br from-violet-500 via-primary-500 to-sky-400 text-white shadow-[0_4px_14px_-4px_rgba(99,102,241,0.6)] hover:scale-105'
              : 'cursor-not-allowed bg-gray-100 text-gray-400'
          }`}
        >
          <IconeIa size={19} vivo={ativa} />
        </button>
        {/* Dica ao passar o mouse. */}
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-11 z-50 w-max max-w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          {conexoes === null ? 'Carregando…' : ativa ? `Conexões com IA (${conexoes.length})` : MSG_INDISPONIVEL}
        </span>
      </div>

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setAberta(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="conexoes-ia-titulo" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <span className="ia-fundo-vivo flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 via-primary-500 to-sky-400 text-white">
                <IconeIa size={21} vivo />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="conexoes-ia-titulo" className="text-base font-semibold text-gray-900">
                  Conexões com IA
                </h2>
                <p className="text-xs text-gray-500">
                  No Claude: Configurações › Conectores › Adicionar conector personalizado — cole a URL e conecte.
                </p>
              </div>
              <button type="button" onClick={() => setAberta(false)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <ul className="flex flex-col gap-3 overflow-y-auto p-5">
              {conexoes.map((c) => (
                <Conexao key={c.id} c={c} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
