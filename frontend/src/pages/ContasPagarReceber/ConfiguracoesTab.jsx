import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { obterConfiguracoesCpr, opcoesContasPagarReceber, salvarConfiguracoesCpr } from '../../api/contasPagarReceber.api';
import { dataHora, mensagemErro } from './util';

// Aba Configurações da tela Contas Pagar / Receber, no padrão das Configurações das outras telas (um Card por
// parâmetro, Salvar no fim, campo âmbar quando pendente e azul quando preenchido). Por ora: o plano de contas
// padrão de cada classificação da Projeção PLS CEF — é o que a aba Rateios do título traz preenchido.

const CLASSIFICACOES = [
  { chave: 'novo_registro', rotulo: 'Novo Registro' },
  { chave: 'medicao', rotulo: 'Medição' },
  { chave: 'credito_pj', rotulo: 'Crédito PJ' },
];

const corSelect = (preenchido) =>
  preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400';

export default function ConfiguracoesTab({ empresaId }) {
  const [naturezas, setNaturezas] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [contas, setContas] = useState({ novo_registro: '', medicao: '', credito_pj: '' });
  const [erroCarga, setErroCarga] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setErroCarga('');
    setCfg(null);
    Promise.all([opcoesContasPagarReceber(empresaId), obterConfiguracoesCpr(empresaId)])
      .then(([op, c]) => {
        if (!vivo) return;
        setNaturezas(op.naturezas);
        setCfg(c);
        setContas({ novo_registro: c.contas.novo_registro || '', medicao: c.contas.medicao || '', credito_pj: c.contas.credito_pj || '' });
      })
      .catch((e) => vivo && setErroCarga(mensagemErro(e, 'Não foi possível carregar as configurações.')));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const opNaturezas = useMemo(
    () => (naturezas || []).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}${n.inativa ? ' (inativa)' : ''}` })),
    [naturezas]
  );

  async function salvar() {
    setSalvando(true);
    setErro('');
    setSalvo(false);
    try {
      const c = await salvarConfiguracoesCpr(empresaId, {
        novo_registro: contas.novo_registro || null,
        medicao: contas.medicao || null,
        credito_pj: contas.credito_pj || null,
      });
      setCfg(c);
      setSalvo(true);
    } catch (e) {
      setErro(mensagemErro(e, 'Não foi possível salvar as configurações.'));
    } finally {
      setSalvando(false);
    }
  }

  if (erroCarga) {
    return (
      <Card className="rounded-tl-none">
        <p className="text-sm text-red-600">{erroCarga}</p>
      </Card>
    );
  }
  if (!cfg) {
    return (
      <Card className="rounded-tl-none">
        <p className="py-10 text-center text-sm text-gray-400">Carregando...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        <div className="border-b border-gray-100 pb-3">
          <h3 className="text-sm font-semibold text-gray-900">Plano de contas por classificação · Projeção PLS CEF</h3>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {CLASSIFICACOES.map((c) => (
            <div key={c.chave}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{c.rotulo}</label>
              <SearchableSelect
                value={contas[c.chave]}
                onChange={(v) => {
                  setContas((x) => ({ ...x, [c.chave]: v || '' }));
                  setSalvo(false);
                }}
                options={opNaturezas}
                placeholder="Escolha o plano de contas"
                emptyMessage="Nenhuma conta cadastrada."
                larguraPainel={460}
                corClasses={corSelect(Boolean(contas[c.chave]))}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={salvar} loading={salvando}>
            Salvar configurações
          </Button>
          {salvo && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 size={15} /> Configurações salvas
            </span>
          )}
          {erro && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle size={15} /> {erro}
            </span>
          )}
          {cfg.atualizado_em && !salvo && !erro && (
            <span className="text-xs text-gray-400">
              Salvo por {cfg.atualizado_por || 'usuário'} em {dataHora(cfg.atualizado_em)}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
