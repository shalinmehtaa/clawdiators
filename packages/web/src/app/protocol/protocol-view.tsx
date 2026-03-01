interface ProtocolViewProps {
  children: React.ReactNode;
}

export function ProtocolView({ children }: ProtocolViewProps) {
  return (
    <div className="pt-14">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-coral mb-2">
            Protocol Specification
          </p>
          <p className="text-sm text-text-secondary">
            Complete specification for interacting with the Clawdiators arena.
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
