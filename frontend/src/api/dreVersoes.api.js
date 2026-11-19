import http from './http';

// Aba Versões da DRE Construtoras (backend: modules/dre-versoes).
const base = (empresaId) => `/dre-versoes/${empresaId}`;
const dados = (res) => res.data;

// { limite, proximo_corte, aberta, publicada, versoes: [...] }
export const listarVersoesDre = (empresaId) => http.get(base(empresaId)).then(dados);

// O carimbo de cada alteração de uma versão (drilldown Módulo › Usuário › Alteração).
export const alteracoesVersaoDre = (empresaId, numero) => http.get(`${base(empresaId)}/${numero}/alteracoes`).then(dados);

// `origem`: 'NOVA' (Gerar nova versão) ou 'EDICAO' (Editar última versão).
export const abrirVersaoDre = (empresaId, origem) => http.post(`${base(empresaId)}/abrir`, { origem }).then(dados);

export const salvarVersaoDre = (empresaId) => http.post(`${base(empresaId)}/salvar`).then(dados);

export const excluirVersaoDre = (empresaId) => http.delete(`${base(empresaId)}/aberta`).then(dados);

// Cabeçalho do dashboard Demonstração do Resultado: { numero, corte, aberta_em, fechada_em, abriu, fechou,
// aprovador, colaboradores: [{ id, nome, avatar_url, alteracoes }] } da versão publicada (a última salva).
export const versaoPublicadaDre = (empresaId) => http.get(`${base(empresaId)}/publicada`).then(dados);
