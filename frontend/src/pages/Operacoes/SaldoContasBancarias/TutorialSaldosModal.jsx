import { useState } from 'react';
import { BadgeCheck, BookOpen, Landmark, Lightbulb, Lock, ReceiptText, Zap } from 'lucide-react';
import Modal from '../../../components/Modal';

// Botão "Dúvidas" da aba Saldos: tutorial bem didático (pedido do usuário: "como se estivesse
// ensinando uma criança") de como deixar os saldos automáticos — VanPix Extrato, VanPix
// Cobrança e API Itaú. As regras descritas aqui são as de vanpix-sync.service.js.

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
  { id: 'inicio', rotulo: 'Comece aqui', Icone: BookOpen },
  { id: 'extrato', rotulo: 'VanPix Extrato', Icone: Landmark },
  { id: 'cobranca', rotulo: 'VanPix Cobrança', Icone: ReceiptText },
  { id: 'itau', rotulo: 'API Itaú', Icone: Zap },
  { id: 'abrir', rotulo: 'Abrir o dia', Icone: Lock },
];

function Inicio() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-gray-700">
        Imagine que cada conta bancária é um <Campo>cofrinho</Campo>. Todo dia a gente precisa anotar quanto dinheiro tem em
        cada cofrinho. Em vez de anotar tudo à mão, o sistema pode <Campo>perguntar sozinho para o banco</Campo> — é isso que
        chamamos de saldo automático.
      </p>
      <p className="text-sm leading-relaxed text-gray-700">Existem 3 jeitos de o sistema perguntar para o banco:</p>
      <ul className="space-y-2 text-sm text-gray-700">
        <li className="flex gap-2">
          <Landmark size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>VanPix Extrato</Campo> — traz o saldo das contas da Caixa. Ele procura até <Campo>90 dias para trás</Campo> até
            achar o último saldo.
          </span>
        </li>
        <li className="flex gap-2">
          <ReceiptText size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>VanPix Cobrança</Campo> — soma os boletos pagos pelos clientes que caem na conta no dia. Olha os{' '}
            <Campo>últimos 5 dias</Campo>.
          </span>
        </li>
        <li className="flex gap-2">
          <Zap size={16} className="mt-0.5 shrink-0 text-primary-600" />
          <span>
            <Campo>API Itaú</Campo> — pergunta direto para o Itaú e traz o saldo <Campo>na hora</Campo> (tempo real).
          </span>
        </li>
      </ul>
      <Dica>
        Para <Campo>qualquer</Campo> conta aparecer na tabela de saldos, ela precisa de 2 coisas no cadastro (aba{' '}
        <Caminho>Contas Bancárias</Caminho> → lápis da conta): uma <Campo>Classificação</Campo> escolhida e{' '}
        <Campo>Projeta Saldo = Sim</Campo>.
      </Dica>
    </div>
  );
}

function Extrato() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Tenha a conexão VanPix de Extrato">
        <p>
          Vá em <Caminho>Integrações → Convênios Bancários</Caminho>. Ali precisa existir uma conexão do tipo{' '}
          <Campo>VanPix</Campo> com a finalidade <Campo>Extrato Bancário</Campo>.
        </p>
        <p>
          Dentro dela ficam os <Campo>apelidos</Campo> (convênios), como <Campo>ABPFJA</Campo>. Pense no apelido como o “nome
          da gaveta” onde a Caixa guarda os extratos.
        </p>
      </Passo>
      <Passo numero={2} titulo="Diga para a conta qual é a gaveta dela">
        <p>
          Abra a conta em <Caminho>Contas Bancárias</Caminho> (lápis) e preencha o{' '}
          <Campo>Código cedente extrato bancário</Campo> com o apelido. Exemplo: <Campo>ABPFJC</Campo>.
        </p>
      </Passo>
      <Passo numero={3} titulo="Confira banco, conta e dígito">
        <p>
          A VanPix manda o saldo com o número da conta. O sistema só entende que é aquela conta se <Campo>Banco</Campo>,{' '}
          <Campo>Conta</Campo> e <Campo>Dígito</Campo> estiverem iguais aos do banco. Exemplo: banco <Campo>104</Campo>, conta{' '}
          <Campo>577057641</Campo>, dígito <Campo>0</Campo>.
        </p>
      </Passo>
      <Passo numero={4} titulo="Pronto! Agora é só abrir o dia">
        <p>
          Quando você abrir o período, o sistema vai à gaveta, procura o último saldo (até 90 dias para trás) e coloca na
          tabela sozinho.
        </p>
      </Passo>
      <Dica tom="amarelo">
        Sem o <Campo>Código cedente extrato bancário</Campo>, o sistema <Campo>não</Campo> busca o saldo dessa conta na
        VanPix.
      </Dica>
    </ol>
  );
}

