import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';

// Qualquer usuário abaixo de Master (Administrador OU Básico) é restrito às
// empresas vinculadas ao cadastro dele — que agora podem ser mais de uma.
// Só Master não tem essa restrição.
//
// - `empresaIds`: lista (string[]) das empresas permitidas pro usuário, ou
//   `null` pra Master (sem restrição nenhuma). Use pra filtrar listas/opções.
// - `travada` / `empresaIdTravada`: só fazem sentido quando o usuário tem
//   EXATAMENTE uma empresa — nesse caso o seletor pode vir pré-preenchido e
//   desabilitado, como antes. Com duas ou mais, o campo continua habilitado
//   (o usuário escolhe entre as suas), só que as opções já vêm restritas às
//   dele (o backend nunca retorna as outras pra quem não é Master).
export function useEmpresaTravada() {
  const { user } = useAuth();
  const isMaster = user?.permissao === 'MASTER';

  const empresaIds = useMemo(() => {
    if (isMaster) return null;
    return (user?.empresa_ids || []).map(String);
  }, [isMaster, user?.empresa_ids]);

  const travada = !isMaster && empresaIds?.length === 1;

  return {
    travada,
    empresaIdTravada: travada ? empresaIds[0] : null,
    empresaIds,
  };
}