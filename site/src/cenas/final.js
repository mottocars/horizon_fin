// Final: a caixa de diálogo "Excluir a planilha NÃO MEXER?". Cancelar insiste (com humor); Excluir apaga a
// última aba da barra e abre o WhatsApp (o link é um <a> de verdade — funciona sem JavaScript também).
import { abas } from '../nucleo/abas.js';

const INSISTENCIAS = [
  'Tem certeza? Ela tem #REF! em 14 células.',
  'A Juliana pediu para avisar que não vai sentir falta.',
  'Tá bom. Ela continua aqui. Por enquanto.',
];

export function montarFinal(raiz) {
  const dialogo = raiz.querySelector('.dialogo');
  const msg = raiz.querySelector('[data-dialogo-msg]');
  const cancelar = raiz.querySelector('[data-cancelar]');
  const excluir = raiz.querySelector('[data-excluir]');
  let vez = 0;

  cancelar.addEventListener('click', () => {
    msg.textContent = INSISTENCIAS[Math.min(vez, INSISTENCIAS.length - 1)];
    vez++;
    dialogo.classList.remove('tremeu');
    void dialogo.offsetWidth;
    dialogo.classList.add('tremeu');
  });
  excluir.addEventListener('click', () => {
    abas().apagar('dialogo');
    msg.textContent = 'Planilha excluída. Abrindo a conversa com o Horizon…';
  });
}
