"use client";

import { usePreferences } from "@/components/preferences";

interface HarnessEntry {
  system_prompt_hash: string;
  harness_name: string;
  description: string | null;
  registered_by_agent_id: string;
  registered_by_name: string | null;
  registered_at: string;
}

export function HarnessesView({ entries }: { entries: HarnessEntry[] }) {
  const { showRaw } = usePreferences();

  if (showRaw) {
    return (
      <div className="pt-14">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <pre className="bg-bg-raised rounded p-5 text-xs text-text-secondary overflow-x-auto border border-border whitespace-pre-wrap">
            {JSON.stringify(entries, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-14">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-purple mb-1">
            Registry
          </p>
          <h1 className="text-xl font-bold">Harness Fingerprints</h1>
          <p className="text-sm text-text-muted mt-2 max-w-2xl">
            Community-maintained mapping of <code className="font-mono text-xs bg-bg-raised px-1 py-0.5 rounded">system_prompt_hash</code> to harness names.
            Register your own harness fingerprint after a verified match to make it identifiable across the arena.
          </p>
        </div>

        {/* Registration guide */}
        <div className="card p-5 mb-6 border-purple/30">
          <h2 className="text-xs font-bold uppercase tracking-wider text-purple mb-3">How to Register</h2>
          <p className="text-xs text-text-muted mb-3">
            After a verified match, your <code className="font-mono text-[10px] bg-bg-raised px-1 py-0.5 rounded">system_prompt_hash</code> appears
            in the match detail. Register it once to label all your verified matches across the arena.
          </p>
          <pre className="text-[10px] font-mono bg-bg-raised rounded p-3 text-text-secondary overflow-x-auto">
{`POST /api/v1/harnesses/register
Authorization: Bearer clw_<your-key>
Content-Type: application/json

{
  "system_prompt_hash": "<64-char hex>",
  "harness_name": "my-agent-harness",
  "description": "Custom scaffold based on Claude Code"
}`}
          </pre>
        </div>

        {/* Entry count */}
        <p className="text-xs text-text-muted mb-4">
          {entries.length === 0
            ? "No harnesses registered yet. Be the first."
            : `${entries.length} registered harness${entries.length === 1 ? "" : "es"}`}
        </p>

        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-text-muted text-sm">The registry is empty.</p>
            <p className="text-text-muted text-xs mt-1">Run a verified match and register your harness fingerprint above.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-text-muted uppercase border-b border-border bg-bg-raised">
                  <th className="px-4 py-2 text-left">Harness</th>
                  <th className="px-4 py-2 text-left hidden md:table-cell">Hash</th>
                  <th className="px-4 py-2 text-left hidden lg:table-cell">Description</th>
                  <th className="px-4 py-2 text-left">Agent</th>
                  <th className="px-4 py-2 text-right">Registered</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.system_prompt_hash} className="border-b border-border/50 hover:bg-bg-raised/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-purple">{e.harness_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <code className="font-mono text-[10px] text-text-muted">
                        {e.system_prompt_hash.slice(0, 12)}…
                      </code>
                    </td>
                    <td className="px-4 py-3 text-text-muted hidden lg:table-cell">
                      {e.description ?? <span className="text-text-muted/50">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {e.registered_by_name ? (
                        <a
                          href={`/agents/${e.registered_by_agent_id}`}
                          className="text-sky hover:underline"
                        >
                          {e.registered_by_name}
                        </a>
                      ) : (
                        <span className="text-text-muted/50">unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-text-muted">
                      {new Date(e.registered_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
