const { spawn } = require('child_process');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', '..', '..', 'scripts', 'parse_epr.py');
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

function parsePdf(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [SCRIPT_PATH, filePath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('error', (err) => {
      const e = new Error(
        `Não foi possível executar o interpretador Python (${PYTHON_BIN}). Verifique se Python e pdfplumber estão instalados no servidor.`
      );
      e.status = 500;
      e.expose = true;
      e.cause = err;
      reject(e);
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout) {
        const e = new Error(`Falha ao processar o PDF: ${stderr || 'erro desconhecido'}`);
        e.status = 500;
        e.expose = true;
        return reject(e);
      }

      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        const e = new Error('Resposta inválida do processador de PDF.');
        e.status = 500;
        e.expose = true;
        return reject(e);
      }

      if (data.erro) {
        const e = new Error(data.erro);
        e.status = 400;
        e.expose = true;
        return reject(e);
      }

      resolve(data);
    });
  });
}

module.exports = { parsePdf };
