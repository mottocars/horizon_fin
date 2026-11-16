import { FilePlus2, Gauge, GraduationCap, HeartHandshake, Smile } from 'lucide-react';
import { novoId } from './tipos';

// Modelos para começar um formulário (a faixa "Começar um formulário" da lista). Cada um gera perguntas
// com ids novos — o usuário edita tudo depois.
const opcoes = (...textos) => textos.map((texto) => ({ id: novoId(), texto }));
const p = (tipo, titulo, extra = {}) => ({ id: novoId(), tipo, titulo, descricao: '', obrigatoria: false, ...extra });

export const MODELOS = [
  {
    id: 'branco',
    rotulo: 'Em branco',
    descricao: 'Comece do zero',
    icone: FilePlus2,
    cor: '#2563eb',
    gerar: () => ({}),
  },
  {
    id: 'satisfacao',
    rotulo: 'Satisfação',
    descricao: 'Avaliação de atendimento',
    icone: Smile,
    cor: '#059669',
    gerar: () => ({
      titulo: 'Pesquisa de satisfação',
      descricao: 'Queremos saber como foi a sua experiência. Leva menos de 2 minutos.',
      cor_tema: '#059669',
      perguntas: [
        p('AVALIACAO', 'Como você avalia o atendimento recebido?', { obrigatoria: true, escala: { min: 1, max: 5 } }),
        p('MULTIPLA_ESCOLHA', 'O seu problema foi resolvido?', { obrigatoria: true, opcoes: opcoes('Sim', 'Em parte', 'Não'), outro: false }),
        p('CAIXAS_SELECAO', 'O que mais chamou a sua atenção?', {
          opcoes: opcoes('Agilidade', 'Cordialidade', 'Clareza das informações', 'Conhecimento técnico'),
          outro: true,
        }),
        p('TEXTO_LONGO', 'O que podemos melhorar?'),
      ],
    }),
  },
  {
    id: 'nps',
    rotulo: 'NPS',
    descricao: 'Recomendação de 0 a 10',
    icone: Gauge,
    cor: '#7c3aed',
    gerar: () => ({
      titulo: 'Pesquisa NPS',
      descricao: 'Sua opinião nos ajuda a melhorar.',
      cor_tema: '#7c3aed',
      perguntas: [
        p('ESCALA_LINEAR', 'Em uma escala de 0 a 10, o quanto você recomendaria a nossa empresa a um amigo ou colega?', {
          obrigatoria: true,
          escala: { min: 0, max: 10, rotulo_min: 'Nada provável', rotulo_max: 'Extremamente provável' },
        }),
        p('TEXTO_LONGO', 'Qual o principal motivo da sua nota?'),
      ],
    }),
  },
  {
    id: 'clima',
    rotulo: 'Clima interno',
    descricao: 'Pesquisa com a equipe',
    icone: HeartHandshake,
    cor: '#d97706',
    gerar: () => ({
      titulo: 'Pesquisa de clima',
      descricao: 'As respostas ajudam a construir um ambiente de trabalho melhor para todos.',
      modalidade: 'PRIVADO',
      cor_tema: '#d97706',
      perguntas: [
        p('SECAO', 'Ambiente de trabalho'),
        p('ESCALA_LINEAR', 'Eu me sinto motivado(a) no meu dia a dia de trabalho.', {
          obrigatoria: true,
          escala: { min: 1, max: 5, rotulo_min: 'Discordo totalmente', rotulo_max: 'Concordo totalmente' },
        }),
        p('ESCALA_LINEAR', 'Tenho as ferramentas de que preciso para fazer um bom trabalho.', {
          obrigatoria: true,
          escala: { min: 1, max: 5, rotulo_min: 'Discordo totalmente', rotulo_max: 'Concordo totalmente' },
        }),
        p('SECAO', 'Liderança e comunicação'),
        p('MULTIPLA_ESCOLHA', 'Com que frequência você recebe feedback da sua liderança?', {
          obrigatoria: true,
          opcoes: opcoes('Toda semana', 'Todo mês', 'Raramente', 'Nunca'),
          outro: false,
        }),
        p('TEXTO_LONGO', 'Deixe aqui sugestões ou comentários.'),
      ],
    }),
  },
  {
    id: 'treinamento',
    rotulo: 'Treinamento',
    descricao: 'Avaliação de evento',
    icone: GraduationCap,
    cor: '#0891b2',
    gerar: () => ({
      titulo: 'Avaliação do treinamento',
      descricao: 'Conte para nós o que achou do treinamento.',
      cor_tema: '#0891b2',
      perguntas: [
        p('TEXTO_CURTO', 'Nome', { obrigatoria: true }),
        p('DATA', 'Data do treinamento'),
        p('AVALIACAO', 'Nota geral do treinamento', { obrigatoria: true, escala: { min: 1, max: 5 } }),
        p('LISTA', 'O conteúdo foi', { opcoes: opcoes('Muito básico', 'Adequado', 'Muito avançado'), outro: false }),
        p('TEXTO_LONGO', 'Que temas você gostaria de ver nos próximos treinamentos?'),
      ],
    }),
  },
];
