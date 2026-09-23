import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import RelatorioSaldosImpressao from './RelatorioSaldosImpressao';

const LARGURA_CONTAINER = 1160; // precisa bater com o width fixo de RelatorioSaldosImpressao.jsx
const LARGURA_PRIMEIRA_CONTAINER = 300; // precisa bater com LARGURA_PRIMEIRA de RelatorioSaldosImpressao.jsx
const PADDING_CONTAINER = 32; // precisa bater com o padding do container raiz de RelatorioSaldosImpressao.jsx
const MARGEM_PT = 18;

// Espera toda <img> dentro do container terminar de carregar (sucesso OU erro) — sem isso o
// html2canvas pode fotografar a logomarca do banco ainda em branco (a imagem vem de uma CDN
// externa, não é instantânea), ou capturar o ícone de imagem quebrada antes do fallback
// (onError) da conta re-renderizar. 5s de limite por imagem: uma CDN fora do ar não pode travar
// o relatório pra sempre.
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

// Acha, no CANVAS JÁ CAPTURADO, a linha (Y) de cada marcador magenta (ver MarcadorLinha em
// RelatorioSaldosImpressao.jsx — um <span> real no início de cada linha rastreada) —
// escaneando o canvas de verdade em vez de confiar numa medição separada do DOM
// (getBoundingClientRect). Motivo: testado e confirmado que o html2canvas renderiza numa cópia
// interna que pode ficar fora de sincronia com o DOM ao vivo — o bastante pra, medindo por
// fora, cortar o topo de uma linha mesmo com a conta batendo perfeitinho no papel. Escaneando o
// PRÓPRIO canvas que vai virar a imagem final, a origem de qualquer linha é sempre exata.
function escanearMarcadores(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const escalaCanvas = canvas.width / LARGURA_CONTAINER;
  // Faixa (não uma coluna só): o padding-esquerdo da própria linha varia (10px nas linhas de
  // grupo/total, 26px nas linhas de conta — pro ícone do banco), então o marcador não cai
  // sempre no mesmo x. PADDING_CONTAINER+8 a +38 cobre as duas folgas com margem.
  const xInicio = Math.round((PADDING_CONTAINER + 8) * escalaCanvas);
  const largura = Math.round(30 * escalaCanvas);
  const { data, width } = ctx.getImageData(xInicio, 0, largura, canvas.height);
  const marcadores = [];
  let emMarcador = false;
  for (let y = 0; y < canvas.height; y++) {
    let ehMagenta = false;
    for (let x = 0; x < width && !ehMagenta; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 230 && data[i + 1] < 40 && data[i + 2] > 230) ehMagenta = true;
    }
    if (ehMagenta && !emMarcador) marcadores.push(y);
    emMarcador = ehMagenta;
  }
  return marcadores;
}

// Apaga os marcadores do canvas depois de já saber onde eles estavam — sem isso, a listra
// magenta apareceria de verdade no PDF final. Sempre branco: é o fundo de quase toda linha do
// relatório (só o cabeçalho de grupo é cinza clarinho, uma diferença imperceptível numa faixa
// desse tamanho).
function apagarMarcadores(canvas, topos) {
  const ctx = canvas.getContext('2d');
  const escalaCanvas = canvas.width / LARGURA_CONTAINER;
  const xInicio = Math.round((PADDING_CONTAINER - 4) * escalaCanvas);
  const largura = Math.round((LARGURA_PRIMEIRA_CONTAINER + 4) * escalaCanvas);
  const altura = Math.round(14 * escalaCanvas); // bem mais que os 3px (container) do marcador, com folga generosa
  ctx.fillStyle = '#ffffff';
  for (const topo of topos) {
    const yInicioApagar = Math.max(0, topo - Math.round(2 * escalaCanvas));
    ctx.fillRect(xInicio, yInicioApagar, largura, altura);
  }
}

// Folga de segurança (px do canvas): a página SEGUINTE começa um pouco ANTES do topo
// detectado. Mesmo com o marcador certinho no topo de cada linha, sobravam uns pixels de
// conteúdo (ícone/texto) cortados na primeira linha da página seguinte (testado e visto no
// recorte várias vezes — provavelmente uma pequena diferença de métrica de fonte entre o DOM ao
// vivo e a renderização do html2canvas). Essa faixa de folga é sempre apagada (ver
// `apagarFolgaSobreposicao`) antes de virar página — ela nunca aparece de verdade, só garante
// que a linha real logo abaixo tenha uma margem de segurança acima dela em vez de ser cortada.
const FOLGA_QUEBRA_PX = 20;

