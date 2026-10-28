import { GRUPOS, ENDPOINTS, ERROS, CAMPOS_NOTA, STATUS_INTERNO } from './endpoints.js';

// Endereços. Produção: a página e a API no mesmo domínio (api.horizonhub.com.br, /v1 vai pro
// backend). Dev: backend local na 3001.
const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:3001/api/v1' : '/v1');
const URL_PUBLICA = import.meta.env.VITE_API_URL_PUBLICA || 'https://api.horizonhub.com.br/v1';
const APP_URL = import.meta.env.VITE_APP_URL || (import.meta.env.DEV ? 'http://localhost:5173' : 'https://financas.horizonhub.com.br');

// A chave digitada fica só nesta variável (memória da aba).
let chaveApi = '';

// ───────────────────────── utilitários ─────────────────────────

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function realcarJson(valor) {
  const texto = esc(typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2));
  return texto.replace(
    /(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, doisPontos, lit, num) => {
      if (str) return doisPontos ? `<span class="k">${str}</span>${doisPontos}` : `<span class="s">${str}</span>`;
      if (lit) return `<span class="b">${lit}</span>`;
      return `<span class="n">${num}</span>`;
    }
  );
}

function realcarCodigo(texto) {
  return esc(texto)
    .split('\n')
    .map((linha) =>
      /^\s*(#|\/\/)/.test(linha)
        ? `<span class="c">${linha}</span>`
        : linha.replace(/(&quot;.*?&quot;|'[^']*?'|`[^`]*?`)/g, '<span class="s">$1</span>')
    )
    .join('\n');
}

const ICONE_COPIAR =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICONE_OK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICONE_EXECUTAR =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z"/></svg>';

function lerPreferencia(chave, padrao) {
  try {
    return localStorage.getItem(chave) || padrao;
  } catch {
    return padrao;
  }
}
function gravarPreferencia(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra a escolha */
  }
}

// ───────────────────────── exemplos de código ─────────────────────────

const LINGUAGENS = [
  { id: 'curl', rotulo: 'cURL' },
  { id: 'js', rotulo: 'JavaScript' },
  { id: 'python', rotulo: 'Python' },
];
let linguagem = lerPreferencia('apiHorizon.linguagem', 'curl');

function caminhoExemplo(ep) {
  const caminho = ep.caminho.replace('{id}', String(ep.resposta?.id ?? 6692));
  return ep.exemploConsulta ? `${caminho}?${ep.exemploConsulta}` : caminho;
}

function exemplos(ep) {
  const url = `${URL_PUBLICA}${caminhoExemplo(ep)}`;
  if (ep.autenticacao === 'chave') {
    return {
      curl: `curl -X POST ${URL_PUBLICA}${ep.caminho} \\\n  -H "X-Api-Key: $HORIZON_API_KEY"`,
      js: `const resposta = await fetch('${URL_PUBLICA}${ep.caminho}', {\n  method: 'POST',\n  headers: { 'X-Api-Key': process.env.HORIZON_API_KEY },\n});\nconst { token } = await resposta.json();`,
      python: `import os, requests\n\nresposta = requests.post(\n    "${URL_PUBLICA}${ep.caminho}",\n    headers={"X-Api-Key": os.environ["HORIZON_API_KEY"]},\n)\ntoken = resposta.json()["token"]`,
    };
  }
  if (ep.metodo === 'PATCH') {
    const { motivo } = ep.exemploCorpo;
    return {
      curl: `curl -X PATCH "${url}" \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(ep.exemploCorpo)}'`,
      js: `const resposta = await fetch('${url}', {\n  method: 'PATCH',\n  headers: {\n    Authorization: \`Bearer \${token}\`,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({ motivo: '${motivo}' }),\n});\nconst nota = await resposta.json();`,
      python: `resposta = requests.patch(\n    "${url}",\n    headers={"Authorization": f"Bearer {token}"},\n    json={"motivo": "${motivo}"},\n)\nnota = resposta.json()`,
    };
  }
  const xml = ep.id === 'xml';
  return {
    curl: `curl "${url}" \\\n  -H "Authorization: Bearer $TOKEN"${xml ? ' \\\n  -o nota.xml' : ''}`,
    js: `const resposta = await fetch('${url}', {\n  headers: { Authorization: \`Bearer \${token}\` },\n});\nconst ${xml ? 'xml = await resposta.text()' : 'dados = await resposta.json()'};`,
    python: `resposta = requests.get(\n    "${url}",\n    headers={"Authorization": f"Bearer {token}"},\n)\n${xml ? 'xml = resposta.text' : 'dados = resposta.json()'}`,
  };
}

function painelCodigo({ titulo, abas, conteudo, html }) {
  const id = `c${Math.random().toString(36).slice(2, 9)}`;
  const cabecalho = abas
    ? `<div class="flex gap-1" role="tablist">${LINGUAGENS.map(
        (l) =>
          `<button type="button" role="tab" data-linguagem="${l.id}" class="aba-linguagem rounded-md px-2 py-1 text-[12px] font-medium transition-colors">${l.rotulo}</button>`
      ).join('')}</div>`
    : `<span class="text-[12px] font-medium text-slate-400">${esc(titulo)}</span>`;
  const corpos = abas
    ? LINGUAGENS.map(
        (l) => `<pre class="codigo p-4" data-codigo="${l.id}"${l.id === linguagem ? '' : ' hidden'}>${realcarCodigo(abas[l.id])}</pre>`
      ).join('')
    : `<pre class="codigo max-h-[420px] p-4">${html ?? esc(conteudo)}</pre>`;
  return `<div class="overflow-hidden rounded-card bg-codigo shadow-card" id="${id}">
    <div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
      ${cabecalho}
      <button type="button" class="copiar inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Copiar">${ICONE_COPIAR}<span>Copiar</span></button>
    </div>
    ${corpos}
  </div>`;
}

function atualizarAbasLinguagem() {
  $$('.aba-linguagem').forEach((b) => {
    const ativa = b.dataset.linguagem === linguagem;
    b.classList.toggle('bg-white/10', ativa);
    b.classList.toggle('text-white', ativa);
    b.classList.toggle('text-slate-400', !ativa);
    b.setAttribute('aria-selected', String(ativa));
  });
  $$('[data-codigo]').forEach((pre) => {
    pre.hidden = pre.dataset.codigo !== linguagem;
  });
}

// ───────────────────────── seções dos endpoints ─────────────────────────

const classeMetodo = (m) => `metodo metodo-${m.toLowerCase()}`;

function tabelaParametros(titulo, lista) {
  if (!lista?.length) return '';
  return `<h3 class="mt-6 text-[13px] font-semibold text-gray-900">${titulo}</h3>
    <div class="mt-2 overflow-x-auto"><table class="tabela"><tbody>
    ${lista
      .map(
        (p) => `<tr>
          <td><code class="font-mono text-[12.5px] font-medium text-gray-900">${p.nome}</code>
            <div class="mt-0.5 text-[11px] text-gray-400">${p.tipo || ''}</div></td>
          <td>${p.obrigatorio ? '<span class="mr-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-red-600">obrigatório</span>' : ''}${p.descricao}</td>
        </tr>`
      )
      .join('')}
    </tbody></table></div>`;
}

function tabelaCampos(campos) {
  return `<h3 class="mt-6 text-[13px] font-semibold text-gray-900">Resposta</h3>
    <div class="mt-2 overflow-x-auto"><table class="tabela"><tbody>
    ${campos
      .map(
        ([nome, tipo, desc]) => `<tr><td><code class="font-mono text-[12.5px] font-medium text-gray-900">${nome}</code>
          ${tipo ? `<div class="mt-0.5 text-[11px] text-gray-400">${tipo}</div>` : ''}</td><td>${desc}</td></tr>`
      )
      .join('')}
    </tbody></table></div>`;
}

function campoTeste(ep, c) {
  const id = `t-${ep.id}-${c.nome}`;
  const rotulo = `<label for="${id}" class="mb-1 block font-mono text-[12px] font-medium text-gray-700">${c.nome}${c.obrigatorio ? ' <span class="text-red-500">*</span>' : ''}</label>`;
  const valor = c.padrao ? c.padrao() : '';
  if (c.tipo === 'certificados') {
    return `<div class="sm:col-span-2">${rotulo}
      <div class="flex gap-2">
        <input id="${id}" name="${c.nome}" class="campo font-mono text-[13px]" placeholder="1,2,7" inputmode="numeric" />
        <button type="button" data-carregar-certificados class="shrink-0 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 hover:bg-gray-50">Buscar certificados</button>
      </div>
      <div data-lista-certificados class="mt-2 flex flex-wrap gap-2"></div>
    </div>`;
  }
  if (c.tipo === 'select') {
    return `<div>${rotulo}<select id="${id}" name="${c.nome}" class="campo">${c.opcoes
      .map((o) => `<option value="${o}">${o || '(todos)'}</option>`)
      .join('')}</select></div>`;
  }
  if (c.tipo === 'multi') {
    return `<div class="sm:col-span-2"><span class="mb-1 block font-mono text-[12px] font-medium text-gray-700">${c.nome}</span>
      <div class="flex flex-wrap gap-2">${c.opcoes
        .map(
          (o) => `<label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 has-checked:border-primary-500 has-checked:bg-primary-50 has-checked:text-primary-700">
            <input type="checkbox" name="${c.nome}" value="${o}" class="h-3.5 w-3.5 accent-primary-600" />${o}</label>`
        )
        .join('')}</div></div>`;
  }
  if (c.tipo === 'textarea') {
    return `<div class="sm:col-span-2">${rotulo}<textarea id="${id}" name="${c.nome}" rows="2" maxlength="500" class="campo" placeholder="${esc(c.placeholder || '')}"></textarea></div>`;
  }
  return `<div>${rotulo}<input id="${id}" name="${c.nome}" type="${c.tipo}" value="${esc(valor)}" class="campo ${c.tipo === 'text' ? 'font-mono text-[13px]' : ''}" placeholder="${esc(c.placeholder || '')}" ${c.tipo === 'number' ? 'min="1"' : ''} /></div>`;
}

function painelTeste(ep) {
  const campos = ep.teste.campos;
  return `<form class="mt-6 rounded-lg border border-gray-200 bg-gray-50/70 p-4" data-teste="${ep.id}" novalidate>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[13px] font-semibold text-gray-900">Testar</p>
      <p class="text-[12px] text-gray-400">Gera um token novo e chama <span class="font-mono">${ep.metodo} ${ep.caminho}</span></p>
    </div>
    ${campos.length ? `<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">${campos.map((c) => campoTeste(ep, c)).join('')}</div>` : ''}
    ${
      ep.teste.confirmacao
        ? `<label class="mt-3 flex items-start gap-2 text-[13px] text-amber-800"><input type="checkbox" name="__confirmacao" class="mt-0.5 h-4 w-4 accent-amber-600" />${esc(ep.teste.confirmacao)}</label>`
        : ''
    }
    <div class="mt-3 flex items-center gap-3">
      <button type="submit" class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">${ICONE_EXECUTAR}Executar</button>
      <span data-aviso class="text-[13px] text-red-600"></span>
    </div>
    <div data-resultado class="mt-4 hidden space-y-3"></div>
  </form>`;
}

function secaoEndpoint(ep) {
  const resposta = ep.respostaTexto
    ? painelCodigo({ titulo: 'Resposta 200 · application/xml', conteudo: ep.respostaTexto })
    : painelCodigo({ titulo: 'Resposta 200', html: realcarJson(ep.resposta) });
  const escopo = ep.escopo
    ? `<span class="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700">escopo ${ep.escopo}</span>`
    : '';
  const autenticacao =
    ep.autenticacao === 'chave'
      ? '<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">X-Api-Key</span>'
      : '<span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Bearer token</span>';
  return `<section id="ep-${ep.id}" class="rounded-card bg-white p-6 shadow-card sm:p-8">
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="${classeMetodo(ep.metodo)}">${ep.metodo}</span>
          <code class="break-all font-mono text-[14px] font-medium text-gray-900">/v1${ep.caminho}</code>
        </div>
        <h2 class="mt-3 text-lg font-semibold text-gray-900">${ep.titulo}</h2>
        <div class="mt-2 flex flex-wrap gap-1.5">${autenticacao}${escopo}</div>
        <div class="prosa mt-3">${ep.descricao.map((p) => `<p>${p}</p>`).join('')}</div>
        ${tabelaParametros('Cabeçalhos', ep.cabecalhos)}
        ${tabelaParametros('Parâmetros do caminho', ep.parametrosCaminho)}
        ${tabelaParametros('Parâmetros da URL', ep.parametros)}
        ${tabelaParametros('Corpo (JSON)', ep.corpo)}
        ${ep.camposResposta ? tabelaCampos(ep.camposResposta) : ''}
        <p class="mt-5 text-[12px] leading-5 text-gray-400">Erros: ${ep.erros
          .map((c) => `<a href="#erros" class="font-mono text-gray-500 hover:text-primary-600">${c}</a>`)
          .join(' · ')}</p>
      </div>
      <div class="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        ${painelCodigo({ abas: exemplos(ep) })}
        ${resposta}
      </div>
    </div>
    ${painelTeste(ep)}
  </section>`;
}

// ───────────────────────── execução dos testes ─────────────────────────

function chipStatus(status) {
  const cor = status < 300 ? 'bg-emerald-50 text-emerald-700' : status < 500 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
  return `<span class="rounded-full px-2 py-0.5 font-mono text-[11.5px] font-semibold ${cor}">${status || 'falhou'}</span>`;
}

async function chamar(metodo, caminho, { headers = {}, corpo } = {}) {
  const inicio = performance.now();
  const opcoes = { method: metodo, headers: { ...headers } };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  try {
    const r = await fetch(`${API_BASE}${caminho}`, opcoes);
    const tipo = r.headers.get('content-type') || '';
    const corpoResposta = tipo.includes('json') ? await r.json() : await r.text();
    return {
      metodo,
      caminho,
      status: r.status,
      ms: Math.round(performance.now() - inicio),
      tipo,
      corpo: corpoResposta,
      limite: r.headers.get('ratelimit'),
    };
  } catch (err) {
    return { metodo, caminho, status: 0, ms: Math.round(performance.now() - inicio), corpo: { error: { codigo: 'SEM_CONEXAO', mensagem: `Não foi possível chamar a API (${err.message}).` } } };
  }
}

async function gerarToken() {
  return chamar('POST', '/auth/token', { headers: { 'X-Api-Key': chaveApi } });
}

function linhaPasso(passo, extra = '') {
  return `<div class="flex flex-wrap items-center gap-2 text-[13px]">
    <span class="${classeMetodo(passo.metodo)}">${passo.metodo}</span>
    <code class="break-all font-mono text-[12.5px] text-gray-700">/v1${esc(passo.caminho)}</code>
    ${chipStatus(passo.status)}
    <span class="text-[12px] text-gray-400">${passo.ms} ms</span>
    ${extra}
  </div>`;
}

function mostrarResultado(form, passos) {
  const caixa = $('[data-resultado]', form);
  const ultimo = passos[passos.length - 1];
  const linhas = passos
    .map((p, i) => {
      if (i < passos.length - 1 && p.status === 200 && p.corpo?.token) {
        const t = p.corpo.token;
        return linhaPasso(p, `<span class="text-[12px] text-gray-500">token <code class="font-mono">${esc(t.slice(0, 12))}…</code> válido por 15 min</span>
          <button type="button" class="copiar-token text-[12px] font-medium text-primary-600 hover:text-primary-700" data-token="${esc(t)}">copiar token</button>`);
      }
      return linhaPasso(p, p.limite ? `<span class="text-[11.5px] text-gray-400" title="Cabeçalho RateLimit">RateLimit: ${esc(p.limite)}</span>` : '');
    })
    .join('');

  let corpo;
  if (typeof ultimo.corpo === 'string') {
    const trecho = ultimo.corpo.length > 60000 ? `${ultimo.corpo.slice(0, 60000)}\n…` : ultimo.corpo;
    corpo = painelCodigo({ titulo: `${ultimo.tipo || 'texto'} · ${ultimo.corpo.length.toLocaleString('pt-BR')} caracteres`, conteudo: trecho });
  } else {
    corpo = painelCodigo({ titulo: 'Resposta', html: realcarJson(ultimo.corpo) });
  }
  const baixar =
    typeof ultimo.corpo === 'string' && ultimo.status === 200
      ? `<button type="button" class="baixar-xml text-[13px] font-medium text-primary-600 hover:text-primary-700">Baixar XML</button>`
      : '';
  caixa.innerHTML = `<div class="space-y-2 rounded-lg border border-gray-200 bg-white p-3">${linhas}</div>${corpo}${baixar}`;
  caixa.classList.remove('hidden');
  if (baixar) {
    $('.baixar-xml', caixa).addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([ultimo.corpo], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `nota-${ultimo.caminho.split('/')[2]}.xml`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
}

function lerFormulario(ep, form) {
  const dados = new FormData(form);
  const consulta = new URLSearchParams();
  let caminho = ep.caminho;
  let corpo;
  for (const c of ep.teste.campos) {
    const valores = dados.getAll(c.nome).map((v) => String(v).trim()).filter(Boolean);
    if (c.obrigatorio && !valores.length) return { erro: `Preencha ${c.nome}.` };
    if (!valores.length) continue;
    if (c.caminho) caminho = caminho.replace('{id}', encodeURIComponent(valores[0]));
    else if (c.corpo) corpo = { ...(corpo || {}), [c.nome]: valores[0] };
    else consulta.set(c.nome, valores.join(','));
  }
  if (ep.teste.confirmacao && !dados.get('__confirmacao')) return { erro: 'Marque a confirmação antes de executar.' };
  const qs = consulta.toString().replace(/%2C/g, ',');
  return { caminho: qs ? `${caminho}?${qs}` : caminho, corpo };
}

function exigirChave(form) {
  if (chaveApi) return true;
  $('[data-aviso]', form).textContent = 'Informe sua chave de API no quadro "Testar nesta página".';
  $('#campo-chave').focus({ preventScroll: true });
  $('#testar').scrollIntoView({ block: 'center' });
  return false;
}

async function executar(ep, form) {
  const aviso = $('[data-aviso]', form);
  aviso.textContent = '';
  if (!exigirChave(form)) return;
  const pedido = ep.id === 'auth-token' ? { caminho: '/auth/token' } : lerFormulario(ep, form);
  if (pedido.erro) {
    aviso.textContent = pedido.erro;
    return;
  }
  const botao = $('button[type="submit"]', form);
  botao.disabled = true;
  try {
    const token = await gerarToken();
    if (ep.id === 'auth-token' || token.status !== 200) {
      mostrarResultado(form, [token]);
      return;
    }
    const resposta = await chamar(ep.metodo, pedido.caminho, {
      headers: { Authorization: `Bearer ${token.corpo.token}` },
      corpo: pedido.corpo,
    });
    mostrarResultado(form, [token, resposta]);
  } finally {
    botao.disabled = false;
  }
}

async function carregarCertificados(form) {
  const aviso = $('[data-aviso]', form);
  aviso.textContent = '';
  if (!exigirChave(form)) return;
  const lista = $('[data-lista-certificados]', form);
  lista.innerHTML = '<span class="text-[13px] text-gray-400">Buscando…</span>';
  const token = await gerarToken();
  const r = token.status === 200 ? await chamar('GET', '/certificados', { headers: { Authorization: `Bearer ${token.corpo.token}` } }) : token;
  if (r.status !== 200) {
    lista.innerHTML = '';
    aviso.textContent = r.corpo?.error?.mensagem || 'Não foi possível buscar os certificados.';
    return;
  }
  const campo = $('input[name="certificadoIds"]', form);
  const marcados = new Set(campo.value.split(',').map((s) => s.trim()).filter(Boolean));
  if (!marcados.size) r.corpo.items.forEach((c) => marcados.add(String(c.id)));
  campo.value = [...marcados].join(',');
  lista.innerHTML = r.corpo.items
    .map(
      (c) => `<label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] text-gray-700 has-checked:border-primary-500 has-checked:bg-primary-50 has-checked:text-primary-700">
        <input type="checkbox" value="${c.id}" class="h-3.5 w-3.5 accent-primary-600" ${marcados.has(String(c.id)) ? 'checked' : ''} />
        <span><span class="font-mono">${c.id}</span> · ${esc(c.nome)}</span></label>`
    )
    .join('');
  $$('input[type="checkbox"]', lista).forEach((cb) =>
    cb.addEventListener('change', () => {
      campo.value = $$('input[type="checkbox"]:checked', lista)
        .map((x) => x.value)
        .join(',');
    })
  );
}

// ───────────────────────── montagem da página ─────────────────────────

function montar() {
  $$('[data-url-base]').forEach((el) => (el.textContent = URL_PUBLICA));
  $$('[data-app-link]').forEach((a) => (a.href = `${APP_URL}${a.dataset.appLink}`));

  const doGrupo = (g) => ENDPOINTS.filter((ep) => ep.grupo === g.id);
  const linkEndpoint = (ep) =>
    `<a class="nav-link" href="#ep-${ep.id}"><span class="${classeMetodo(ep.metodo)} min-w-11!">${ep.metodo}</span><span class="truncate">${ep.titulo}</span></a>`;
  $('#menu-grupos').innerHTML = GRUPOS.map(
    (g) => `<p class="mt-4 px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">${g.titulo}</p>
      ${g.tela ? `<a class="nav-link" href="#grupo-${g.id}">Visão geral</a>` : ''}
      ${doGrupo(g).map(linkEndpoint).join('')}
      ${(g.referencias || []).map(([id, titulo]) => `<a class="nav-link" href="#${id}">${titulo}</a>`).join('')}`
  ).join('');

  // Grupos com tela própria aparecem na introdução (Autenticação vale para todos).
  $('#lista-grupos').innerHTML = GRUPOS.filter((g) => g.tela)
    .map(
      (g) => `<a href="#grupo-${g.id}" class="group block rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary-200 hover:bg-primary-50/40">
        <span class="flex items-center justify-between gap-2">
          <span class="text-[14px] font-semibold text-gray-900 group-hover:text-primary-700">${g.titulo}</span>
          <span class="text-[12px] text-gray-400">${doGrupo(g).length} endpoints</span>
        </span>
        <span class="mt-1 block text-[13px] leading-5 text-gray-500">${g.descricao[0]}</span>
        <span class="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Exige a tela ${g.tela}</span>
      </a>`
    )
    .join('');

  $('#grupos').innerHTML = GRUPOS.map((g) => {
    const cabecalho = g.tela
      ? `<section id="grupo-${g.id}" class="rounded-card bg-white p-5 shadow-card sm:p-8">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-primary-600">Grupo</p>
          <h2 class="mt-1 text-xl font-semibold text-gray-900">${g.titulo}</h2>
          <div class="prosa mt-2 max-w-4xl">${g.descricao.map((p) => `<p>${p}</p>`).join('')}</div>
          <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div class="rounded-lg bg-gray-50 px-4 py-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Liberação na chave</p>
              <p class="mt-1 text-[13px] text-gray-900">Marque <strong>${g.titulo}</strong> em Integrações › API Horizon</p>
            </div>
            <div class="rounded-lg bg-gray-50 px-4 py-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tela exigida do dono da chave</p>
              <p class="mt-1 text-[13px] text-gray-900">${g.tela}</p>
            </div>
            <div class="rounded-lg bg-gray-50 px-4 py-3">
              <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Permissões de escrita</p>
              ${(g.escopos || [])
                .map(([codigo, nome, desc]) => `<p class="mt-1 text-[13px] text-gray-900">${nome} <code class="ic">${codigo}</code><span class="block text-[12px] text-gray-500">${esc(desc)}</span></p>`)
                .join('') || '<p class="mt-1 text-[13px] text-gray-500">Nenhuma — só leitura.</p>'}
            </div>
          </div>
        </section>`
      : '';
    return `<div class="space-y-6" data-bloco-grupo="${g.id}">${cabecalho}${doGrupo(g).map(secaoEndpoint).join('')}</div>`;
  }).join('');
  // Seções fixas de referência de um grupo (index.html, data-grupo) vão para o fim do bloco dele.
  $$('main > section[data-grupo]').forEach((s) => $(`[data-bloco-grupo="${s.dataset.grupo}"]`)?.append(s));

  const token = ENDPOINTS.find((e) => e.id === 'auth-token');
  const certificados = ENDPOINTS.find((e) => e.id === 'certificados');
  const notas = ENDPOINTS.find((e) => e.id === 'notas');
  $('[data-exemplo="passo-token"]').innerHTML = painelCodigo({ abas: exemplos(token) });
  $('[data-exemplo="passo-consulta"]').innerHTML = painelCodigo({
    abas: {
      curl: `${exemplos(certificados).curl}\n\n${exemplos(notas).curl}`,
      js: `${exemplos(notas).js}\nconsole.log(dados.pagination.total, 'notas');`,
      python: `${exemplos(notas).python}\nprint(dados["pagination"]["total"], "notas")`,
    },
  });
  $('[data-exemplo="incremental"]').innerHTML = painelCodigo({
    abas: {
      curl: `# 1ª rodada: tudo do período\ncurl "${URL_PUBLICA}/notas-fiscais?certificadoIds=1,2,7&dataEmissaoInicio=2026-01-01&dataEmissaoFim=2026-12-31" \\\n  -H "Authorization: Bearer $TOKEN"\n\n# Próximas: só o que mudou desde o início da rodada anterior\ncurl "${URL_PUBLICA}/notas-fiscais?certificadoIds=1,2,7&dataEmissaoInicio=2026-01-01&dataEmissaoFim=2026-12-31&atualizadoDesde=2026-10-28T03:00:00-03:00" \\\n  -H "Authorization: Bearer $TOKEN"`,
      js: `// Guarde o início da rodada ANTES de consultar\nconst inicioRodada = new Date().toISOString();\nconst params = new URLSearchParams({\n  certificadoIds: '1,2,7',\n  dataEmissaoInicio: '2026-01-01',\n  dataEmissaoFim: '2026-12-31',\n  pageSize: '500',\n});\nif (ultimaRodada) params.set('atualizadoDesde', ultimaRodada);\n\nfor (let page = 1; ; page++) {\n  params.set('page', String(page));\n  const r = await fetch(\`${URL_PUBLICA}/notas-fiscais?\${params}\`, {\n    headers: { Authorization: \`Bearer \${token}\` },\n  });\n  const { items, pagination } = await r.json();\n  processar(items);\n  if (page >= pagination.totalPages) break;\n}\nultimaRodada = inicioRodada;`,
      python: `# Guarde o início da rodada ANTES de consultar\ninicio_rodada = datetime.now(timezone.utc).isoformat()\nparams = {\n    "certificadoIds": "1,2,7",\n    "dataEmissaoInicio": "2026-01-01",\n    "dataEmissaoFim": "2026-12-31",\n    "pageSize": 500,\n}\nif ultima_rodada:\n    params["atualizadoDesde"] = ultima_rodada\n\npage = 1\nwhile True:\n    params["page"] = page\n    r = requests.get("${URL_PUBLICA}/notas-fiscais", params=params,\n                     headers={"Authorization": f"Bearer {token}"})\n    dados = r.json()\n    processar(dados["items"])\n    if page >= dados["pagination"]["totalPages"]:\n        break\n    page += 1\nultima_rodada = inicio_rodada`,
    },
  });
  $('[data-exemplo="erro"]').innerHTML = painelCodigo({
    titulo: 'HTTP 400',
    html: realcarJson({ error: { codigo: 'PARAMETRO_INVALIDO', mensagem: 'O período de emissão pode ter no máximo 366 dias.' } }),
  });

  $('#tabela-nota').innerHTML = `<thead><tr><th>Campo</th><th>Tipo</th><th>Descrição</th></tr></thead><tbody>${CAMPOS_NOTA.map(
    ([n, t, d]) => `<tr><td><code class="font-mono text-[12.5px] font-medium text-gray-900">${n}</code></td><td class="whitespace-nowrap text-gray-400">${t}</td><td>${d}</td></tr>`
  ).join('')}</tbody>`;
  $('#tabela-status').innerHTML = `<tbody>${STATUS_INTERNO.map(
    ([n, d]) => `<tr><td><code class="font-mono text-[12.5px] font-medium text-gray-900">${n}</code></td><td>${d}</td></tr>`
  ).join('')}</tbody>`;
  const tabelaErros = (titulo, lista) =>
    lista.length
      ? `<h3 class="mt-6 text-[13px] font-semibold text-gray-900">${titulo}</h3>
        <div class="mt-2 overflow-x-auto"><table class="tabela"><thead><tr><th>HTTP</th><th>codigo</th><th>Quando</th></tr></thead><tbody>${lista
          .map(([st, c, d]) => `<tr><td>${chipStatus(st)}</td><td><code class="font-mono text-[12.5px] font-medium text-gray-900">${c}</code></td><td>${d}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '';
  $('#tabelas-erros').innerHTML = [
    tabelaErros('Gerais', ERROS.filter((e) => !e[3])),
    ...GRUPOS.map((g) => tabelaErros(g.titulo, ERROS.filter((e) => e[3] === g.id))),
  ].join('');

  atualizarAbasLinguagem();
}

