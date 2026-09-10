import Card from '../../components/Card';

export default function ComingSoon({ title, description }) {
  return (
    <Card className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <span className="mb-3 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-600">
        Em breve
      </span>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>}
    </Card>
  );
}
