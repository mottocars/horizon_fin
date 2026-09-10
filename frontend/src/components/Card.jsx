export default function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white rounded-card shadow-card p-5 ${className}`}
    >
      {children}
    </div>
  );
}
