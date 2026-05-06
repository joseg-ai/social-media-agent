export default function FeedsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-5 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3.5 w-64 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        {/* Table header skeleton */}
        <div className="bg-gray-50 dark:bg-gray-900/50 px-4 py-3 grid grid-cols-5 gap-4">
          {["Name", "URL", "Status", "Last polled", "Actions"].map((col) => (
            <div key={col} className="h-3.5 rounded bg-gray-200 dark:bg-gray-700 w-3/4" />
          ))}
        </div>
        {/* Row skeletons */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="px-4 py-3 grid grid-cols-5 gap-4 border-t border-gray-100 dark:border-gray-800"
          >
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 w-5/6" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 w-full" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 w-1/2" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 w-3/4" />
            <div className="h-4 rounded bg-gray-100 dark:bg-gray-800 w-1/2 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
