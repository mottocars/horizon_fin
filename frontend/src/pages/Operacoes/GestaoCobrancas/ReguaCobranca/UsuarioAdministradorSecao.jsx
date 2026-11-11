import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import TransferList from '../../../../components/TransferList';
import { getAdministradoresCobranca, salvarAdministradoresCobranca } from '../../../../api/cobrancaAcesso.api';
import { ParametroLinha, SectionHeader } from './ParametrosLayout';

// Mesmo par âmbar (vazio)/azul (preenchido) de TiposPagamentoSecao.jsx.
const COR_CAMPO_VAZIO = 'border-amber-300 bg-amber-50 hover:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 hover:border-primary-500';

// "Usuário Administrador": quem está à direita é Administrador da Gestão de
// Cobranças nesta empresa (todas as abas e a Rotina de todos); quem está à
// esquerda é Comum (Rotinas — só a própria —, Gestão das Parcelas e Clusters
// de Clientes). Master é sempre Administrador e não aparece na lista. Mesmo
// componente e mesmo jeito de gravar (a cada movimento) dos Tipos de
// Pagamento — ver backend/src/modules/cobranca-acesso.
export default function UsuarioAdministradorSecao({ empresaId, className = '' }) {
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!empresaId) return;
    setDados(null);
    setErro('');
    getAdministradoresCobranca(empresaId)
      .then(setDados)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar os usuários.'));
  }, [empresaId]);

  async function handleChange(ids) {
    const anterior = dados;
    setDados((prev) => ({ ...prev, selecionados: ids.map(Number) }));
    setSalvando(true);
    setErro('');
    try {
      setDados(await salvarAdministradoresCobranca(empresaId, ids.map(Number)));
    } catch (err) {
      setDados(anterior);
      setErro(err.response?.data?.message || 'Não foi possível salvar os administradores.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className={className}>
      <SectionHeader selo="Sessão 1" titulo="Acesso" texto="Quem administra a Gestão de Cobranças desta empresa." />
      {!dados ? (
        <div className="py-8 text-center text-sm text-gray-400">{erro || 'Carregando...'}</div>
      ) : (
        <ParametroLinha
          primeiro
          largo
          label="Usuário Administrador"
          desc="Quem está à direita é Administrador: vê todas as abas (Motor de Risco, Comunicação, Régua de Cobrança, Clientes e Configurações) e a Rotina de todos os atendentes. Quem está à esquerda é Comum: vê só a própria Rotina, a Gestão das Parcelas e os Clusters de Clientes. Usuário Master é sempre Administrador. Aparecem aqui os usuários com esta empresa e a tela Gestão de Cobranças no cadastro."
          exemplo={
            <>
              Com <b className="font-semibold">Michelly</b> à direita e <b className="font-semibold">Heloisa</b> à esquerda: Michelly
              configura a régua e acompanha a Rotina das duas; Heloisa abre a tela e vê só a Rotina dela, a Gestão das Parcelas e os
              Clusters.
            </>
          }
        >
          <TransferList
            itens={dados.usuarios}
            selecionados={dados.selecionados.map(String)}
            onChange={handleChange}
            getId={(u) => u.id}
            getLabel={(u) => `${u.nome}${u.inelegivel ? ' (sem a tela ou a empresa no cadastro)' : ''}`}
            disabled={salvando}
            tituloDisponiveis="Comum"
            tituloSelecionados="Administrador"
            vazioDisponiveisTexto="Todos os usuários são Administrador."
            vazioSelecionadosTexto="Nenhum Administrador — só o Master configura."
            corSelecionados={dados.selecionados.length > 0 ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO}
          />
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </ParametroLinha>
      )}
    </Card>
  );
}
