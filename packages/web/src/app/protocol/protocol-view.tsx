"use client";

import { usePreferences } from "@/components/preferences";

interface ProtocolViewProps {
  rawJson: Record<string, unknown>;
  children: React.ReactNode;
}

export function ProtocolView({ rawJson, children }: ProtocolViewProps) {
  const { showRaw } = usePreferences();

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

        {showRaw ? (
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(rawJson, null, 2)}
          </pre>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
