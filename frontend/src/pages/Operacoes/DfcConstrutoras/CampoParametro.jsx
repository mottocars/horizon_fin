import { useState } from 'react';
import { Lock } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { formatarNumero } from './parametrosDfc';
import { formatarDataISO } from '../../../utils/datas';

// Mesmo destaque dos campos do Motor de Risco (GestaoCobrancas/MotorRisco/estadoCampo.js —
// duplicado aqui de propósito, telas não importam umas das outras): em branco fica âmbar, pra
// achar de relance o que falta; preenchido fica azul claro.
function estadoCampo(valor, disabled) {
  if (disabled) return 'border-gray-200 bg-gray-50 text-gray-400';
  const vazio = valor === '' || valor === null || valor === undefined;
  return vazio
    ? 'border-amber-300 bg-amber-50 text-gray-900 hover:border-amber-400'
    : 'border-primary-100 bg-primary-50 text-gray-900 hover:border-primary-500';
}

// Texto digitado no padrão brasileiro ("1.234.567,89", "R$ 1.234", "12,5") -> número com `casas`
// casas; '' pra vazio, NaN pra texto inválido. Mesma ideia de OrcamentoTab.jsx::interpretarValor
// (duplicada pelo mesmo motivo de estadoCampo acima).
function interpretarNumero(texto, casas) {
  let t = String(texto ?? '').replace(/\s/g, '').replace(/^R\$/i, '').replace(/%$/, '');
  if (t === '') return '';
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  const fator = 10 ** casas;
  const n = Math.round(parseFloat(t) * fator) / fator;
  return Number.isFinite(n) ? n : NaN;
}

// Campo numérico com formatação brasileira: fora de edição mostra o valor formatado
// ("1.234.567,89"); ao focar vira o número puro, com vírgula, pra editar; ao sair interpreta.
// Texto inválido descarta a edição (volta ao valor anterior) em vez de gravar lixo.
function CampoNumeroBR({ valor, casas, max, disabled, onChange }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;

  function commit() {
    if (texto === null) return;
    const novo = interpretarNumero(texto, casas);
    setTexto(null);
    if (Number.isNaN(novo)) return;
    onChange(novo !== '' && max !== undefined && novo > max ? max : novo);
  }

  return (
    <input
      type="text"
      inputMode={casas > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      disabled={disabled}
      value={editando ? texto : formatarNumero(valor, casas)}
      onFocus={(e) => {
        setTexto(valor === '' ? '' : String(valor).replace('.', ','));
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[\d.,\sR$%]*$/i.test(e.target.value)) setTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setTexto(null);
          e.currentTarget.blur();
        }
      }}
      className={`w-full rounded-lg border px-3 py-2 text-right font-mono text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampo(valor, disabled)}`}
    />
  );
}

const UNIDADE_PADRAO = { moeda: 'R$', percentual: '%', inteiro: '', data: '', simnao: '' };

const OPCOES_SIM_NAO = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
];

const ROTULO_ORIGEM = { DCD: 'Vem do DCD importado', GERAL: 'Vem do Geral dos Empreendimentos importado' };

function valorFormatado(campo, valor) {
  if (valor === '' || valor === null || valor === undefined) return '—';
  if (campo.tipo === 'data') return formatarDataISO(valor);
  const casas = campo.tipo === 'moeda' ? 2 : campo.tipo === 'inteiro' ? 0 : (campo.casas ?? 2);
  return formatarNumero(valor, casas);
}

// Um parâmetro: rótulo e explicação à esquerda, campo à direita — mesmo par "descrição + campo"
// de MotorRisco/CampoNumerico.jsx. O tipo 'calculado' e os campos fixos (`origemFixo` = 'DCD' |
// 'GERAL': o valor vem do arquivo importado do Contrato Caixa da obra) aparecem travados
// (cadeado), no estilo das "Regras fixas do sistema" do Motor de Risco.
export default function CampoParametro({ campo, valor, onChange, disabled = false, primeiro = false, origemFixo = null }) {
  const unidade = campo.unidade ?? UNIDADE_PADRAO[campo.tipo] ?? '';
  const travado = campo.tipo === 'calculado' || Boolean(origemFixo);

  return (
    <div
      className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_260px] sm:items-start sm:gap-4 ${
        primeiro ? '' : 'border-t border-gray-100'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-gray-800">{campo.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{campo.desc}</p>
        {origemFixo && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">
            <Lock size={10} />
            {ROTULO_ORIGEM[origemFixo] || 'Valor fixo'} — não editável
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {travado ? (
          <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <Lock size={13} className="shrink-0 text-gray-400" />
            <span className="font-mono tabular-nums text-gray-600">{valorFormatado(campo, valor)}</span>
          </div>
        ) : campo.tipo === 'simnao' ? (
          <div className="w-full">
            <SearchableSelect
              value={valor === true ? 'SIM' : valor === false ? 'NAO' : ''}
              onChange={(v) => onChange(campo.id, v === 'SIM' ? true : v === 'NAO' ? false : '')}
              options={OPCOES_SIM_NAO}
              placeholder="Selecione"
              disabled={disabled}
              clearable={false}
              corClasses={estadoCampo(valor, disabled)}
            />
          </div>
        ) : campo.tipo === 'data' ? (
          <input
            type="date"
            value={valor || ''}
            disabled={disabled}
            onChange={(e) => onChange(campo.id, e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-right font-mono text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampo(valor, disabled)}`}
          />
        ) : (
          <CampoNumeroBR
            valor={valor}
            casas={campo.tipo === 'moeda' ? 2 : campo.tipo === 'inteiro' ? 0 : (campo.casas ?? 2)}
            max={campo.max}
            disabled={disabled}
            onChange={(novo) => onChange(campo.id, novo)}
          />
        )}
        <span className="w-16 shrink-0 text-xs text-gray-400">{unidade}</span>
      </div>
    </div>
  );
}
