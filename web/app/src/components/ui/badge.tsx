import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Mavericks-style badge base
  "relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[3px] border font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#1a82f7]/30 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [button,a&]:cursor-pointer dark:focus-visible:ring-[#3a8ee8]/30",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-[16px] min-w-[16px] px-[6px] text-[10px]",
        lg: "h-[20px] min-w-[20px] px-2 text-[11px]",
        sm: "h-[14px] min-w-[14px] px-1 text-[9px]",
      },
      variant: {
        // Mavericks primary blue badge (light + dark)
        default:
          "bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_100%)] border-[#1461b8] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] [text-shadow:0_-1px_0_rgba(0,0,0,0.2)] [button,a&]:hover:bg-[linear-gradient(180deg,#7ec0ff_0%,#2a8ff8_100%)] dark:bg-[linear-gradient(180deg,#5a9ee8_0%,#3a8ee8_100%)] dark:border-[#1a5aaa] dark:[button,a&]:hover:bg-[linear-gradient(180deg,#6aaeef_0%,#4a9ef0_100%)]",
        // Mavericks secondary gray badge (light + dark)
        secondary:
          "bg-[linear-gradient(180deg,#f0f0f0_0%,#d8d8d8_100%)] border-[#a0a0a0] text-[#333] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] [text-shadow:0_1px_0_rgba(255,255,255,0.5)] [button,a&]:hover:bg-[linear-gradient(180deg,#f8f8f8_0%,#e0e0e0_100%)] dark:bg-[linear-gradient(180deg,#4a4a4a_0%,#3a3a3a_100%)] dark:border-[#555] dark:text-[#e8e8e8] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] dark:[text-shadow:none] dark:[button,a&]:hover:bg-[linear-gradient(180deg,#555_0%,#454545_100%)]",
        // Mavericks destructive/error red badge (light + dark)
        destructive:
          "bg-[linear-gradient(180deg,#ff7b72_0%,#e53935_100%)] border-[#b71c1c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] [text-shadow:0_-1px_0_rgba(0,0,0,0.2)] dark:bg-[linear-gradient(180deg,#ff6b6b_0%,#dc3545_100%)] dark:border-[#a71d2a]",
        // Subtle error badge (light + dark)
        error:
          "bg-[#ffebee] border-[#ffcdd2] text-[#c62828] dark:bg-[#3a2020] dark:border-[#5a2020] dark:text-[#ff8a80]",
        // Info blue badge (subtle) (light + dark)
        info:
          "bg-[#e3f2fd] border-[#bbdefb] text-[#1565c0] dark:bg-[#1a2a3a] dark:border-[#1a4a6a] dark:text-[#7ac0ff]",
        // Outline badge (light + dark)
        outline:
          "bg-transparent border-[#a0a0a0] text-[#333] [button,a&]:hover:bg-black/5 dark:border-[#555] dark:text-[#e8e8e8] dark:[button,a&]:hover:bg-white/10",
        // Success green badge (light + dark)
        success:
          "bg-[linear-gradient(180deg,#5cd25c_0%,#34b534_100%)] border-[#2a962a] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] [text-shadow:0_-1px_0_rgba(0,0,0,0.2)] dark:bg-[linear-gradient(180deg,#4ade80_0%,#22c55e_100%)] dark:border-[#16a34a]",
        // Subtle success badge (light + dark)
        "success-subtle":
          "bg-[#e8f5e9] border-[#c8e6c9] text-[#2e7d32] dark:bg-[#1a3a1a] dark:border-[#2a5a2a] dark:text-[#7adf7a]",
        // Warning yellow/orange badge (light + dark)
        warning:
          "bg-[linear-gradient(180deg,#ffca28_0%,#ffa000_100%)] border-[#e68900] text-[#333] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] [text-shadow:0_1px_0_rgba(255,255,255,0.3)] dark:bg-[linear-gradient(180deg,#fbbf24_0%,#f59e0b_100%)] dark:border-[#d97706] dark:text-[#1a1a1a]",
        // Subtle warning badge (light + dark)
        "warning-subtle":
          "bg-[#fff8e1] border-[#ffecb3] text-[#e65100] dark:bg-[#3a3020] dark:border-[#5a4a20] dark:text-[#ffca28]",
      },
    },
  },
);

interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  size?: VariantProps<typeof badgeVariants>["size"];
}

function Badge({ className, variant, size, render, ...props }: BadgeProps) {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

export { Badge, badgeVariants };
