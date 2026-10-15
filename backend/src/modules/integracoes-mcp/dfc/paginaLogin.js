// Tela de login do OAuth do MCP do DFC (aberta pelo Claude ao conectar): HTML simples servido pelo
// backend, na identidade visual do Horizon Fin.

const escapar = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function duracao(horas) {
  if (horas % 24 === 0) {
    const dias = horas / 24;
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
}

const ESTILO = `
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111827;padding:16px}
  .card{width:100%;max-width:400px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(16,24,40,.08);padding:32px}
  .logo{display:block;height:44px;margin:0 auto 20px}
  h1{font-size:18px;margin:0 0 6px;text-align:center}
  .sub{font-size:13px;color:#6b7280;text-align:center;margin:0 0 20px;line-height:1.5}
  .info{background:#eff4ff;border-radius:10px;padding:10px 12px;font-size:12px;color:#1e3a8a;margin-bottom:18px;line-height:1.5}
  label{display:block;font-size:13px;font-weight:600;color:#374151;margin:0 0 6px}
  input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:14px}
  input:focus{outline:none;border-color:#1d4ed8;box-shadow:0 0 0 3px #dbeafe}
  button{width:100%;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;padding:11px;cursor:pointer}
  button:hover{background:#1e40af}
  .erro{background:#fff1f2;color:#be123c;border-radius:8px;padding:10px 12px;font-size:13px;margin-bottom:14px}
  .rodape{font-size:11px;color:#9ca3af;text-align:center;margin-top:18px;line-height:1.5}
`;

function pagina(conteudo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Horizon Fin — Conectar ao DFC</title><style>${ESTILO}</style></head><body><div class="card">
<img class="logo" src="/api/mcp-oauth/logo.png" alt="Horizon Finanças">${conteudo}</div></body></html>`;
}

// `params`: os parâmetros do /authorize, repassados no POST.
function login({ conector, clienteNome, params, erro, usuario }) {
  const ocultos = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<input type="hidden" name="${escapar(k)}" value="${escapar(v)}">`)
    .join('');
  return pagina(`
<h1>Conectar ao DFC Construtoras</h1>
<p class="sub">${escapar(clienteNome || 'O Claude')} quer consultar o DFC de <strong>${escapar(conector.empresa)}</strong>
 (conector "${escapar(conector.nome_conector)}").</p>
<div class="info">${conector.escopo === 'DFC_ORCAMENTO' ? 'Leitura do DFC e alteração do Orçamento só nas contas HORIZON - INFORMADO, em seu nome.' : 'Acesso somente leitura.'} O login vale por <strong>${duracao(conector.sessao_horas)}</strong>; depois disso o Claude pede para entrar de novo.</div>
${erro ? `<div class="erro">${escapar(erro)}</div>` : ''}
<form method="post" action="/api/mcp-oauth/authorize" autocomplete="on">${ocultos}
<label for="usuario">Usuário</label><input id="usuario" name="usuario" value="${escapar(usuario || '')}" autocomplete="username" required autofocus>
<label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required>
<button type="submit">Entrar e autorizar</button></form>
<p class="rodape">Use o mesmo usuário do Horizon Fin. Seu usuário precisa ter acesso à tela DFC Construtoras desta empresa.</p>`);
}

function erro(mensagem) {
  return pagina(`<h1>Não foi possível conectar</h1><div class="erro">${escapar(mensagem)}</div>
<p class="rodape">Confira o link do conector em Integrações &gt; MCP no Horizon Fin e tente de novo pelo Claude.</p>`);
}

module.exports = { login, erro, duracao };
