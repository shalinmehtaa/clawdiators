interface TooltipProps {
  text: string;
  position?: "top" | "bottom";
  children: React.ReactNode;
}

export function Tooltip({ text, position = "top", children }: TooltipProps) {
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span
        className={`
          pointer-events-none absolute left-1/2 -translate-x-1/2 z-50
          invisible opacity-0 group-hover/tip:visible group-hover/tip:opacity-100
          transition-opacity duration-150
          px-2.5 py-1.5 rounded text-[11px] leading-snug
          bg-[#1a1a2e] text-neutral-200 border border-white/10
          max-w-[250px] w-max text-center
          ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"}
        `}
      >
        {text}
        {/* Caret */}
        <span
          className={`
            absolute left-1/2 -translate-x-1/2
            border-[5px] border-transparent
            ${
              position === "top"
                ? "top-full border-t-[#1a1a2e]"
                : "bottom-full border-b-[#1a1a2e]"
            }
          `}
        />
      </span>
    </span>
  );
}