function ligarEventos() {
  document.addEventListener('click', async (e) => {
    const aba = e.target.closest('.aba-linguagem');
    if (aba) {
      linguagem = aba.dataset.linguagem;
      gravarPreferencia('apiHorizon.linguagem', linguagem);
      atualizarAbasLinguagem();
      return;
    }
    const copiar = e.target.closest('.copiar, .copiar-token');
    if (copiar) {
      const texto = copiar.dataset.token || $('pre:not([hidden])', copiar.closest('.rounded-card'))?.textContent || '';
      try {
        await navigator.clipboard.writeText(texto);
        const antes = copiar.innerHTML;
        copiar.innerHTML = copiar.classList.contains('copiar') ? `${ICONE_OK}<span>Copiado</span>` : 'copiado';
        setTimeout(() => (copiar.innerHTML = antes), 1500);
      } catch {
        /* sem permissão de área de transferência: o usuário seleciona e copia */
      }
      return;
    }
    const buscar = e.target.closest('[data-carregar-certificados]');
    if (buscar) carregarCertificados(buscar.closest('form'));
  });

  $$('form[data-teste]').forEach((form) => {
    const ep = ENDPOINTS.find((x) => x.id === form.dataset.teste);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      executar(ep, form);
    });
  });

  // Chave de teste: só memória.
  const campo = $('#campo-chave');
  const aviso = $('#aviso-chave');
  $('#form-chave').addEventListener('submit', (e) => e.preventDefault());
  campo.addEventListener('input', () => {
    chaveApi = campo.value.trim();
    const valida = /^hzn_[A-Za-z0-9_-]{43}$/.test(chaveApi);
    aviso.textContent = !chaveApi ? '' : valida ? 'Pronto: use Executar nos endpoints abaixo.' : 'Formato esperado: hzn_ seguido de 43 caracteres.';
    aviso.className = `mt-1 min-h-4 text-xs ${!chaveApi ? 'text-gray-400' : valida ? 'text-emerald-600' : 'text-amber-700'}`;
    $('#status-chave-ponto').className = `h-2 w-2 rounded-full ${valida ? 'bg-emerald-500' : chaveApi ? 'bg-amber-500' : 'bg-gray-300'}`;
    $('#status-chave-texto').textContent = valida ? `${chaveApi.slice(0, 10)}…` : 'Chave para testar';
  });
  $('#mostrar-chave').addEventListener('click', (e) => {
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    e.currentTarget.textContent = mostrar ? 'Ocultar' : 'Mostrar';
  });
  $('#status-chave').addEventListener('click', () => {
    $('#testar').scrollIntoView({ block: 'center' });
    campo.focus({ preventScroll: true });
  });

  // Menu no celular.
  const menu = $('#menu');
  const fundo = $('#fundo-menu');
  const alternarMenu = (abrir) => {
    menu.classList.toggle('-translate-x-full', !abrir);
    fundo.classList.toggle('hidden', !abrir);
  };
  $('#abrir-menu').addEventListener('click', () => alternarMenu(menu.classList.contains('-translate-x-full')));
  fundo.addEventListener('click', () => alternarMenu(false));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => window.innerWidth < 1024 && alternarMenu(false)));

  // Item do menu da seção visível.
  const links = new Map($$('a.nav-link', menu).map((a) => [a.getAttribute('href').slice(1), a]));
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas
        .filter((x) => x.isIntersecting)
        .forEach((x) => {
          links.forEach((a) => a.classList.remove('ativo'));
          links.get(x.target.id)?.classList.add('ativo');
        });
    },
    { rootMargin: '-72px 0px -65% 0px' }
  );
  $$('main section[id]').forEach((s) => observador.observe(s));
}

montar();
ligarEventos();
