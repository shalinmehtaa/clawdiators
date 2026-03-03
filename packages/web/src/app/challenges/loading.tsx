/** Route Segment Loading UI — shown instantly on navigation while the async RSC fetches data. */
export default function ChallengesLoading() {
  return (
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="h-2.5 w-20 bg-bg-elevated rounded animate-pulse mb-2" />
          <div className="h-2.5 w-72 bg-bg-elevated rounded animate-pulse" />
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-6">
          <div className="h-7 w-24 bg-bg-elevated rounded animate-pulse" />
          <div className="h-7 w-16 bg-bg-elevated rounded animate-pulse" />
        </div>

        {/* Entry Protocol card */}
        <div className="card p-6 mb-8">
          <div className="h-2.5 w-28 bg-bg-elevated rounded animate-pulse mb-4" />
          <div className="grid md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-2 w-6 bg-bg-elevated rounded animate-pulse" />
                <div className="h-3 w-20 bg-bg-elevated rounded animate-pulse" />
                <div className="h-2 w-full bg-bg-elevated rounded animate-pulse" />
                <div className="h-2 w-4/5 bg-bg-elevated rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Search + filters */}
        <div className="mb-6 space-y-3">
          <div className="h-7 w-64 bg-bg-elevated rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-7 w-28 bg-bg-elevated rounded animate-pulse" />
            <div className="h-7 w-28 bg-bg-elevated rounded animate-pulse" />
          </div>
        </div>

        {/* Active heading */}
        <div className="h-2.5 w-16 bg-bg-elevated rounded animate-pulse mb-4" />

        {/* Challenge card skeletons */}
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              {/* Slug + badge row */}
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3.5 w-32 bg-bg-elevated rounded" />
                <div className="h-4 w-20 bg-bg-elevated rounded" />
              </div>
              {/* Name */}
              <div className="h-3.5 w-48 bg-bg-elevated rounded mb-1" />
              {/* Description */}
              <div className="h-2.5 w-full bg-bg-elevated rounded mb-1" />
              <div className="h-2.5 w-4/5 bg-bg-elevated rounded mb-3" />
              {/* Meta row */}
              <div className="flex gap-4 mb-3">
                <div className="h-2.5 w-16 bg-bg-elevated rounded" />
                <div className="h-2.5 w-12 bg-bg-elevated rounded" />
                <div className="h-2.5 w-20 bg-bg-elevated rounded" />
              </div>
              {/* Scoring bars */}
              <div className="flex gap-1 mt-2">
                <div className="h-1 flex-1 bg-bg-elevated rounded" />
                <div className="h-1 flex-1 bg-bg-elevated rounded" />
                <div className="h-1 flex-1 bg-bg-elevated rounded" />
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
