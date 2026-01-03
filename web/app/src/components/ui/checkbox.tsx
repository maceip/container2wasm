"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        // Mavericks-style checkbox (light + dark)
        "relative inline-flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border border-[#808080] bg-white outline-none transition-all",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.8)]",
        "ring-[#1a82f7]/30 focus-visible:ring-2 focus-visible:border-[#1a82f7]",
        "aria-invalid:border-[#e53935] aria-invalid:ring-[#e53935]/20",
        "data-disabled:opacity-50 data-disabled:bg-[#f0f0f0]",
        // Dark mode
        "dark:border-[#555] dark:bg-[#2a2a2a] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.1)]",
        "dark:ring-[#3a8ee8]/30 dark:focus-visible:border-[#3a8ee8]",
        "dark:data-disabled:bg-[#1a1a1a]",
        className,
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="absolute inset-0 flex items-center justify-center rounded-[2px] text-white data-unchecked:hidden data-checked:bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_100%)] data-indeterminate:bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_100%)]"
        data-slot="checkbox-indicator"
        render={(props, state) => (
          <span {...props}>
            {state.indeterminate ? (
              <svg
                className="size-[10px]"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12h13.496" />
              </svg>
            ) : (
              <svg
                className="size-[10px]"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
              </svg>
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
