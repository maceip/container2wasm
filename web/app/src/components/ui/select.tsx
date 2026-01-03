"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default" | "lg";
}) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        // Mavericks-style select trigger (light + dark)
        "relative inline-flex w-full min-w-[120px] select-none items-center justify-between gap-2 rounded-[3px] border border-[#a0a0a0] text-left text-[12px] outline-none transition-all",
        "bg-[linear-gradient(180deg,#fefefe_0%,#f2f2f2_50%,#e0e0e0_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.1)]",
        "ring-[#1a82f7]/30 focus-visible:ring-2 focus-visible:border-[#1a82f7]",
        "aria-invalid:border-[#e53935] aria-invalid:ring-[#e53935]/20",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "hover:bg-[linear-gradient(180deg,#ffffff_0%,#f8f8f8_50%,#e8e8e8_100%)]",
        "data-pressed:bg-[linear-gradient(180deg,#e0e0e0_0%,#d0d0d0_100%)]",
        // Dark mode
        "dark:border-[#555] dark:bg-[linear-gradient(180deg,#4a4a4a_0%,#3a3a3a_50%,#2a2a2a_100%)]",
        "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_2px_rgba(0,0,0,0.2)]",
        "dark:ring-[#3a8ee8]/30 dark:focus-visible:border-[#3a8ee8]",
        "dark:hover:bg-[linear-gradient(180deg,#555_0%,#454545_50%,#353535_100%)]",
        "dark:data-pressed:bg-[linear-gradient(180deg,#3a3a3a_0%,#2a2a2a_100%)]",
        size === "default" && "h-[22px] px-2",
        size === "sm" && "h-[19px] px-1.5 text-[11px]",
        size === "lg" && "h-[26px] px-2.5 text-[13px]",
        "[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-[#666] dark:[&_svg]:text-[#999]",
        className,
      )}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon data-slot="select-icon">
        <ChevronsUpDownIcon className="-me-0.5 size-3 text-[#666]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn(
        "flex-1 truncate text-[#333] data-placeholder:text-[#999] dark:text-[#e8e8e8] dark:data-placeholder:text-[#666]",
        className,
      )}
      data-slot="select-value"
      {...props}
    />
  );
}

function SelectPopup({
  className,
  children,
  sideOffset = 2,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props & {
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
  alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-50 select-none"
        data-slot="select-positioner"
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className="origin-(--transform-origin) transition-[scale,opacity] has-data-[side=none]:scale-100 has-data-starting-style:scale-98 has-data-starting-style:opacity-0 has-data-[side=none]:transition-none"
          data-slot="select-popup"
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow
            className="top-0 z-50 flex h-5 w-full cursor-default items-center justify-center before:pointer-events-none before:absolute before:inset-x-px before:top-px before:h-[200%] before:rounded-t-[3px] before:bg-linear-to-b before:from-50% before:from-[#e8e8e8]"
            data-slot="select-scroll-up-arrow"
          >
            <ChevronUpIcon className="relative size-3 text-[#666]" />
          </SelectPrimitive.ScrollUpArrow>
          <span className="relative block h-full rounded-[4px] border border-[#808080] bg-[#e8e8e8] shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.5)] dark:border-[#555] dark:bg-[#2a2a2a] dark:shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]">
            <SelectPrimitive.List
              className={cn(
                "max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto p-[3px]",
                className,
              )}
              data-slot="select-list"
            >
              {children}
            </SelectPrimitive.List>
          </span>
          <SelectPrimitive.ScrollDownArrow
            className="bottom-0 z-50 flex h-5 w-full cursor-default items-center justify-center before:pointer-events-none before:absolute before:inset-x-px before:bottom-px before:h-[200%] before:rounded-b-[3px] before:bg-linear-to-t before:from-50% before:from-[#e8e8e8]"
            data-slot="select-scroll-down-arrow"
          >
            <ChevronDownIcon className="relative size-3 text-[#666]" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        // Mavericks-style select item (light + dark)
        "grid min-h-[22px] in-data-[side=none]:min-w-[calc(var(--anchor-width)+1rem)] cursor-default grid-cols-[14px_1fr] items-center gap-1.5 rounded-[3px] py-[2px] ps-1.5 pe-3 text-[12px] text-[#333] outline-none",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "data-highlighted:bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_100%)] data-highlighted:text-white",
        // Dark mode
        "dark:text-[#e8e8e8]",
        "dark:data-highlighted:bg-[linear-gradient(180deg,#5a9ee8_0%,#3a8ee8_100%)]",
        "[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="col-start-1">
        <svg
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText className="col-start-2 min-w-0">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("mx-1 my-1 h-px bg-[#c0c0c0] dark:bg-[#444]", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

function SelectGroup(props: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectGroupLabel(props: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className="px-1.5 py-1 font-semibold text-[#666] text-[10px] uppercase tracking-wide dark:text-[#999]"
      data-slot="select-group-label"
      {...props}
    />
  );
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectPopup as SelectContent,
  SelectItem,
  SelectSeparator,
  SelectGroup,
  SelectGroupLabel,
};
