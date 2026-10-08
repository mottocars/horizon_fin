const USUARIOS_NOVO = '/cadastros/usuarios/novo';

// Master enxerga todas as telas. Básico só enxerga as telas explicitamente
// marcadas em telas_permitidas — exceto a Home, que todo usuário sempre tem
// acesso, independente de permissão ou seleção. Se liberarem "Usuários" pra
// um Básico, ele passa a poder listar, criar e editar usuários normalmente
// (sem exceção adicional aqui).
export function temAcessoATela(user, pathname) {
  if (!user) return false;
  if (pathname === '/' || pathname === '/meu-perfil') return true;
  if (user.permissao === 'MASTER') return true;

  const telas = user.telas_permitidas || [];
  return telas.some((codigo) => pathname === codigo || pathname.startsWith(`${codigo}/`));
}

// Usada nas telas onde o botão de criar usuário aparece — segue a mesma
// regra de acesso à tela de Usuários (se ele acessa, ele cria).
export function podeCriarUsuario(user) {
  return temAcessoATela(user, USUARIOS_NOVO);
}

// Nível do usuário dentro de uma tela liberada: Comum ou Administrador
// (marcado no cadastro do usuário, em telas_administrador). Master é
// Administrador de tudo. O que o Administrador pode a mais é decidido em
// cada tela — o backend confere a mesma regra (acesso.middleware.js).
export function ehAdministradorDaTela(user, codigo) {
  if (!user) return false;
  if (user.permissao === 'MASTER') return true;
  return (user.telas_administrador || []).includes(codigo);
}
