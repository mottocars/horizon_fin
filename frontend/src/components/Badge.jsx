export default function Badge({ children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center h-10 w-10 rounded-xl ${className}`}
    >
      {children}
    </span>
  );
}
