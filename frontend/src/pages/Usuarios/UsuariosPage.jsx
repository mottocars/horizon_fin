import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Grid3x3, Users } from 'lucide-react';
import Tabs from '../../components/Tabs';
import UsuariosList from './UsuariosList';
import MapaAcessos from './MapaAcessos';

// Cadastros › Usuários: a lista (cadastro de cada um) e o Mapa de Acessos
// (quem acessa o quê, todos de uma vez). A aba fica na URL (?aba=mapa) — o
// cadastro aberto pelo mapa volta pra ele.
const ABAS = [
  { id: 'lista', label: 'Usuários', icon: Users },
  { id: 'mapa', label: 'Mapa de Acessos', icon: Grid3x3 },
];

export default function UsuariosPage() {
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'mapa' ? 'mapa' : 'lista';
  // Aba já aberta continua montada (escondida): trocar de aba não perde as
  // alterações ainda não salvas do mapa.
  const [abertas, setAbertas] = useState(() => new Set([aba]));
  const montadas = new Set([...abertas, aba]);

  function trocarAba(id) {
    setAbertas((prev) => new Set(prev).add(id));
    setParams(id === 'lista' ? {} : { aba: id }, { replace: true });
  }

  return (
    <div>
      <Tabs tabs={ABAS} activeId={aba} onChange={trocarAba} />
      {montadas.has('lista') && (
        <div hidden={aba !== 'lista'}>
          <UsuariosList />
        </div>
      )}
      {montadas.has('mapa') && (
        <div hidden={aba !== 'mapa'}>
          <MapaAcessos />
        </div>
      )}
    </div>
  );
}
