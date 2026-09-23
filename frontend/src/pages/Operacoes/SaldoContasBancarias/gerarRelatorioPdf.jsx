import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import RelatorioSaldosImpressao from './RelatorioSaldosImpressao';

const LARGURA_CONTAINER = 1160; // precisa bater com o width fixo de RelatorioSaldosImpressao.jsx
const PADDING_CONTAINER = 32; // precisa bater com o padding do container raiz de RelatorioSaldosImpressao.jsx
const MARGEM_PT = 18;

// Espera toda <img> dentro do container terminar de carregar (sucesso OU erro) — sem isso o
// html2canvas pode fotografar a logomarca do cabeçalho ainda em branco. As logos de banco não
// usam mais <img> (ver MarcadorLogo/desenharLogos abaixo), então isso só cobre a logomarca fixa
// do topo do relatório.
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

// Esconde temporariamente todo o resto da página (a tela ao vivo por trás do relatório) durante
// a captura — html2canvas tem um bug de renderização (reproduzido com dados reais, não
// perfeitamente determinístico) que corrompe visualmente linhas de conta do relatório quando há
// bastante conteúdo — chega a acontecer mesmo com a tela ao vivo TOTALMENTE fora do elemento que
// está sendo fotografado. Junto com MarcadorLogo (evitar múltiplas <img> reais dentro do próprio
// relatório), isso reduz bastante a chance do bug aparecer; não achamos uma causa 100%
// determinística nem uma forma de detectar/repetir a captura quando ainda assim acontece.
function esconderRestoDaPagina(container) {
  const outros = [...document.body.children].filter((el) => el !== container);
  outros.forEach((el) => { el.style.display = 'none'; });
  return () => outros.forEach((el) => { el.style.display = ''; });
}

// Pré-carrega cada logo de banco ÚNICA usada no relatório (fora do DOM, com um Image() comum),
// pra desenhar por cima do canvas já capturado em vez de deixar o html2canvas renderizar a
// <img> ele mesmo — ver o comentário grande em MarcadorLogo (RelatorioSaldosImpressao.jsx) pra
// entender por quê. Falha de rede vira `undefined` no Map — a linha correspondente fica sem
// logo desenhada por cima (mas o quadradinho com borda já está lá, não é um buraco feio).
function preCarregarLogos(infoBancos) {
  const entradas = infoBancos ? [...infoBancos.entries()].filter(([, info]) => info?.logo) : [];
  return Promise.all(
    entradas.map(
      ([codigo, info]) =>
        new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const limite = setTimeout(() => resolve([codigo, undefined]), 5000);
          img.onload = () => { clearTimeout(limite); resolve([codigo, img]); };
          img.onerror = () => { clearTimeout(limite); resolve([codigo, undefined]); };
          img.src = info.logo;
        })
    )
  ).then((resultados) => new Map(resultados));
}

// Acha o canto superior-esquerdo de cada marcador CIANO (MarcadorLogo, dentro do quadradinho de
// cada linha de conta com logo) — escaneando uma faixa mais larga em x, já que precisamos da
// posição horizontal (não só vertical) pra saber onde desenhar cada logo.
function escanearMarcadoresLogo(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const escalaCanvas = canvas.width / LARGURA_CONTAINER;
  const xInicio = Math.round((PADDING_CONTAINER + 20) * escalaCanvas);
  const largura = Math.round(40 * escalaCanvas);
  const { data, width } = ctx.getImageData(xInicio, 0, largura, canvas.height);
  const marcadores = [];
  let emMarcador = false;
  for (let y = 0; y < canvas.height; y++) {
    let xEncontrado = -1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < 40 && data[i + 1] > 230 && data[i + 2] > 230) { xEncontrado = x; break; }
    }
    const ehMarcador = xEncontrado >= 0;
    if (ehMarcador && !emMarcador) marcadores.push({ x: xInicio + xEncontrado, y });
    emMarcador = ehMarcador;
  }
  return marcadores;
}

// Desenha cada logo de banco pré-carregada em cima do canvas já capturado, na posição de cada
// marcador ciano — na mesma ORDEM em que RelatorioSaldosImpressao.jsx desenha as linhas (grupo
// por grupo, conta por conta), que é a mesma ordem em que os marcadores aparecem de cima pra
// baixo no canvas. `9.5` (container px) é o centro do quadradinho de 22px (a marca fica no
// topo, centralizada — `justifyContent:center`+`alignSelf:flex-start` do MarcadorLogo); o ajuste
// pelo tamanho da logo centraliza os 16px dela dentro do quadradinho de 22px.
function desenharLogos(canvas, grupos, infoBancos, logosCarregadas) {
  const marcadores = escanearMarcadoresLogo(canvas);
  const escalaCanvas = canvas.width / LARGURA_CONTAINER;
  const ordemContas = grupos.flatMap((g) => g.contas).filter((c) => infoBancos?.get(c.banco_codigo)?.logo);
  if (ordemContas.length !== marcadores.length) return; // contagem bateu errado, mais seguro não desenhar nada errado no lugar errado
  const ctx = canvas.getContext('2d');
  const TAMANHO_LOGO = 16;
  ordemContas.forEach((conta, i) => {
    const img = logosCarregadas.get(conta.banco_codigo);
    if (!img) return;
    const { x, y } = marcadores[i];
    const desenhoX = x - Math.round((9.5 - (22 - TAMANHO_LOGO) / 2) * escalaCanvas);
    const desenhoY = y + Math.round(((22 - TAMANHO_LOGO) / 2) * escalaCanvas);
    ctx.drawImage(img, desenhoX, desenhoY, TAMANHO_LOGO * escalaCanvas, TAMANHO_LOGO * escalaCanvas);
  });
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

// Apaga os marcadores (magenta de linha + ciano de logo) do canvas depois de já usados — sem
// isso, as listras coloridas apareceriam de verdade no PDF final. Apaga PIXEL A PIXEL (troca
// cada pixel marcado por branco) em vez de um retângulo do tamanho da coluna inteira, pra nunca
// arriscar tocar conteúdo real que esteja coladinho perto do marcador.
function apagarMarcadores(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imagem = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imagem;
  for (let i = 0; i < data.length; i += 4) {
    const magenta = data[i] > 230 && data[i + 1] < 40 && data[i + 2] > 230;
    const ciano = data[i] < 40 && data[i + 1] > 230 && data[i + 2] > 230;
    if (magenta || ciano) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagem, 0, 0);
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
  const logosCarregadas = await preCarregarLogos(dados.infoBancos);

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

    const restaurarRestoDaPagina = esconderRestoDaPagina(container);
    await new Promise((r) => setTimeout(r, 100));
    let canvasHtml2canvas;
    try {
      canvasHtml2canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
    } finally {
      restaurarRestoDaPagina();
    }
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
    const paginas = calcularPaginas(topos, canvasCheio.height, alturaUtilCanvasPx);
    desenharLogos(canvasCheio, dados.grupos, dados.infoBancos, logosCarregadas);
    apagarMarcadores(canvasCheio);

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
