import { Construction } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <Construction size={24} className="text-amber-600" />
      <p className="text-base font-semibold text-gray-900">Home em construção</p>
    </div>
  );
}