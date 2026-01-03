"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // Mavericks-style switch (light + dark)
        "group/switch inline-flex h-[18px] w-[36px] shrink-0 items-center rounded-full p-[2px] outline-none transition-all border",
        "shadow-[inset_0_1px_3px_rgba(0,0,0,0.2),0_1px_0_rgba(255,255,255,0.8)]",
        "ring-[#1a82f7]/30 focus-visible:ring-2",
        // Unchecked state - gray track
        "data-unchecked:bg-[linear-gradient(180deg,#c8c8c8_0%,#d8d8d8_100%)] data-unchecked:border-[#a0a0a0]",
        // Checked state - blue track
        "data-checked:bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_100%)] data-checked:border-[#1461b8]",
        "data-disabled:opacity-50",
        // Dark mode
        "dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4),0_1px_0_rgba(255,255,255,0.1)]",
        "dark:ring-[#3a8ee8]/30",
        "dark:data-unchecked:bg-[linear-gradient(180deg,#3a3a3a_0%,#2a2a2a_100%)] dark:data-unchecked:border-[#555]",
        "dark:data-checked:bg-[linear-gradient(180deg,#5a9ee8_0%,#3a8ee8_100%)] dark:data-checked:border-[#1a5aaa]",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // Mavericks-style thumb (light + dark)
          "pointer-events-none block size-[14px] rounded-full transition-[translate,width]",
          "bg-[linear-gradient(180deg,#ffffff_0%,#e8e8e8_100%)]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,1)]",
          "border border-[#a0a0a0]",
          "data-checked:translate-x-[18px] data-unchecked:translate-x-0",
          "group-active/switch:not-data-disabled:w-[16px]",
          "data-checked:group-active/switch:translate-x-[16px]",
          // Dark mode thumb
          "dark:bg-[linear-gradient(180deg,#e8e8e8_0%,#c8c8c8_100%)]",
          "dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.5)]",
          "dark:border-[#666]",
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