function Cobranca() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Tenha a conexão VanPix de Cobrança">
        <p>
          Em <Caminho>Integrações → Convênios Bancários</Caminho>, crie (ou confira) uma conexão <Campo>VanPix</Campo> com a
          finalidade <Campo>Cobrança</Campo> e o apelido do convênio de boletos. Exemplo: <Campo>C3U1Y8</Campo>.
        </p>
      </Passo>
      <Passo numero={2} titulo="Diga para a conta que ela recebe os boletos">
        <p>
          Na conta onde o dinheiro dos boletos cai, preencha o <Campo>Código cedente cobrança</Campo> com esse apelido.
        </p>
      </Passo>
      <Passo numero={3} titulo="Entenda a conta de somar">
        <p>
          Quando um cliente paga um boleto, o banco avisa antes e o dinheiro cai na conta num dia certinho (a{' '}
          <Campo>data do crédito</Campo>). O extrato do banco ainda não tem esse dinheiro, então o sistema{' '}
          <Campo>soma</Campo>:
        </p>
        <div className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
          saldo do extrato + boletos com data do crédito no dia = saldo do dia
        </div>
        <p>
          Exemplo: extrato <Campo>R$ 10.731,61</Campo> + 3 boletos que caem hoje <Campo>R$ 5.559,80</Campo> ={' '}
          <Campo>R$ 16.291,41</Campo>.
        </p>
      </Passo>
      <Dica>
        Na tabela, passe o mouse sobre o saldo: aparece “inclui R$ X de cobrança”, mostrando quanto veio dos boletos.
      </Dica>
    </ol>
  );
}

function Itau() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Crie a conexão API Itaú">
        <p>
          Em <Caminho>Integrações → Convênios Bancários → Nova Conexão</Caminho>, escolha <Campo>API Itaú</Campo>. Preencha a{' '}
          <Campo>Credencial (client_id)</Campo>, o <Campo>CNPJ</Campo> e o <Campo>Token temporário</Campo> que o Itaú mandou
          na planilha.
        </p>
      </Passo>
      <Passo numero={2} titulo="Gere o certificado">
        <p>
          Clique em <Campo>Gerar certificado</Campo>. É como fazer a “chave da porta” do Itaú: ela vale 1 ano e o sistema
          renova sozinho.
        </p>
        <Dica tom="amarelo">O token temporário só funciona uma vez. Se der erro, peça um novo ao Itaú.</Dica>
      </Passo>
      <Passo numero={3} titulo="Informe a conta Itaú da conexão">
        <p>
          Na conexão, preencha a <Campo>Conta Itaú</Campo>: agência, conta e dígito.
        </p>
      </Passo>
      <Passo numero={4} titulo="Deixe o cadastro da conta igualzinho">
        <p>
          Na conta em <Caminho>Contas Bancárias</Caminho>, o <Campo>Banco</Campo> tem que ser <Campo>341</Campo> e a{' '}
          <Campo>Agência</Campo>, a <Campo>Conta</Campo> e o <Campo>Dígito</Campo> iguais aos da conexão. É assim que o
          sistema sabe que é a mesma conta.
        </p>
      </Passo>
      <Passo numero={5} titulo="Pronto!">
        <p>Ao abrir o dia, o sistema pergunta ao Itaú e traz o saldo da conta naquele momento.</p>
      </Passo>
    </ol>
  );
}

function Abrir() {
  return (
    <ol className="space-y-4">
      <Passo numero={1} titulo="Clique no cadeado azul">
        <p>
          No canto de cima, o cadeado <Campo>azul</Campo> quer dizer “nenhum dia aberto”. Clique nele, escolha a data e
          confirme.
        </p>
      </Passo>
      <Passo numero={2} titulo="Espere o sistema buscar">
        <p>
          Ele vai perguntar para a VanPix (extrato e cobrança) e para o Itaú. No final aparece um resumo com o que deu certo e
          os avisos.
        </p>
      </Passo>
      <Passo numero={3} titulo="Veja as cores da tabela">
        <p className="flex items-center gap-1.5">
          <Zap size={14} className="text-emerald-500" /> Verde com raio: o saldo veio <Campo>automático</Campo>.
        </p>
        <p>Em branco: nenhuma integração achou saldo — digite à mão.</p>
      </Passo>
      <Passo numero={4} titulo="Quando a conta fica em branco?">
        <p>
          Se nenhuma integração achar saldo, a conta só repete o saldo do dia anterior se a classificação dela estiver como{' '}
          <Campo>Buscar saldo anterior</Campo> (aba <Caminho>Classificação</Caminho>). Se não, fica em branco para você
          preencher.
        </p>
      </Passo>
      <Passo numero={5} titulo="Terminou? Feche o cadeado">
        <p className="flex items-center gap-1.5">
          <BadgeCheck size={14} className="text-emerald-500" /> Clique no cadeado <Campo>amarelo</Campo> para encerrar o dia.
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
    <Modal open={open} onClose={onClose} title="Dúvidas — como deixar os saldos automáticos" maxWidthClass="max-w-3xl">
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
              Entendi!
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
