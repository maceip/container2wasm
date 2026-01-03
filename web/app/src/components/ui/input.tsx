"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
};

function Input({
  className,
  size = "default",
  unstyled = false,
  ...props
}: InputProps) {
  return (
    <span
      className={
        cn(
          !unstyled &&
            // Mavericks-style input container (light + dark)
            "relative inline-flex w-full rounded-[3px] border border-[#a0a0a0] bg-white text-[12px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] ring-[#1a82f7]/30 transition-shadow has-focus-visible:border-[#1a82f7] has-focus-visible:ring-2 has-focus-visible:shadow-none has-disabled:opacity-50 has-disabled:bg-[#f5f5f5] has-aria-invalid:border-[#e53935] has-aria-invalid:ring-[#e53935]/20 dark:border-[#555] dark:bg-[#2a2a2a] dark:text-[#e8e8e8] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] dark:ring-[#3a8ee8]/30 dark:has-focus-visible:border-[#3a8ee8] dark:has-disabled:bg-[#1a1a1a]",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      <InputPrimitive
        className={cn(
          // Mavericks-style input field (light + dark)
          "w-full min-w-0 rounded-[inherit] bg-transparent px-2 outline-none placeholder:text-[#999] dark:placeholder:text-[#666]",
          size === "default" && "h-[22px] leading-[22px]",
          size === "sm" && "h-[19px] text-[11px] leading-[19px] px-1.5",
          size === "lg" && "h-[26px] text-[13px] leading-[26px] px-2.5",
          props.type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          props.type === "file" &&
            "text-[#666] file:me-2 file:bg-transparent file:font-normal file:text-[#333] file:text-[11px] dark:text-[#999] dark:file:text-[#ccc]",
        )}
        data-slot="input"
        size={typeof size === "number" ? size : undefined}
        {...props}
      />
    </span>
  );
}

export { Input, type InputProps };
