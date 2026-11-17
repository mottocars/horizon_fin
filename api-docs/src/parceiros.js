// Formulário "Quero ser um Parceiro" (api.horizonhub.com.br/parceiros/).
// 1. Envia os dados → o Horizon manda um código de 6 números por WhatsApp (Comunicação Oficial).
// 2. Código certo → a solicitação vai para aprovação em Cadastros › Parceiros.
// Backend: backend/src/modules/parceiros/parceiros.publico.js (rotas /v1/parceiros/solicitacoes...).

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:3001/api/v1' : '/v1');

// Mesmas regras do backend (parceiros/verificacoes.js → LOGO).
const LOGO = { maxBytes: 500 * 1024, minLado: 128, maxLado: 1024 };

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const formParceiro = $('#form-parceiro');
const formCodigo = $('#form-codigo');
let logoDataUri = '';
let solicitacao = '';
let relogio = null;

// ───────────────────────── utilitários ─────────────────────────

async function chamar(caminho, corpo) {
  try {
    const r = await fetch(`${API_BASE}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.includes('json') ? await r.json() : null;
    if (!r.ok) {
      const erro = dados?.error || {};
      return {
        erro: erro.mensagem || (r.status === 413 ? 'Os dados enviados são grandes demais (confira a logomarca).' : 'Não foi possível enviar. Tente de novo.'),
        campo: erro.detalhes?.campo,
      };
    }
    return { dados };
  } catch {
    return { erro: 'Sem conexão com o Horizon. Confira sua internet e tente de novo.' };
  }
}

function limparErros(form) {
  $$('[data-erro]', form).forEach((p) => {
    p.textContent = '';
    p.classList.add('hidden');
  });
  $$('.campo', form).forEach((c) => c.classList.remove('border-red-300'));
}

function mostrarErro(form, campo, mensagem, caixaGeral) {
  const alvo = campo && $(`[data-erro="${campo}"]`, form);
  if (alvo) {
    alvo.textContent = mensagem;
    alvo.classList.remove('hidden');
    const entrada = $(`#${campo}`, form);
    entrada?.classList.add('border-red-300');
    (campo === 'logo' ? $('#area-logo') : entrada)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (campo !== 'logo') entrada?.focus({ preventScroll: true });
    return;
  }
  caixaGeral.textContent = mensagem;
  caixaGeral.classList.remove('hidden');
  caixaGeral.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function esconder(el) {
  el.textContent = '';
  el.classList.add('hidden');
}

// ───────────────────────── campos ─────────────────────────

function contador(idCampo, idContador, max) {
  const campo = $(`#${idCampo}`);
  const atualizar = () => {
    const n = campo.value.length;
    $(`#${idContador}`).textContent = `${n}/${max}`;
    $(`#${idContador}`).classList.toggle('text-amber-600', n >= max);
  };
  campo.addEventListener('input', atualizar);
  atualizar();
}

// (31) 99999-9999 enquanto digita.
function mascaraTelefone(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function lerArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Quanto da borda da imagem é transparente (o "fundo") — só um aviso, quem decide é a aprovação.
function bordaTransparente(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  let transparentes = 0;
  const olhar = (x, y) => {
    total += 1;
    if (data[(y * width + x) * 4 + 3] < 32) transparentes += 1;
  };
  for (let x = 0; x < width; x += 1) {
    olhar(x, 0);
    olhar(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    olhar(0, y);
    olhar(width - 1, y);
  }
  return total ? transparentes / total : 0;
}

async function escolherLogo(arquivo) {
  const erro = $('[data-erro="logo"]');
  const aviso = $('#aviso-logo');
  const info = $('#info-logo');
  esconder(erro);
  esconder(aviso);
  esconder(info);
  logoDataUri = '';
  $('#previa-logo').classList.add('hidden');
  $('#icone-logo').classList.remove('hidden');
  $('#area-logo').classList.remove('bg-xadrez');
  if (!arquivo) return;

  const falhar = (mensagem) => {
    erro.textContent = mensagem;
    erro.classList.remove('hidden');
  };
  if (arquivo.type !== 'image/png') return falhar('Envie um arquivo PNG (com fundo transparente).');
  if (arquivo.size > LOGO.maxBytes) return falhar(`O arquivo tem ${Math.round(arquivo.size / 1024)} KB. O limite é 500 KB.`);
  let dataUri;
  let img;
  try {
    dataUri = await lerArquivo(arquivo);
    img = await carregarImagem(dataUri);
  } catch {
    return falhar('Não foi possível ler a imagem. Confira o arquivo.');
  }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w < LOGO.minLado || h < LOGO.minLado || w > LOGO.maxLado || h > LOGO.maxLado) {
    return falhar(`A imagem tem ${w}×${h} pixels. Precisa ter de ${LOGO.minLado} a ${LOGO.maxLado} pixels de largura e de altura.`);
  }

  logoDataUri = dataUri;
  $('#previa-logo').src = dataUri;
  $('#previa-logo').classList.remove('hidden');
  $('#icone-logo').classList.add('hidden');
  $('#area-logo').classList.add('bg-xadrez');
  info.textContent = `${arquivo.name} · ${w}×${h} px · ${Math.max(1, Math.round(arquivo.size / 1024))} KB`;
  info.classList.remove('hidden');
  try {
    if (bordaTransparente(img) < 0.5) {
      aviso.textContent = 'A logo parece não ter fundo transparente. Ela pode ser enviada assim, mas o ideal é o fundo transparente.';
      aviso.classList.remove('hidden');
    }
  } catch {
    /* sem canvas: a verificação fica para a aprovação */
  }
}

// ───────────────────────── passo 1: enviar ─────────────────────────

function validarLocal() {
  const v = (id) => $(`#${id}`).value.trim();
  if (v('nome').length < 3) return ['nome', 'Informe o nome do responsável técnico.'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return ['email', 'Informe um e-mail válido.'];
  const tel = v('telefone').replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) return ['telefone', 'Informe o celular com DDD, por exemplo (31) 99999-9999.'];
  if (v('appNome').length < 2) return ['appNome', 'Informe o nome do aplicativo.'];
  if (v('descricao').length < 20) return ['descricao', 'Descreva o aplicativo em pelo menos 20 caracteres.'];
  if (!logoDataUri) return ['logo', 'Envie a logomarca em PNG.'];
  for (const [id, rotulo] of [
    ['urlAbertura', 'URL de abertura'],
    ['urlCallback', 'URL de retorno (callback)'],
  ]) {
    let u;
    try {
      u = new URL(v(id));
    } catch {
      return [id, `Informe a ${rotulo} completa, começando com https://.`];
    }
    if (u.protocol !== 'https:') return [id, `A ${rotulo} precisa começar com https://.`];
  }
  return null;
}

async function enviar(e) {
  e.preventDefault();
  limparErros(formParceiro);
  esconder($('#erro-geral'));
  const problema = validarLocal();
  if (problema) return mostrarErro(formParceiro, problema[0], problema[1], $('#erro-geral'));

  const botao = $('#enviar');
  botao.disabled = true;
  botao.textContent = 'Enviando…';
  const v = (id) => $(`#${id}`).value.trim();
  const r = await chamar('/parceiros/solicitacoes', {
    responsavel: { nome: v('nome'), email: v('email'), telefone: v('telefone') },
    aplicativo: {
      nome: v('appNome'),
      descricao: v('descricao'),
      urlAbertura: v('urlAbertura'),
      urlCallback: v('urlCallback'),
      logo: logoDataUri,
    },
    website: $('#website').value,
  });
  botao.disabled = false;
  botao.textContent = 'Enviar e receber o código';
  if (r.erro) return mostrarErro(formParceiro, r.campo, r.erro, $('#erro-geral'));

  solicitacao = r.dados.solicitacao;
  $('#telefone-mascarado').textContent = r.dados.telefone;
  $('#validade-codigo').textContent = r.dados.validadeMinutos;
  formParceiro.classList.add('hidden');
  formCodigo.classList.remove('hidden');
  limparErros(formCodigo);
  esconder($('#erro-codigo-geral'));
  esconder($('#aviso-reenvio'));
  $('#codigo').value = '';
  iniciarRelogio(r.dados.reenviarEmSegundos);
  formCodigo.scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('#codigo').focus({ preventScroll: true });
}

// ───────────────────────── passo 2: código ─────────────────────────

function iniciarRelogio(segundos) {
  clearInterval(relogio);
  const botao = $('#reenviar');
  let restam = segundos;
  const tic = () => {
    botao.disabled = restam > 0;
    botao.textContent = restam > 0 ? `Reenviar código (${restam}s)` : 'Reenviar código';
    restam -= 1;
    if (restam < -1) clearInterval(relogio);
  };
  tic();
  relogio = setInterval(tic, 1000);
}

async function confirmar(e) {
  e.preventDefault();
  limparErros(formCodigo);
  esconder($('#erro-codigo-geral'));
  esconder($('#aviso-reenvio'));
  const codigo = $('#codigo').value.replace(/\D/g, '');
  if (codigo.length !== 6) return mostrarErro(formCodigo, 'codigo', 'Digite os 6 números do código.', $('#erro-codigo-geral'));

  const botao = $('#confirmar');
  botao.disabled = true;
  const r = await chamar('/parceiros/solicitacoes/confirmar', { solicitacao, codigo });
  botao.disabled = false;
  if (r.erro) return mostrarErro(formCodigo, r.campo, r.erro, $('#erro-codigo-geral'));

  clearInterval(relogio);
  $('#protocolo').textContent = `nº ${r.dados.protocolo}`;
  formCodigo.classList.add('hidden');
  $('#enviado').classList.remove('hidden');
  $('#enviado').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

async function reenviar() {
  limparErros(formCodigo);
  esconder($('#erro-codigo-geral'));
  esconder($('#aviso-reenvio'));
  $('#reenviar').disabled = true;
  const r = await chamar('/parceiros/solicitacoes/reenviar-codigo', { solicitacao });
  if (r.erro) {
    $('#reenviar').disabled = false;
    return mostrarErro(formCodigo, r.campo, r.erro, $('#erro-codigo-geral'));
  }
  $('#aviso-reenvio').textContent = `Novo código enviado para ${r.dados.telefone}.`;
  $('#aviso-reenvio').classList.remove('hidden');
  $('#codigo').value = '';
  $('#codigo').focus();
  iniciarRelogio(r.dados.reenviarEmSegundos);
}

// ───────────────────────── eventos ─────────────────────────

// Corrigiu o campo: o erro dele some.
$$('input, textarea').forEach((campo) =>
  campo.addEventListener('input', () => {
    const erro = $(`[data-erro="${campo.id}"]`);
    if (erro && !erro.classList.contains('hidden')) {
      esconder(erro);
      campo.classList.remove('border-red-300');
    }
  })
);
contador('appNome', 'contador-nome', 22);
contador('descricao', 'contador-descricao', 140);
$('#telefone').addEventListener('input', (e) => {
  e.target.value = mascaraTelefone(e.target.value);
});
$('#codigo').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
$('#logo').addEventListener('change', (e) => escolherLogo(e.target.files?.[0]));
formParceiro.addEventListener('submit', enviar);
formCodigo.addEventListener('submit', confirmar);
$('#reenviar').addEventListener('click', reenviar);
$('#corrigir').addEventListener('click', () => {
  clearInterval(relogio);
  formCodigo.classList.add('hidden');
  formParceiro.classList.remove('hidden');
  formParceiro.scrollIntoView({ block: 'start', behavior: 'smooth' });
});
