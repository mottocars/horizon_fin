import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import RelatorioSaldosImpressao from './RelatorioSaldosImpressao';

// Espera toda <img> dentro do container terminar de carregar (sucesso OU erro) — sem isso o
// html2canvas pode fotografar a logomarca do banco ainda em branco (a imagem vem de uma CDN
// externa, não é instantânea). 5s de limite por imagem: uma CDN fora do ar não pode travar o
// relatório pra sempre — a imagem só fica faltando, o fallback visual (código do banco) nem
// entra em jogo aqui porque já foi decidido em qual estado renderizar antes de montar.
function esperarImagens(container) {
  const imagens = [...container.querySelectorAll('img')];
  return Promise.all(
    imagens.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve();
          const limite = setTimeout(resolve, 5000);
          img.addEventListener('load', () => { clearTimeout(limite); resolve(); }, { once: true });
          img.addEventListener('error', () => { clearTimeout(limite); resolve(); }, { once: true });
        })
    )
  );
}

// Monta o RelatorioSaldosImpressao fora da tela (não some com display:none — o html2canvas
// precisa de layout de verdade —, só fica fora da área visível), fotografa com html2canvas e
// monta um PDF paginado (A4 paisagem) com jsPDF. Devolve depois de disparar o download.
export async function gerarRelatorioSaldosPdf(dados) {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-10000px';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    flushSync(() => root.render(<RelatorioSaldosImpressao {...dados} />));
    await esperarImagens(container);
    // Uma folga curta depois das imagens: dá tempo da fonte (Inter, se disponível) e do SVG
    // do gráfico terminarem de pintar antes da captura.
    await new Promise((r) => setTimeout(r, 150));

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pdfLargura = doc.internal.pageSize.getWidth();
    const pdfAltura = doc.internal.pageSize.getHeight();
    const imgLargura = pdfLargura;
    const imgAltura = (canvas.height * imgLargura) / canvas.width;
    const imgDados = canvas.toDataURL('image/png');

    let restante = imgAltura;
    let posicao = 0;
    doc.addImage(imgDados, 'PNG', 0, posicao, imgLargura, imgAltura);
    restante -= pdfAltura;
    while (restante > 0) {
      posicao = restante - imgAltura;
      doc.addPage();
      doc.addImage(imgDados, 'PNG', 0, posicao, imgLargura, imgAltura);
      restante -= pdfAltura;
    }

    const nomeArquivo = `saldo-contas-bancarias_${dados.semanaArquivo || 'relatorio'}.pdf`;
    doc.save(nomeArquivo);
  } finally {
    root.unmount();
    container.remove();
  }
}
