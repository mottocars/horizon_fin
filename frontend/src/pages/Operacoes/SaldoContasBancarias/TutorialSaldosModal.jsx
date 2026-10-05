import { useState } from 'react';
import { BadgeCheck, BookOpen, Landmark, Lightbulb, Lock, ReceiptText, Zap } from 'lucide-react';
import Modal from '../../../components/Modal';

// Botão "Dúvidas" da aba Saldos: tutorial passo a passo, em linguagem direta, de como configurar
// os saldos automáticos — VanPix Extrato, VanPix Cobrança e API Itaú. As regras descritas aqui
// são as de vanpix-sync.service.js.

function Passo({ numero, titulo, children }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">
        {numero}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-gray-900">{titulo}</p>
        <div className="mt-1 space-y-1.5 text-sm leading-relaxed text-gray-600">{children}</div>
      </div>
    </li>
  );
}

function Dica({ children, tom = 'azul' }) {
  const cores = tom === 'amarelo' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-primary-100 bg-primary-50 text-primary-700';
  return (
    <div className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${cores}`}>
      <Lightbulb size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const Caminho = ({ children }) => <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">{children}</span>;
const Campo = ({ children }) => <span className="font-semibold text-gray-800">{children}</span>;

const ABAS = [
  { id: 'inicio', rotulo: 'Visão geral', Icone: BookOpen },
  { id: 'extrato', rotulo: 'VanPix Extrato', Icone: Landmark },
  { id: 'cobranca', rotulo: 'VanPix Cobrança', Icone: ReceiptText },
  { id: 'itau', rotulo: 'API Itaú', Icone: Zap },
  { id: 'abrir', rotulo: 'Abertura do período', Icone: Lock },
];

function Inicio() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-gray-700">
        O saldo diário de cada conta pode ser preenchido <Campo>automaticamente</Campo> na abertura do período, a partir das
        integrações bancárias. Contas sem integração configurada são preenchidas manualmente.
      </p>
      <p className="text-sm leading-relaxed text-gray-700">Integrações disponíveis:</p>
      <ul className="space-y-2 text-sm text-gray-700">
        <li className="flex gap-2">
          <Landmark size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>VanPix Extrato</Campo> — saldo final das contas Caixa, com busca retroativa de até{' '}
            <Campo>90 dias</Campo> até localizar o último fechamento.
          </span>
        </li>
        <li className="flex gap-2">
          <ReceiptText size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>VanPix Cobrança</Campo> — soma ao saldo os boletos liquidados com crédito no dia, consultando os{' '}
            <Campo>últimos 5 dias</Campo> de retorno.
          </span>
        </li>
        <li className="flex gap-2">
          <Zap size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>API Itaú</Campo> — saldo em conta consultado em <Campo>tempo real</Campo>.
          </span>
        </li>
      </ul>
      <Dica>
        Requisito para qualquer conta aparecer na tabela: no cadastro (aba <Caminho>Contas Bancárias</Caminho>), ter uma{' '}
        <Campo>Classificação</Campo> definida e <Campo>Projeta Saldo = Sim</Campo>.
      </Dica>
    </div>
  );
}

function Extrato() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Conexão VanPix de Extrato Bancário">
        <p>
          Em <Caminho>Integrações → Convênios Bancários</Caminho>, deve existir uma conexão <Campo>VanPix</Campo> com
          finalidade <Campo>Extrato Bancário</Campo>, contendo os convênios (apelidos) da empresa — por exemplo,{' '}
          <Campo>ABPFJA</Campo>.
        </p>
      </Passo>
      <Passo numero={2} titulo="Código cedente na conta">
        <p>
          No cadastro da conta (aba <Caminho>Contas Bancárias</Caminho>), informe o convênio em{' '}
          <Campo>Código cedente extrato bancário</Campo> — por exemplo, <Campo>ABPFJC</Campo>.
        </p>
      </Passo>
      <Passo numero={3} titulo="Banco, conta e dígito">
        <p>
          O retorno da VanPix identifica a conta pelo número. <Campo>Banco</Campo>, <Campo>Conta</Campo> e{' '}
          <Campo>Dígito</Campo> do cadastro devem ser idênticos aos do banco — por exemplo, banco <Campo>104</Campo>, conta{' '}
          <Campo>577057641</Campo>, dígito <Campo>0</Campo>.
        </p>
      </Passo>
      <Passo numero={4} titulo="Abertura do período">
        <p>
          Na abertura, o sistema consulta o convênio a partir da data do período, retrocedendo até 90 dias, e grava o
          fechamento mais recente encontrado.
        </p>
      </Passo>
      <Dica tom="amarelo">
        Contas sem <Campo>Código cedente extrato bancário</Campo> não são consultadas na VanPix.
      </Dica>
    </ol>
  );
}

function Cobranca() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Conexão VanPix de Cobrança">
        <p>
          Em <Caminho>Integrações → Convênios Bancários</Caminho>, cadastre uma conexão <Campo>VanPix</Campo> com finalidade{' '}
          <Campo>Cobrança</Campo> e o convênio de boletos — por exemplo, <Campo>C3U1Y8</Campo>.
        </p>
      </Passo>
      <Passo numero={2} titulo="Código cedente na conta">
        <p>
          Na conta que recebe o crédito dos boletos, informe o convênio em <Campo>Código cedente cobrança</Campo>.
        </p>
      </Passo>
      <Passo numero={3} titulo="Composição do saldo">
        <p>
          Os boletos liquidados são creditados na <Campo>data do crédito</Campo>, que ainda não consta no extrato do dia
          anterior. Por isso, o sistema soma:
        </p>
        <div className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
          saldo do extrato + boletos com crédito no dia = saldo do dia
        </div>
        <p>
          Exemplo: extrato <Campo>R$ 10.731,61</Campo> + 3 boletos creditados no dia <Campo>R$ 5.559,80</Campo> ={' '}
          <Campo>R$ 16.291,41</Campo>.
        </p>
      </Passo>
      <Dica>
        Ao posicionar o cursor sobre o saldo na tabela, é exibido o valor correspondente à cobrança (“inclui R$ X de
        cobrança”).
      </Dica>
    </ol>
  );
}

function Itau() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Conexão API Itaú">
        <p>
          Em <Caminho>Integrações → Convênios Bancários → Nova Conexão</Caminho>, selecione <Campo>API Itaú</Campo> e informe
          a <Campo>Credencial (client_id)</Campo>, o <Campo>CNPJ</Campo> e o <Campo>Token temporário</Campo> enviados pelo
          Itaú.
        </p>
      </Passo>
      <Passo numero={2} titulo="Certificado">
        <p>
          Clique em <Campo>Gerar certificado</Campo>. O certificado tem validade de 1 ano e é renovado automaticamente.
        </p>
        <Dica tom="amarelo">O token temporário é de uso único. Em caso de erro, solicite um novo token ao Itaú.</Dica>
      </Passo>
      <Passo numero={3} titulo="Conta Itaú da conexão">
        <p>
          Na conexão, preencha a <Campo>Conta Itaú</Campo>: agência, conta e dígito.
        </p>
      </Passo>
      <Passo numero={4} titulo="Cadastro da conta">
        <p>
          No cadastro da conta (aba <Caminho>Contas Bancárias</Caminho>), o <Campo>Banco</Campo> deve ser{' '}
          <Campo>341</Campo>, com <Campo>Agência</Campo>, <Campo>Conta</Campo> e <Campo>Dígito</Campo> idênticos aos da
          conexão.
        </p>
      </Passo>
      <Passo numero={5} titulo="Abertura do período">
        <p>Na abertura, o sistema consulta o saldo em conta no Itaú naquele momento.</p>
      </Passo>
    </ol>
  );
}

function Abrir() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Abrir o período">
        <p>
          Clique no cadeado <Campo>azul</Campo> (nenhum período aberto), selecione a data e confirme.
        </p>
      </Passo>
      <Passo numero={2} titulo="Busca automática">
        <p>
          O sistema consulta VanPix Extrato, VanPix Cobrança e API Itaú. Ao final, é exibido um resumo com as contas
          atualizadas e eventuais avisos.
        </p>
      </Passo>
      <Passo numero={3} titulo="Identificação na tabela">
        <p className="flex items-center gap-1.5">
          <Zap size={14} className="text-emerald-500" /> Ícone verde: saldo obtido automaticamente.
        </p>
        <p>Célula em branco: nenhuma integração retornou saldo — preenchimento manual.</p>
      </Passo>
      <Passo numero={4} titulo="Contas sem saldo">
        <p>
          Quando nenhuma integração retorna saldo, a conta só repete o saldo anterior se a classificação estiver configurada
          como <Campo>Buscar saldo anterior</Campo> (aba <Caminho>Classificação</Caminho>). Caso contrário, permanece em
          branco.
        </p>
      </Passo>
      <Passo numero={5} titulo="Encerrar o período">
        <p className="flex items-center gap-1.5">
          <BadgeCheck size={14} className="text-emerald-500" /> Após a conferência, clique no cadeado{' '}
          <Campo>amarelo</Campo> para encerrar.
        </p>
      </Passo>
    </ol>
  );
}

const CONTEUDO = { inicio: Inicio, extrato: Extrato, cobranca: Cobranca, itau: Itau, abrir: Abrir };

export default function TutorialSaldosModal({ open, onClose }) {
  const [aba, setAba] = useState('inicio');
  const Conteudo = CONTEUDO[aba];
  const indice = ABAS.findIndex((a) => a.id === aba);

  return (
    <Modal open={open} onClose={onClose} title="Dúvidas — configuração dos saldos automáticos" maxWidthClass="max-w-3xl">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {ABAS.map(({ id, rotulo, Icone }, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                aba === id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className={`text-[10px] ${aba === id ? 'text-white/80' : 'text-gray-400'}`}>{i + 1}</span>
              <Icone size={13} />
              {rotulo}
            </button>
          ))}
        </div>

        <Conteudo />

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setAba(ABAS[indice - 1].id)}
            disabled={indice === 0}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:invisible"
          >
            ← Anterior
          </button>
          {indice < ABAS.length - 1 ? (
            <button
              type="button"
              onClick={() => setAba(ABAS[indice + 1].id)}
              className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Próximo →
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Concluir
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
