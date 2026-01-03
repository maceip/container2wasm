import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base Mavericks button styles
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-normal text-[11px] outline-none transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-[22px] px-3 rounded-[3px]",
        sm: "h-[19px] px-2 text-[10px] rounded-[3px]",
        lg: "h-[26px] px-4 text-[12px] rounded-[4px]",
        icon: "size-[22px] rounded-[3px]",
        "icon-sm": "size-[19px] rounded-[3px]",
        "icon-lg": "size-[26px] rounded-[4px]",
      },
      variant: {
        // Mavericks primary blue button (light + dark)
        default:
          "bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_50%,#166ee1_100%)] border border-[#1461b8] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_1px_rgba(0,0,0,0.1)] [text-shadow:0_-1px_0_rgba(0,0,0,0.3)] hover:bg-[linear-gradient(180deg,#7ec0ff_0%,#2a8ff8_50%,#1a7ae8_100%)] active:bg-[linear-gradient(180deg,#5aa0e8_0%,#1270d8_50%,#0f5fc0_100%)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] dark:bg-[linear-gradient(180deg,#5a9ee8_0%,#3a8ee8_50%,#2a7ed8_100%)] dark:border-[#1a5aaa] dark:hover:bg-[linear-gradient(180deg,#6aaeef_0%,#4a9ef0_50%,#3a8ee0_100%)] dark:active:bg-[linear-gradient(180deg,#4a8ed8_0%,#2a7ec8_50%,#1a6eb8_100%)]",
        // Mavericks secondary/outline button (light + dark)
        secondary:
          "bg-[linear-gradient(180deg,#fefefe_0%,#f2f2f2_50%,#e0e0e0_100%)] border border-[#a0a0a0] text-[#1a1a1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_1px_rgba(0,0,0,0.08)] [text-shadow:0_1px_0_rgba(255,255,255,0.8)] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f8f8f8_50%,#e8e8e8_100%)] active:bg-[linear-gradient(180deg,#e8e8e8_0%,#d8d8d8_50%,#c8c8c8_100%)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] dark:bg-[linear-gradient(180deg,#4a4a4a_0%,#3a3a3a_50%,#2a2a2a_100%)] dark:border-[#555] dark:text-[#e8e8e8] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_1px_rgba(0,0,0,0.2)] dark:[text-shadow:none] dark:hover:bg-[linear-gradient(180deg,#555_0%,#454545_50%,#353535_100%)] dark:active:bg-[linear-gradient(180deg,#3a3a3a_0%,#2a2a2a_50%,#1a1a1a_100%)]",
        // Mavericks destructive red button (light + dark)
        destructive:
          "bg-[linear-gradient(180deg,#ff7b72_0%,#e53935_50%,#c62828_100%)] border border-[#b71c1c] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_1px_rgba(0,0,0,0.1)] [text-shadow:0_-1px_0_rgba(0,0,0,0.3)] hover:bg-[linear-gradient(180deg,#ff8a80_0%,#ef5350_50%,#d32f2f_100%)] active:bg-[linear-gradient(180deg,#e57373_0%,#c62828_50%,#b71c1c_100%)] dark:bg-[linear-gradient(180deg,#ff6b6b_0%,#dc3545_50%,#c82333_100%)] dark:border-[#a71d2a] dark:hover:bg-[linear-gradient(180deg,#ff7b7b_0%,#e63946_50%,#d32f2f_100%)]",
        // Ghost button (minimal) - light + dark
        ghost:
          "border-transparent bg-transparent hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15",
        // Link style - light + dark
        link:
          "border-transparent bg-transparent text-[#1a82f7] underline-offset-2 hover:underline dark:text-[#5a9ef5]",
        // Outline variant - light + dark
        outline:
          "bg-transparent border border-[#a0a0a0] text-[#333] hover:bg-black/5 active:bg-black/10 dark:border-[#555] dark:text-[#e8e8e8] dark:hover:bg-white/10 dark:active:bg-white/15",
      },
    },
  },
);

interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export { Button, buttonVariants };
