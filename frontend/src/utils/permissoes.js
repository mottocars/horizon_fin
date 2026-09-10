const USUARIOS_NOVO = '/cadastros/usuarios/novo';

// Master e Administrador enxergam todas as telas (Administrador tem
// restrição de dados por empresa, não de menu). Básico só enxerga as telas
// explicitamente marcadas em telas_permitidas — exceto a Home, que todo
// usuário sempre tem acesso, independente de permissão ou seleção. Se o
// Administrador liberar "Usuários" pra um Básico, ele passa a poder listar,
// criar e editar usuários normalmente (sem exceção adicional aqui).
export function temAcessoATela(user, pathname) {
  if (!user) return false;
  if (pathname === '/' || pathname === '/meu-perfil') return true;
  if (user.permissao === 'MASTER' || user.permissao === 'ADMINISTRADOR') return true;

  const telas = user.telas_permitidas || [];
  return telas.some((codigo) => pathname === codigo || pathname.startsWith(`${codigo}/`));
}

// Usada nas telas onde o botão de criar usuário aparece — segue a mesma
// regra de acesso à tela de Usuários (se ele acessa, ele cria).
export function podeCriarUsuario(user) {
  return temAcessoATela(user, USUARIOS_NOVO);
}
