export default function IconButton({ children, className = '', title, ...props }) {
  return (
    <button
      type="button"
      title={title}
      className={`inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
