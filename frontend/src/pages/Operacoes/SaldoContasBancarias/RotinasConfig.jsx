import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { AlertTriangle, Landmark, Layers, ListChecks, UserRound } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import { getRotinasConfig, salvarRotinasConfig } from '../../../api/saldoContasBancarias.api';
import LogoBanco from './LogoBanco';

const ROTULO_PERMISSAO = { MASTER: 'Master', BASICO: 'Básico' };

const DIVISOES = [
  { id: 'CLASSIFICACAO', rotulo: 'Classificação', Icone: Layers, lista: 'classificacoes' },
  { id: 'BANCO', rotulo: 'Banco', Icone: Landmark, lista: 'bancos' },
];

// Mesmo par âmbar (falta preencher)/azul (preenchido) do resto da tela de Configurações.
const COR_VAZIO = 'border-amber-300 bg-amber-50 hover:border-amber-400';
const COR_PREENCHIDO = 'border-primary-100 bg-primary-50 hover:border-primary-500';
const COR_NEUTRA = 'border-gray-200 bg-white hover:border-gray-300';

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

function mapaInicial(lista) {
  return Object.fromEntries(lista.map((i) => [i.chave, i.usuarioId ?? null]));
}

// Parâmetro "Gerar Rotinas": liga a aba Rotinas e define quem é responsável por lançar os
// saldos de cada classificação (ou de cada banco). As duas divisões ficam guardadas — trocar
// "Dividir por" não perde a outra. Ver backend saldo-contas-bancarias/rotinas.service.js.
// Sem botão próprio: o "Salvar" do fim da aba Configurações grava tudo da tela, chamando
// salvar() daqui pela ref (ver ConfiguracoesTab.jsx). onAlterado avisa a tela de qualquer
// mudança (pra apagar o "Salvo").
const RotinasConfig = forwardRef(function RotinasConfig({ empresaId, onAlterado }, ref) {
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState(null);
  const [gerar, setGerar] = useState(false);
  const [dividirPor, setDividirPor] = useState('CLASSIFICACAO');
  const [responsaveis, setResponsaveis] = useState({ CLASSIFICACAO: {}, BANCO: {} });
  const [erro, setErro] = useState('');

  const aplicar = useCallback((d) => {
    setDados(d);
    setGerar(d.gerar);
    setDividirPor(d.dividirPor);
    setResponsaveis({ CLASSIFICACAO: mapaInicial(d.classificacoes), BANCO: mapaInicial(d.bancos) });
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    getRotinasConfig(empresaId)
      .then(aplicar)
      .catch(() => setErro('Não foi possível carregar a configuração de rotinas.'))
      .finally(() => setCarregando(false));
  }, [empresaId, aplicar]);

  const divisao = DIVISOES.find((d) => d.id === dividirPor);
  const itens = useMemo(() => dados?.[divisao.lista] || [], [dados, divisao]);
  const opcoesUsuarios = useMemo(
    () => (dados?.elegiveis || []).map((u) => ({ value: u.id, label: `${u.nome} (${ROTULO_PERMISSAO[u.permissao] || u.permissao})` })),
    [dados]
  );
  const nomeUsuario = useMemo(() => new Map((dados?.elegiveis || []).map((u) => [u.id, u.nome])), [dados]);

  // Resumo da divisão ativa: quem cuida de quanto, e o que ficou sem dono.
  const resumo = useMemo(() => {
    const mapa = responsaveis[dividirPor];
    const porUsuario = new Map();
    let contasSemDono = 0;
    let itensSemDono = 0;
    for (const item of itens) {
      const id = mapa[item.chave];
      if (!id) {
        if (item.contas > 0) {
          contasSemDono += item.contas;
          itensSemDono += 1;
        }
        continue;
      }
      if (!porUsuario.has(id)) porUsuario.set(id, { itens: 0, contas: 0 });
      porUsuario.get(id).itens += 1;
      porUsuario.get(id).contas += item.contas;
    }
    return {
      porUsuario: [...porUsuario.entries()]
        .map(([id, r]) => ({ id, nome: nomeUsuario.get(id) || `Usuário ${id}`, ...r }))
        .sort((a, b) => b.contas - a.contas),
      contasSemDono,
      itensSemDono,
    };
  }, [responsaveis, dividirPor, itens, nomeUsuario]);

  function definirResponsavel(chave, valor) {
    setResponsaveis((prev) => ({ ...prev, [dividirPor]: { ...prev[dividirPor], [chave]: valor ? Number(valor) : null } }));
    onAlterado?.();
  }

  // Chamado pelo Salvar da aba Configurações. Lança em caso de erro (a tela mostra a mensagem).
  // Sem a configuração carregada, não grava nada (evitaria apagar responsáveis por engano).
  useImperativeHandle(ref, () => ({
    async salvar() {
      if (!dados) return;
      const paraLista = (tipo) => Object.entries(responsaveis[tipo]).map(([chave, usuarioId]) => ({ chave, usuarioId }));
      const atualizado = await salvarRotinasConfig(empresaId, {
        gerar,
        dividirPor,
        responsaveis: { CLASSIFICACAO: paraLista('CLASSIFICACAO'), BANCO: paraLista('BANCO') },
      });
      aplicar(atualizado);
    },
  }));

  return (
    <Card className="rounded-tl-none">
      <div className="flex flex-col gap-4 border-b border-gray-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ListChecks size={16} className="text-gray-400" />
            Gerar Rotinas
          </h3>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">
            Divide o lançamento dos saldos entre responsáveis. Ligado, aparece a aba <strong className="font-medium">Rotinas</strong>{' '}
            (a primeira), onde cada responsável lança só os saldos das contas dele no período aberto e encerra a própria
            rotina. O período só pode ser encerrado depois que todos os responsáveis encerrarem.
          </p>
        </div>

        {/* Interruptor Gerar / Não gerar */}
        <button
          type="button"
          role="switch"
          aria-checked={gerar}
          disabled={carregando}
          onClick={() => {
            setGerar((v) => !v);
            onAlterado?.();
          }}
          className="flex shrink-0 items-center gap-2.5 self-start rounded-full border border-gray-200 py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          <span className={`relative h-6 w-11 rounded-full transition-colors ${gerar ? 'bg-primary-600' : 'bg-gray-300'}`}>
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${gerar ? 'left-5.5' : 'left-0.5'}`}
            />
          </span>
          <span className={gerar ? 'text-primary-700' : 'text-gray-500'}>{gerar ? 'Gerar' : 'Não gerar'}</span>
        </button>
      </div>

      {carregando ? (
        <div className="mt-4 text-sm text-gray-400">Carregando...</div>
      ) : !dados ? (
        <div className="mt-4 text-sm text-red-600">{erro}</div>
      ) : (
        <>
          {gerar && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Dividir por</span>
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  {DIVISOES.map(({ id, rotulo, Icone }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setDividirPor(id);
                        onAlterado?.();
                      }}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        dividirPor === id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <Icone size={15} />
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-100">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-3 py-2 font-medium">{divisao.rotulo}</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Contas</th>
                      <th className="w-80 px-3 py-2 font-medium">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-xs text-gray-400">
                          {dividirPor === 'BANCO'
                            ? 'Nenhuma conta classificada e projetando saldo ainda.'
                            : 'Nenhuma classificação cadastrada (aba Classificação).'}
                        </td>
                      </tr>
                    )}
                    {itens.map((item) => {
                      const usuarioId = responsaveis[dividirPor][item.chave] ?? null;
                      const semContas = item.contas === 0;
                      return (
                        <tr key={item.chave} className="border-t border-gray-50">
                          <td className="px-3 py-2">
                            <div className={`flex items-center gap-2.5 ${semContas ? 'text-gray-400' : 'text-gray-800'}`}>
                              {dividirPor === 'BANCO' && (
                                <LogoBanco codigo={item.chave} info={{ codigo: item.chave, nome: item.nome, logo: item.logo }} />
                              )}
                              <span className="truncate font-medium">{item.nome}</span>
                              {dividirPor === 'BANCO' && <span className="shrink-0 text-xs text-gray-400">{item.chave}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span
                              className={`inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                                semContas ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-700'
                              }`}
                              title={semContas ? 'Nenhuma conta ativa, classificada e projetando saldo' : undefined}
                            >
                              {item.contas}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            <SearchableSelect
                              value={usuarioId ?? ''}
                              onChange={(valor) => definirResponsavel(item.chave, valor)}
                              options={opcoesUsuarios}
                              placeholder="Sem responsável"
                              emptyMessage="Nenhum usuário com acesso a esta empresa."
                              corClasses={usuarioId ? COR_PREENCHIDO : semContas ? COR_NEUTRA : COR_VAZIO}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(resumo.porUsuario.length > 0 || resumo.contasSemDono > 0) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {resumo.porUsuario.map((u) => (
                    <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-primary-700">
                      <UserRound size={12} />
                      <span className="font-medium">{u.nome}</span>
                      <span className="text-primary-500">
                        {plural(u.itens, dividirPor === 'BANCO' ? 'banco' : 'classificação', dividirPor === 'BANCO' ? 'bancos' : 'classificações')} ·{' '}
                        {plural(u.contas, 'conta', 'contas')}
                      </span>
                    </span>
                  ))}
                  {resumo.contasSemDono > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                      <AlertTriangle size={12} />
                      {plural(resumo.contasSemDono, 'conta', 'contas')} em {plural(resumo.itensSemDono, 'item', 'itens')} sem
                      responsável — ficam fora das rotinas (lançadas em Saldos das Contas)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

        </>
      )}
    </Card>
  );
});

export default RotinasConfig;
