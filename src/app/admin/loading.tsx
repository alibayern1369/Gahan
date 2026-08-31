export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="در حال بارگذاری">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-xl bg-black/5 dark:bg-white/10" />
          <div className="h-3 w-28 rounded-lg bg-black/5 dark:bg-white/10" />
        </div>
        <div className="h-10 w-28 rounded-2xl bg-black/5 dark:bg-white/10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-24 rounded-3xl" />
        ))}
      </div>
      <div className="glass h-64 rounded-3xl" />
    </div>
  );
}
