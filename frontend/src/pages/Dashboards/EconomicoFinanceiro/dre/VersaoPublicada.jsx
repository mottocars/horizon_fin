import { useEffect, useState } from 'react';
import Modal from '../../../../components/Modal';
import Avatar from '../../../Home/PlanoDeVoo/Avatar';
import { versaoPublicadaDre } from '../../../../api/dreVersoes.api';

const data = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '');
const dataHora = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '');
const primeiroNome = (nome = '') => nome.trim().split(/\s+/)[0] || nome;
const colaboracoes = (n) => (n === 1 ? '1 colaboração' : `${n} colaborações`);

// Etiqueta no mesmo desenho das do CabecalhoDashboard (ex.: "Obras 12 · Referência nov/2026" do dashboard
// Cronogramas de Obras): pílula com o rótulo e o valor em negrito. Com `onClick`, é um botão (abre a janela).
const PILULA = 'whitespace-nowrap rounded-full border border-[#d3dade] bg-[#fbfcfc] px-2 py-0.5 font-mono text-[11px] text-[#44525c]';
function Etiqueta({ rotulo, valor, onClick, titulo }) {
  const conteudo = (
    <>
      {rotulo} <b className="font-medium text-[#13202a]">{valor}</b>
    </>
  );
  if (!onClick) return <span className={PILULA}>{conteudo}</span>;
  return (
    <button type="button" onClick={onClick} title={titulo} className={`${PILULA} !font-mono !text-[11px] !leading-normal transition-colors hover:border-[#13202a] hover:bg-white`}>
      {conteudo}
    </button>
  );
}

// Janela de uma pessoa: a foto, o nome e o que ela fez (data e hora).
function Pessoa({ pessoa, texto }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Avatar usuario={pessoa} tamanho="xxl" anel={false} />
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{pessoa.nome}</h3>
      <p className="mt-1 text-sm text-gray-500">{texto}</p>
    </div>
  );
}

// Dashboard Econômico Financeiro › Demonstração do Resultado, no cabeçalho, antes da logomarca (pedido do usuário):
// a versão publicada da DRE (a última salva — Operações › DRE Construtoras › Versões) e, pelos nomes:
//   Responsável   — quem fechou (salvou) a versão; clicando, a foto e a data e hora do fechamento;
//   Aprovador     — a aprovação ainda vai existir: por enquanto, quem fechou (e a data e hora do fechamento);
//   Colaboradores — quem fez alguma alteração carimbada na versão: o primeiro nome do que mais colaborou
//                   (+ quantos outros); clicando, a lista com foto, nome e a quantidade de colaborações.
export default function VersaoPublicada({ empresaId }) {
  const [v, setV] = useState(null);
  const [janela, setJanela] = useState(null); // 'responsavel' | 'aprovador' | 'colaboradores'

  useEffect(() => {
    setV(null);
    if (!empresaId) return undefined;
    let ativo = true;
    versaoPublicadaDre(empresaId)
      .then((r) => ativo && setV(r))
      .catch(() => ativo && setV(null));
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  if (!v) return null;

  const colab = v.colaboradores;
  const fechar = () => setJanela(null);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Etiqueta rotulo="Versão" valor={`${v.numero} · ${data(v.fechada_em)}`} titulo={`Realizado até ${mesCurto(v.corte)}`} />
      <Etiqueta rotulo="Responsável" valor={v.fechou.nome} onClick={() => setJanela('responsavel')} titulo="Quem fechou a versão" />
      <Etiqueta rotulo="Aprovador" valor={v.aprovador.nome} onClick={() => setJanela('aprovador')} titulo="Quem aprovou a versão" />
      {colab.length ? (
        <Etiqueta
          rotulo="Colaboradores"
          valor={colab.length === 1 ? colab[0].nome : `${primeiroNome(colab[0].nome)} + ${colab.length - 1}`}
          onClick={() => setJanela('colaboradores')}
          titulo="Quem colaborou nesta versão"
        />
      ) : (
        <Etiqueta rotulo="Colaboradores" valor="nenhum" />
      )}

      <Modal open={janela === 'responsavel'} onClose={fechar} title={`Responsável pela versão ${v.numero}`} maxWidthClass="max-w-sm">
        <Pessoa pessoa={v.fechou} texto={`Fechou a versão em ${dataHora(v.fechada_em)}`} />
      </Modal>

      <Modal open={janela === 'aprovador'} onClose={fechar} title={`Aprovador da versão ${v.numero}`} maxWidthClass="max-w-sm">
        {/* A aprovação ainda vai existir: por enquanto, quem fechou e quando fechou. */}
        <Pessoa pessoa={v.aprovador} texto={`Aprovou em ${dataHora(v.aprovado_em || v.fechada_em)}`} />
      </Modal>

      <Modal open={janela === 'colaboradores'} onClose={fechar} title={`Colaboradores da versão ${v.numero}`} maxWidthClass="max-w-sm">
        <ul className="divide-y divide-gray-100">
          {colab.map((c) => (
            <li key={c.id || c.nome} className="flex items-center gap-3 py-2">
              <Avatar usuario={c} tamanho="sm" anel={false} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{c.nome}</span>
              <span className="shrink-0 text-xs text-gray-500">{colaboracoes(c.alteracoes)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
