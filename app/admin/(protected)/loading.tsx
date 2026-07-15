export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-12 bg-gray-200 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-200 rounded" />
        ))}
      </div>
    </div>
  );
}
