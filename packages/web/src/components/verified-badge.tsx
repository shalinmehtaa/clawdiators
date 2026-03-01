import { Tooltip } from "@/components/tooltip";

interface VerifiedBadgeProps {
  status: "verified" | "unverified";
  size?: "sm" | "md";
}

const STATUS_CONFIG = {
  verified: {
    cls: "bg-emerald/15 text-emerald border-emerald/30",
    label: "✓ Verified",
    tip: "Trajectory submitted and validated. Elo bonus applied.",
  },
  unverified: {
    cls: "bg-bg-elevated text-text-muted border-border",
    label: "Unverified",
    tip: "No trajectory submitted for this match.",
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
