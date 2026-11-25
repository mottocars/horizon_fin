import http from './http';

// Aba Versões da DFC Construtoras (backend: modules/dfc-versoes) — o mesmo da DRE (dreVersoes.api.js).
const base = (empresaId) => `/dfc-versoes/${empresaId}`;
const dados = (res) => res.data;

// { limite, proximo_corte, aberta, publicada, pendente, reprovada, aprovador, pode_aprovar, orcamento, versoes: [...] }
export const listarVersoesDfc = (empresaId) => http.get(base(empresaId)).then(dados);

// O carimbo de cada alteração de uma versão (drilldown Módulo › Usuário › Alteração).
export const alteracoesVersaoDfc = (empresaId, numero) => http.get(`${base(empresaId)}/${numero}/alteracoes`).then(dados);

// `origem`: 'NOVA' (Gerar nova versão) ou 'EDICAO' (Editar última versão).
export const abrirVersaoDfc = (empresaId, origem) => http.post(`${base(empresaId)}/abrir`, { origem }).then(dados);

export const salvarVersaoDfc = (empresaId) => http.post(`${base(empresaId)}/salvar`).then(dados);

// Só o Aprovador da DFC (Matriz de Alçadas): a última versão salva vira a publicada.
export const aprovarVersaoDfc = (empresaId) => http.post(`${base(empresaId)}/aprovar`).then(dados);

// Só o Aprovador: reprova a última versão salva, com o motivo (não é publicada).
export const reprovarVersaoDfc = (empresaId, motivo) => http.post(`${base(empresaId)}/reprovar`, { motivo }).then(dados);

export const excluirVersaoDfc = (empresaId) => http.delete(`${base(empresaId)}/aberta`).then(dados);

// Cabeçalho do dashboard Fluxo de Caixa: a versão publicada (a última aprovada), Responsável, Aprovador e Colaboradores.
export const versaoPublicadaDfc = (empresaId) => http.get(`${base(empresaId)}/publicada`).then(dados);
