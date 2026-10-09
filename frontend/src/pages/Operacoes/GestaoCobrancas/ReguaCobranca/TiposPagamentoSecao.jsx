import { useEffect, useState } from 'react';
import Card from '../../../../components/Card';
import TransferList from '../../../../components/TransferList';
import {
  getTiposPagamentoReguaCobranca,
  salvarTiposPagamentoReguaCobranca,
} from '../../../../api/reguaCobranca.api';
import { ParametroLinha, SectionHeader } from './ParametrosLayout';

// Mesmo par âmbar (vazio)/azul (preenchido) de ConfiguracoesRepassesCef.jsx —
// a caixa da direita vazia é um alerta: nenhuma parcela entra na cobrança.
const COR_CAMPO_VAZIO = 'border-amber-300 bg-amber-50 hover:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 hover:border-primary-500';

// "Tipos de Pagamentos para Cobrança": os tipos de pagamento do Sienge
// (payment_term_description das parcelas) movidos pra direita entram na
// Gestão das Parcelas, na Rotina e no relatório Desempenho da Cobrança; os
// da esquerda ficam de fora (ver reguaCobranca.service.js::
// CONDICAO_TIPO_PAGAMENTO). Grava a cada movimento, como os outros
// parâmetros das Configurações Globais.
export default function TiposPagamentoSecao({ empresaId }) {
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!empresaId) return;
    setDados(null);
    setErro('');
    getTiposPagamentoReguaCobranca(empresaId).then(setDados);
  }, [empresaId]);

  async function handleChange(descricoes) {
    const anterior = dados;
    setDados((prev) => ({ ...prev, selecionados: descricoes }));
    setSalvando(true);
    setErro('');
    try {
      setDados(await salvarTiposPagamentoReguaCobranca(empresaId, descricoes));
    } catch (err) {
      setDados(anterior);
      setErro(err.response?.data?.message || 'Não foi possível salvar os tipos de pagamento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <SectionHeader
        selo="Sessão 3"
        titulo="Parcelas na cobrança"
        texto="Quais parcelas do contas a receber do Sienge entram na cobrança."
      />
      {!dados ? (
        <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <ParametroLinha
          primeiro
          largo
          label="Tipos de Pagamentos para Cobrança"
          desc="Só as parcelas dos tipos de pagamento à direita aparecem na Gestão das Parcelas, na Rotina e no relatório Desempenho da Cobrança. Os da esquerda ficam de fora — inclusive um tipo novo que passar a vir do Sienge, até ser movido pra direita. O número ao lado é a quantidade de parcelas em aberto de cada tipo."
          exemplo={
            <>
              Com <b className="font-semibold">PARCELA MENSAL</b> à direita e <b className="font-semibold">Não Cobrar</b> à
              esquerda: as parcelas mensais em aberto entram na Rotina; as marcadas como Não Cobrar no Sienge não aparecem.
            </>
          }
        >
          <TransferList
            itens={dados.tipos}
            selecionados={dados.selecionados}
            onChange={handleChange}
            getId={(t) => t.descricao}
            getLabel={(t) => `${t.descricao} (${t.abertas.toLocaleString('pt-BR')} em aberto)`}
            disabled={salvando}
            tituloDisponiveis="Fora da cobrança"
            tituloSelecionados="Na cobrança"
            vazioDisponiveisTexto="Todos os tipos estão na cobrança."
            vazioSelecionadosTexto="Nenhum tipo na cobrança — nenhuma parcela aparece."
            corSelecionados={dados.selecionados.length > 0 ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO}
          />
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </ParametroLinha>
      )}
    </Card>
  );
}