// Calcula as REGIÕES de cada página (em px do canvas) de forma que NENHUMA linha seja cortada
// ao meio: cada página termina exatamente no topo de uma linha (nada de conteúdo depois disso é
// perdido), e a página seguinte começa um pouco antes desse mesmo ponto (folga de segurança).
// `corte` é o limite exato (sem folga) — a região entre `inicio` e `corte` é pura sobreposição
// com o fim da página anterior e precisa ser apagada antes de exportar (ver
// `apagarFolgaSobreposicao`), senão reaparece como uma tarja cortada/ilegível no topo da página
// nova. `alturaUtilPx` é quanto cabe por página, no espaço útil real do PDF (sem a folga).
function calcularPaginas(topos, alturaTotal, alturaUtilPx) {
  const linhas = topos.map((top, idx) => ({ top, bottom: idx + 1 < topos.length ? topos[idx + 1] : alturaTotal }));
  const fins = [];
  let inicioPagina = 0;
  for (const linha of linhas) {
    if (linha.bottom - inicioPagina > alturaUtilPx && linha.top > inicioPagina) {
      fins.push(linha.top);
      inicioPagina = linha.top;
    }
  }
  fins.push(alturaTotal);

  const paginas = [];
  let inicio = 0;
  let corteAnterior = null; // fim exato (sem folga) da página anterior — vira o `corte` desta página
  for (const fim of fins) {
    paginas.push({ inicio, fim, corte: corteAnterior });
    corteAnterior = fim;
    inicio = Math.max(0, fim - FOLGA_QUEBRA_PX);
  }
  return paginas;
}

// Recorta uma faixa horizontal de `canvasCheio` (coordenadas em px do PRÓPRIO canvas) pra um
// canvas novo, menor — usado pra separar 1 captura inteira em N páginas.
function recortarCanvas(canvasCheio, yInicioPx, alturaPx) {
  const recorte = document.createElement('canvas');
  recorte.width = canvasCheio.width;
  recorte.height = Math.round(alturaPx);
  const ctx = recorte.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, recorte.width, recorte.height);
  ctx.drawImage(canvasCheio, 0, yInicioPx, canvasCheio.width, alturaPx, 0, 0, recorte.width, recorte.height);
  return recorte;
}

// Apaga (em branco) a faixa de sobreposição no topo de uma página recortada — a folga de
// `calcularPaginas` existe só como margem de segurança de medição, mas fisicamente repete o
// fim (já mostrado por completo) da página anterior. Sem apagar, essa repetição aparece cortada
// pela borda do recorte — exatamente a "conta cortada ao meio" que o relatório não pode ter.
function apagarFolgaSobreposicao(pagina, inicioPx, cortePx) {
  const alturaFolga = Math.round(cortePx - inicioPx);
  if (alturaFolga <= 0) return;
  const ctx = pagina.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pagina.width, alturaFolga);
}

// Monta o RelatorioSaldosImpressao fora da tela (não some com display:none — o html2canvas
// precisa de layout de verdade —, só fica fora da área visível), fotografa o container INTEIRO
// uma única vez, escaneia esse canvas pelos marcadores de cada linha e recorta N páginas dele —
// cada quebra cai exatamente numa borda de linha real (nunca no meio dela).
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
    // do gráfico terminarem de pintar antes da captura, e do fallback de logo (onError) já ter
    // re-renderizado se alguma imagem falhou.
    await new Promise((r) => setTimeout(r, 150));

    const canvasHtml2canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    // Copia pra um canvas criado por nós antes de desenhar mais alguma coisa em cima: o canvas
    // que o html2canvas devolve, por algum motivo, ignora silenciosamente novos fillRect nele
    // (testado e confirmado — nem um retângulo sólido gigante aparecia depois) — provavelmente
    // alguma particularidade de como ele monta o canvas internamente. Um canvas 100% nosso não
    // tem esse problema.
    const canvasCheio = document.createElement('canvas');
    canvasCheio.width = canvasHtml2canvas.width;
    canvasCheio.height = canvasHtml2canvas.height;
    canvasCheio.getContext('2d').drawImage(canvasHtml2canvas, 0, 0);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidthPt = doc.internal.pageSize.getWidth();
    const pageHeightPt = doc.internal.pageSize.getHeight();
    const escalaCanvas = canvasCheio.width / LARGURA_CONTAINER; // px do container -> px do canvas
    const escalaPdf = (pageWidthPt - MARGEM_PT * 2) / LARGURA_CONTAINER; // px do container -> pt do PDF
    const alturaUtilCanvasPx = ((pageHeightPt - MARGEM_PT * 2) / escalaPdf) * escalaCanvas;

    const topos = escanearMarcadores(canvasCheio);
    apagarMarcadores(canvasCheio, topos);
    const paginas = calcularPaginas(topos, canvasCheio.height, alturaUtilCanvasPx);

    paginas.forEach(({ inicio, fim, corte }, i) => {
      const alturaRegiaoCanvasPx = fim - inicio;
      if (alturaRegiaoCanvasPx <= 0) return;

      const paginaCanvas = recortarCanvas(canvasCheio, inicio, alturaRegiaoCanvasPx);
      if (corte != null) apagarFolgaSobreposicao(paginaCanvas, inicio, corte);
      // JPEG (não PNG): o relatório é texto/bordas sobre fundo branco, então a perda de
      // qualidade é imperceptível e o arquivo fica bem menor — relevante já que um relatório
      // de várias páginas em PNG facilmente passa de dezenas de MB.
      const imgDados = paginaCanvas.toDataURL('image/jpeg', 0.92);
      const alturaImgPt = (alturaRegiaoCanvasPx / escalaCanvas) * escalaPdf;

      if (i > 0) doc.addPage();
      doc.addImage(imgDados, 'JPEG', MARGEM_PT, MARGEM_PT, pageWidthPt - MARGEM_PT * 2, alturaImgPt);
    });

    const nomeArquivo = `saldo-contas-bancarias_${dados.semanaArquivo || 'relatorio'}.pdf`;
    doc.save(nomeArquivo);
  } finally {
    root.unmount();
    container.remove();
  }
}
