// Destaque de número dentro dos textos de exemplo (conteudo.jsx) — próprio
// arquivo só pra não misturar componente com dados no mesmo módulo.
export default function Num({ children }) {
  return <strong className="font-semibold text-gray-800">{children}</strong>;
}
