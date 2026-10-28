const T = require('../../config/telas');

// Grupos de endpoints da API Horizon. Cada um é liberado na chave pelo dono (tela Integrações >
// API Horizon), e só aparece para quem tem a tela do sistema correspondente. A cada chamada a
// API confere as duas coisas (ver v1/autenticacao.js::exigirGrupo).
//
// Grupo novo: acrescente aqui, monte as rotas em v1/v1.routes.js com exigirGrupo('<id>') e
// documente em api-docs/src/endpoints.js (GRUPOS) — o id e os escopos têm de ser os mesmos.
const GRUPOS = [
  {
    id: 'notas-fiscais',
    titulo: 'Notas fiscais',
    descricao: 'Certificados digitais e notas fiscais (NF-e e NFS-e) capturadas pelo Espião NF-e / NFS-e.',
    tela: T.ESPIAO,
    nomeTela: 'Espião NFe / NFSe',
    endpoints: [
      ['GET', '/certificados'],
      ['GET', '/notas-fiscais'],
      ['GET', '/notas-fiscais/{id}'],
      ['GET', '/notas-fiscais/{id}/xml'],
      ['PATCH', '/notas-fiscais/{id}/inativar'],
    ],
    escopos: [
      {
        id: 'notas:inativar',
        titulo: 'Inativar notas',
        descricao: 'Marca notas como "não lançar", com motivo, em seu nome (PATCH /notas-fiscais/{id}/inativar).',
      },
    ],
  },
];

const PORID = new Map(GRUPOS.map((g) => [g.id, g]));

function usuarioTemTela(usuario, tela) {
  return usuario?.permissao === 'MASTER' || (usuario?.telas_permitidas || []).includes(tela);
}

// Grupos que o usuário pode liberar numa chave (tem a tela).
function gruposDisponiveis(usuario) {
  return GRUPOS.filter((g) => usuarioTemTela(usuario, g.tela));
}

module.exports = { GRUPOS, PORID, usuarioTemTela, gruposDisponiveis };
