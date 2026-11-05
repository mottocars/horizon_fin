const fs = require('fs');
const path = require('path');
const A = require('./anonimizador');
const C = require('./config');
const K = require('./clonador');
const { gerarXml } = require('./espiaoXml');
const { encrypt } = require('../../utils/crypto');

// ---------------------------------------------------------------------------------------
// Parte operacional da empresa modelo: integrações SIMULADAS (linhas de configuração com
// credenciais fictícias — nenhum fluxo chama o serviço externo para a empresa modelo, ver
// utils/empresaModelo.js), conexões Itaú ESPELHO, contas Itaú/VanPix, Espião (notas + XML),
// Cronogramas e Monitor.
// ---------------------------------------------------------------------------------------

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');
const NOTAS_DIR = path.join(UPLOADS_DIR, 'espiao-notas');
const SIMULADO = () => encrypt('credencial-simulada-empresa-modelo');

function uuidDe(semente) {
  const h = A.hash(`uuid:${semente}`).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function digitos(semente, n) {
  const h = A.hash(`dig:${semente}`);
  let s = '';
  for (let i = 0; i < n; i += 1) s += String(h[i] % 10);
  return s.replace(/^0/, '1');
}

async function inserir(ctx, tabela, linha, retorno = 'id') {
  const cols = Object.keys(linha);
  const vals = cols.map((c) => (linha[c] !== null && typeof linha[c] === 'object' && !(linha[c] instanceof Date) && !Array.isArray(linha[c]) ? JSON.stringify(linha[c]) : linha[c]));
  const { rows } = await ctx.client.query(
    `INSERT INTO "${tabela}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})${retorno ? ` RETURNING ${retorno}` : ''}`,
    vals
  );
  return rows[0];
}

// ─── integrações ─────────────────────────────────────────────────────────────────────────

async function criarIntegracoes(ctx) {
  ctx.log('Integrações (simuladas)');
  const m = ctx.modelo;
  ctx.integ = {};
  ctx.integ.sienge = (await inserir(ctx, 'integracoes_sienge', { empresa_id: m, tenant: C.TENANT, username: `${C.TENANT}-integracao`, password_enc: SIMULADO(), ativo: true })).id;
  ctx.integ.prevision = (await inserir(ctx, 'integracoes_prevision', { empresa_id: m, api_key_enc: SIMULADO(), company_id: '90210', ativo: true })).id;
  ctx.integ.zapi = (
    await inserir(ctx, 'integracoes_zapi', {
      empresa_id: m,
      nome_conexao: 'Comunicação HZN',
      instance_id: A.hash('zapi:hzn').toString('hex').slice(0, 32).toUpperCase(),
      instance_token_enc: SIMULADO(),
      client_token_enc: SIMULADO(),
      ativo: true,
    })
  ).id;
  ctx.integ.cvcrm = (await inserir(ctx, 'integracoes_construtor_vendas', { empresa_id: m, tenant: C.TENANT, email: 'integracao@hznconstrutora.com.br', senha_enc: SIMULADO(), ativo: true })).id;
  ctx.integ.email = (
    await inserir(ctx, 'integracoes_email', {
      empresa_id: m,
      nome_conexao: 'Cobrança HZN',
      driver: 'smtp',
      host: 'smtp.hznconstrutora.com.br',
      porta: 587,
      encriptacao: 'tls',
      email: 'cobranca@hznconstrutora.com.br',
      senha_enc: SIMULADO(),
      ativo: true,
    })
  ).id;
  // VanPix: uma conexão de extrato e uma de cobrança, com os apelidos usados nas contas.
  ctx.vanpix = { extrato: ['HZNAURORA', 'HZNPOENTE', 'HZNALVORADA', 'HZNNASCENTE'], cobranca: ['HZNCOBAUR', 'HZNCOBPOE', 'HZNCOBALV', 'HZNCOBNAS'] };
  for (const [finalidade, apelidos, nome] of [['EXTRATO', ctx.vanpix.extrato, 'VanPix Extrato CEF'], ['COBRANCA', ctx.vanpix.cobranca, 'VanPix Cobrança CEF']]) {
    const id = (await inserir(ctx, 'integracoes_vanpix', { empresa_id: m, nome_conexao: nome, service_key_enc: SIMULADO(), client_secret_enc: SIMULADO(), ativo: true, finalidade })).id;
    ctx.integ[`vanpix_${finalidade.toLowerCase()}`] = id;
    for (const apelido of apelidos) await inserir(ctx, 'integracoes_vanpix_convenios', { integracao_id: id, apelido }, null);
  }
}

// ─── contas bancárias: classificações, VanPix, CNAB e Itaú espelho ───────────────────────

async function prepararContas(ctx) {
  ctx.log('Contas bancárias (classificações, convênios e Itaú espelho)');
  const { client, modelo: m } = ctx;
  // Classificações: as da origem + as que mostram todos os recursos da tela.
  const { rows: existentes } = await client.query('SELECT id, nome FROM classificacoes_bancarias WHERE empresa_id = $1', [m]);
  const porNome = new Map(existentes.map((c) => [A.normalizar(c.nome), c.id]));
  const garantir = async (nome, descricao, libera, prioridade = 'SALDO_ANTERIOR') => {
    const n = A.normalizar(nome);
    if (porNome.has(n)) {
      await client.query('UPDATE classificacoes_bancarias SET descricao = COALESCE(descricao, $2), libera_saldo = $3 WHERE id = $1', [porNome.get(n), descricao, libera]);
      return porNome.get(n);
    }
    const id = (await inserir(ctx, 'classificacoes_bancarias', { empresa_id: m, nome, descricao, libera_saldo: libera, prioridade_sem_saldo: prioridade })).id;
    porNome.set(n, id);
    return id;
  };
  const cls = {
    liberado: await garantir('LIBERADO', 'Conta movimento livre das SPEs e da construtora.', true),
    aplicacao: await garantir('APLICAÇÃO', 'Aplicações automáticas e fundos de liquidez diária.', true),
    garantida: await garantir('GARANTIDA', 'Conta garantia do financiamento à produção (CEF) — liberação por medição.', false),
    bloqueada: await garantir('BLOQUEADA', 'Valores bloqueados judicialmente ou retidos pelo banco.', false),
    dedicada: await garantir('DEDICADA', 'Conta dedicada a repasses de financiamento dos clientes.', false),
  };
  ctx.classificacoes = cls;

  // Contas bancárias da origem (Caixa): as principais entram no saldo diário; parte vira VanPix.
  const { rows: contas } = await client.query(
    `SELECT numero_conta, company_id, nome, tipo_id, tipo_convenio, projeta_dfc FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND tipo_id = 'B' ORDER BY company_id, numero_conta`,
    [m]
  );
  let iVan = 0;
  for (const c of contas) {
    let tipo = c.tipo_convenio;
    // Na grade de saldos só entram as contas do fluxo de caixa (Projeta DFC) — as demais (mútuo,
    // reapropriação) ficam no cadastro, fora do saldo diário.
    const campos = { projeta_saldo: Boolean(c.projeta_dfc), classificacao_id: cls.liberado };
    if (tipo === 'CNAB_MANUAL' && iVan < ctx.vanpix.extrato.length && !/SEDE|ON|ALVORADA/i.test(c.nome)) {
      // parte das contas CNAB vira VanPix (extrato + cobrança) — a tela mostra os dois tipos
      tipo = 'VANPIX';
      Object.assign(campos, {
        tipo_convenio: 'VANPIX',
        codigo_cedente_extrato: ctx.vanpix.extrato[iVan],
        codigo_cedente_cobranca: ctx.vanpix.cobranca[iVan],
        codigo_beneficiario: null,
      });
      iVan += 1;
    }
    if (/GARANT/i.test(c.nome)) campos.classificacao_id = cls.garantida;
    if (/APLIC|INVEST|POUP/i.test(c.nome)) campos.classificacao_id = cls.aplicacao;
    const sets = Object.keys(campos).map((k, i) => `${k} = $${i + 4}`);
    await client.query(`UPDATE contas_bancarias_sienge SET ${sets.join(', ')} WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3`, [
      m,
      c.company_id,
      c.numero_conta,
      ...Object.values(campos),
    ]);
  }

  // Conexões Itaú espelho: uma para cada conexão ativa da empresa de origem do Itaú.
  const { rows: g } = await client.query('SELECT id FROM empresas WHERE cnpj = $1', [C.CNPJ_ITAU_ORIGEM]);
  ctx.itau = [];
  if (!g[0]) return;
  const { rows: origens } = await client.query(
    `SELECT id, agencia, conta, dac, ativo FROM conexoes_itau
     WHERE empresa_id = $1 AND conexao_origem_id IS NULL AND agencia IS NOT NULL AND conta IS NOT NULL AND dac IS NOT NULL
     ORDER BY id`,
    [g[0].id]
  );
  const { rows: empresasModelo } = await client.query(
    `SELECT DISTINCT company_id, company_name FROM contas_bancarias_sienge WHERE empresa_id = $1 AND company_id IS NOT NULL ORDER BY company_id`,
    [m]
  );
  const obras = Object.values(C.CENTROS).filter((n) => n.startsWith('HZN'));
  for (let i = 0; i < origens.length; i += 1) {
    const o = origens[i];
    const empresa = empresasModelo[i % empresasModelo.length];
    const obra = obras[i % obras.length];
    const sufixo = i >= obras.length ? ` ${Math.floor(i / obras.length) + 1}` : '';
    const agencia = ['3127', '0482', '7745', '1290'][i % 4];
    const conta = digitos(`itau-conta:${o.id}`, 5);
    const dac = String(A.hash(`itau-dac:${o.id}`)[0] % 10);
    const nome = `ITAÚ ${obra.replace(/^HZN /, '')}${sufixo}`;
    const razao = A.normalizar(empresa?.company_name || C.EMPRESA.razao_social).slice(0, 64);
    const espelho = (
      await inserir(ctx, 'conexoes_itau', {
        empresa_id: m,
        nome,
        client_id: uuidDe(`itau:${o.id}`),
        cnpj: A.cnpjDe(Buffer.from(C.EMPRESA.cnpj.slice(0, 8).split('').map(Number)), String(i + 2).padStart(4, '0')),
        agencia,
        conta,
        dac,
        razao_social: razao,
        cidade: 'VOLTA REDONDA',
        uf: 'RJ',
        status: 'ATIVA',
        ativo: o.ativo,
        conexao_origem_id: o.id,
        criado_por: ctx.equipe[0],
      })
    ).id;
    const numeroConta = `${conta}-${dac}`;
    await inserir(
      ctx,
      'contas_bancarias_sienge',
      {
        numero_conta: numeroConta,
        empresa_id: m,
        company_id: empresa?.company_id ?? 1,
        nome,
        tipo_id: 'B',
        tipo_descricao: 'Bancária',
        agencia,
        banco_numero: '341',
        banco_nome: 'Itaú Unibanco S.A.',
        company_name: empresa?.company_name || C.EMPRESA.razao_social,
        status: 'ENABLED',
        projeta_dfc: false,
        banco_enriquecido: '341',
        agencia_enriquecida: agencia,
        conta_enriquecida: conta,
        digito: dac,
        projeta_saldo: true,
        classificacao_id: i % 5 === 3 ? cls.aplicacao : i % 7 === 5 ? cls.garantida : cls.liberado,
        tipo_convenio: 'ITAU',
        valor_cheque_especial: i % 4 === 0 ? 50000 : null,
      },
      null
    );
    ctx.itau.push({ espelho, origem: o.id, numeroConta, companyId: empresa?.company_id ?? 1, nome });
  }
}

// ─── Espião NF-e / NFS-e ────────────────────────────────────────────────────────────────

function apagarXmlsDaModelo(modelo) {
  const dir = path.join(NOTAS_DIR, String(modelo));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function copiarEspiao(ctx) {
  ctx.log('Espião NF-e / NFS-e');
  const { client, origem, modelo: m } = ctx;
  // Certificados: só o cadastro (sem arquivo .pfx) — a consulta à SEFAZ é simulada.
  const { rows: certs } = await client.query('SELECT * FROM certificados_digitais WHERE empresa_id = $1 ORDER BY id', [origem]);
  await K.copiarLinhas(ctx, 'certificados_digitais', certs, {
    transformar: (l, o) => {
      const [nomeEmp, cnpj] = String(o.nome).split(':');
      const novoNome = K.nomeEmpresaGrupo(nomeEmp.trim()) || A.texto(nomeEmp);
      const novoCnpj = A.documento(cnpj || '');
      l.nome = `${A.normalizar(novoNome)}:${novoCnpj}`;
      l.arquivo_original = `${A.normalizar(novoNome).replace(/[^A-Z0-9]+/g, '_')}.pfx`;
      l.arquivo_armazenado = `${m}/certificado-demonstracao-${o.id}.pfx`; // não existe: consulta simulada
      l.senha_enc = SIMULADO();
      l.validade_ate = o.validade_ate && new Date(o.validade_ate) > new Date() ? o.validade_ate : '2027-09-30';
      return l;
    },
  });
  ctx.log(`  certificados_digitais: ${certs.length}`);
  await K.copiar(ctx, 'espiao_certificado_estado', {
    where: 'certificado_id IN (SELECT id FROM certificados_digitais WHERE empresa_id = $1)',
    transformar: (l, o) => ({ ...l, cnpj: A.documento(o.cnpj) }),
  });
  await K.copiar(ctx, 'espiao_configuracoes');
  await K.copiar(ctx, 'espiao_agendamentos');

  // Categoria do título vinculado (para inventar itens coerentes no XML).
  const { rows: cats } = await client.query(
    `SELECT DISTINCT ON (v.nota_id) v.nota_id, c.financial_category_name AS categoria
     FROM espiao_notas_vinculos v
     JOIN sie_outcome_categorias c ON c.empresa_id = v.empresa_id AND c.bill_id = v.sienge_titulo_id
     WHERE v.empresa_id = $1 ORDER BY v.nota_id, c.financial_category_rate DESC NULLS LAST`,
    [origem]
  );
  const categoriaDaNota = new Map(cats.map((c) => [c.nota_id, c.categoria]));
  const dir = ctx.ensaio ? null : apagarXmlsDaModelo(m);
  let arquivos = 0;
  const { rows: notas } = await client.query('SELECT * FROM espiao_notas WHERE empresa_id = $1 ORDER BY id', [origem]);
  await K.copiarLinhas(ctx, 'espiao_notas', notas, {
    transformar: (l, o) => {
      const docEmit = o.cnpj_emitente;
      l.emissor = A.nome(o.emissor, { doc: docEmit });
      l.cnpj_emitente = A.documento(docEmit);
      l.destinatario = K.nomeEmpresaGrupo(o.destinatario) !== o.destinatario ? K.nomeEmpresaGrupo(o.destinatario) : A.texto(o.destinatario);
      if (A.normalizar(l.destinatario) === A.normalizar(o.destinatario)) l.destinatario = A.nome(o.destinatario, { doc: o.cnpj_destinatario, tipo: 'PJ' });
      l.cnpj_destinatario = A.documento(o.cnpj_destinatario);
      l.chave_acesso = A.chaveAcesso(o.chave_acesso, docEmit);
      l.arquivo_armazenado = `${m}/${l.chave_acesso}.xml`;
      l.motivo_inativacao = K.textoLivre(ctx, o.motivo_inativacao);
      if (dir) {
        fs.writeFileSync(path.join(dir, `${l.chave_acesso}.xml`), gerarXml(l, { categoria: categoriaDaNota.get(o.id) }), 'utf8');
        arquivos += 1;
      }
      return l;
    },
  });
  ctx.log(`  espiao_notas: ${notas.length} (${arquivos} XML gerados)`);
  await K.copiar(ctx, 'espiao_notas_eventos', { where: 'nota_id IN (SELECT id FROM espiao_notas WHERE empresa_id = $1)' });
  await K.copiar(ctx, 'espiao_notas_vinculos', {
    transformar: (l, o) => {
      l.credor_nome = A.nome(o.credor_nome, { doc: o.credor_documento });
      l.credor_documento = A.documento(o.credor_documento);
      l.documento_numero = K.textoLivre(ctx, o.documento_numero);
      return l;
    },
  });
}

// ─── Cronogramas e Monitor ──────────────────────────────────────────────────────────────

function remapearIdsJson(ctx, valor) {
  if (Array.isArray(valor)) return valor.map((v) => remapearIdsJson(ctx, v));
  if (valor && typeof valor === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      if (/^(id|etapaId|etapa_id|mascara_item_id)$/.test(k) && Number.isInteger(v)) out[k] = ctx.mapas.obter('mascara_itens', v) ?? v;
      else out[k] = remapearIdsJson(ctx, v);
    }
    return out;
  }
  return typeof valor === 'string' ? A.texto(valor) : valor;
}

async function copiarCronogramaEMonitor(ctx) {
  ctx.log('Cronogramas de obras e Monitor de Integrações');
  const nomesEquipe = (await ctx.client.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[]) ORDER BY id', [ctx.equipe])).rows.map((u) => u.nome);
  await K.copiar(ctx, 'cronograma_config', {
    transformar: (l) => ({ ...l, zapi_integracao_id: ctx.integ.zapi }),
  });
  await K.copiar(ctx, 'cronograma_versoes', {
    transformar: (l, o) => {
      l.alteracoes = remapearIdsJson(ctx, o.alteracoes);
      l.cronograma = remapearIdsJson(ctx, o.cronograma);
      const enviados = (o.comunicado?.enviados || []).map((_, i) => ({ nome: nomesEquipe[i % nomesEquipe.length] }));
      l.comunicado = o.comunicado ? { ...o.comunicado, enviados, simulado: true } : o.comunicado;
      l.observacao = K.textoLivre(ctx, o.observacao);
      return l;
    },
  });
  for (const u of ctx.equipe.slice(0, 4)) {
    await inserir(ctx, 'cronograma_comunicar_usuarios', { empresa_id: ctx.modelo, usuario_id: u }, null);
  }

  // Monitor: rotinas agendadas (simuladas para a empresa modelo) + histórico da origem.
  await K.copiar(ctx, 'monitor_integracoes_agendamentos');
  const { rows: ja } = await ctx.client.query('SELECT rotina FROM monitor_integracoes_agendamentos WHERE empresa_id = $1', [ctx.modelo]);
  const tem = new Set(ja.map((r) => r.rotina));
  const extras = [
    ['sienge_centros_custo', '05:10'],
    ['sienge_plano_contas', '05:15'],
    ['itau_certificado', '06:00'],
    ['prevision_dashboards', '06:30'],
    ['repasses_contratos', '07:00'],
    ['repasses_reservas', '07:10'],
    ['espiao_vinculacao', '07:30'],
    ['cobranca_clusters', '04:00'],
    ['cobranca_distribuicao', '07:45'],
  ];
  for (const [rotina, horario] of extras) {
    if (tem.has(rotina)) continue;
    await inserir(ctx, 'monitor_integracoes_agendamentos', { empresa_id: ctx.modelo, rotina, ativo: true, frequencia: 'diaria', horario, atualizado_por: ctx.equipe[1] }, null);
  }
  await K.copiar(ctx, 'monitor_integracoes_parametros');
  await K.copiar(ctx, 'monitor_integracoes_execucoes', {
    transformar: (l, o) => ({ ...l, resumo: K.textoLivre(ctx, o.resumo), erro: K.textoLivre(ctx, o.erro) }),
  });
}

module.exports = { criarIntegracoes, prepararContas, copiarEspiao, copiarCronogramaEMonitor, inserir, NOTAS_DIR };
