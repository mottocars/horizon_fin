const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const env = require('../../config/env');
const espiaoService = require('./espiao.service');

const SCRIPT_PATH = path.join(__dirname, 'gerar_documento_fiscal.py');
const LOGO_PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'logo.png'));

const AZUL = rgb(0.114, 0.306, 0.847); // #1d4ed8
const CINZA = rgb(0.42, 0.447, 0.502); // #6b7280

// Gera o DANFE (NF-e) ou DANFSe (NFS-e) "puro" (layout oficial ABNT, sem
// nenhuma marca nossa) via a lib Python brazilfiscalreport — rodada como
// subprocesso porque não existe equivalente Node com a mesma fidelidade.
function gerarDocumentoOficial(tipo, xml) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizonfin-danfe-'));
    const caminhoXml = path.join(dir, 'nota.xml');
    const caminhoPdf = path.join(dir, 'nota.pdf');
    fs.writeFileSync(caminhoXml, xml, 'utf8');

    const limpar = () => fs.rm(dir, { recursive: true, force: true }, () => {});

    const proc = spawn(env.pythonBin, [SCRIPT_PATH, tipo, caminhoXml, caminhoPdf]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      limpar();
      reject(err);
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        limpar();
        reject(new Error(`Falha ao gerar o documento fiscal oficial: ${stderr.trim() || `código ${code}`}`));
        return;
      }
      try {
        const pdfBytes = fs.readFileSync(caminhoPdf);
        limpar();
        resolve(pdfBytes);
      } catch (err) {
        limpar();
        reject(err);
      }
    });
  });
}

// Acrescenta uma faixa no TOPO de cada página do PDF oficial com a logo e o
// aviso "Esta nota foi gerada por Horizon Finanças" — a brazilfiscalreport
// não tem essa opção de cabeçalho (só um rodapé, e só pra NF-e), então
// fazemos isso por cima do PDF já pronto, igual pros dois tipos de nota.
async function adicionarCabecalhoHorizonFin(pdfBytesOriginal) {
  const origem = await PDFDocument.load(pdfBytesOriginal);
  const destino = await PDFDocument.create();
  const fonteBold = await destino.embedFont(StandardFonts.HelveticaBold);
  const fonteRegular = await destino.embedFont(StandardFonts.Helvetica);
  const logo = await destino.embedPng(LOGO_PNG);

  const ALTURA_FAIXA = 34;
  const paginasOrigem = origem.getPages();

  for (let i = 0; i < paginasOrigem.length; i += 1) {
    const paginaOrigem = paginasOrigem[i];
    const { width, height } = paginaOrigem.getSize();
    const [embutida] = await destino.embedPdf(origem, [i]);

    const novaPagina = destino.addPage([width, height + ALTURA_FAIXA]);
    novaPagina.drawPage(embutida, { x: 0, y: 0, width, height });

    // Faixa do cabeçalho.
    novaPagina.drawRectangle({
      x: 0,
      y: height,
      width,
      height: ALTURA_FAIXA,
      color: rgb(1, 1, 1),
    });
    novaPagina.drawLine({
      start: { x: 0, y: height },
      end: { x: width, y: height },
      thickness: 0.75,
      color: rgb(0.898, 0.906, 0.922), // #e5e7eb
    });

    const logoAltura = 22;
    const logoLargura = (logo.width / logo.height) * logoAltura;
    novaPagina.drawImage(logo, {
      x: 14,
      y: height + (ALTURA_FAIXA - logoAltura) / 2,
      width: logoLargura,
      height: logoAltura,
    });

    novaPagina.drawText('Esta nota foi gerada por Horizon Finanças', {
      x: 14 + logoLargura + 8,
      y: height + ALTURA_FAIXA / 2 + 3,
      size: 10,
      font: fonteBold,
      color: AZUL,
    });
    novaPagina.drawText('Documento informativo — não possui valor fiscal.', {
      x: 14 + logoLargura + 8,
      y: height + ALTURA_FAIXA / 2 - 9,
      size: 7.5,
      font: fonteRegular,
      color: CINZA,
    });
  }

  return destino.save();
}

// Gera o PDF final (documento oficial + cabeçalho Horizon Finanças) e
// devolve { bytes, nomeArquivo } — quem chamar escreve `bytes` na resposta.
async function gerarPdfNota(notaId) {
  const resultado = await espiaoService.getNotaComXml(notaId);
  if (!resultado) return null;
  const { nota, xml } = resultado;

  const pdfOficial = await gerarDocumentoOficial(nota.tipo, xml);
  const bytes = await adicionarCabecalhoHorizonFin(pdfOficial);

  return {
    bytes,
    nomeArquivo: `${nota.chave_acesso || 'nota'}.pdf`,
  };
}

module.exports = { gerarPdfNota };
