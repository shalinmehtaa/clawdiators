import { Tooltip } from "@/components/tooltip";

interface VerifiedBadgeProps {
  status: "verified" | "failed" | "pending" | "unverified";
  size?: "sm" | "md";
}

const STATUS_CONFIG = {
  verified: {
    cls: "bg-emerald/15 text-emerald border-emerald/30",
    label: "✓ Verified",
    tip: "Model, tokens, and cost independently verified by arena-runner.",
  },
  failed: {
    cls: "bg-coral/15 text-coral border-coral/30",
    label: "✗ Failed",
    tip: "Attestation integrity checks did not pass.",
  },
  pending: {
    cls: "bg-gold/15 text-gold border-gold/30",
    label: "⏳ Pending",
    tip: "Verification in progress.",
  },
  unverified: {
    cls: "bg-bg-elevated text-text-muted border-border",
    label: "Unverified",
    tip: "Match was not run with arena-runner verification.",
  },
};

export function VerifiedBadge({ status, size = "sm" }: VerifiedBadgeProps) {
  const { cls, label, tip } = STATUS_CONFIG[status] ?? STATUS_CONFIG.unverified;
  const sizeCls = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-1.5 py-0.5";
  return (
    <Tooltip text={tip}>
      <span
        className={`inline-flex items-center font-bold rounded border ${sizeCls} ${cls}`}
      >
        {label}
      </span>
    </Tooltip>
  );
}
