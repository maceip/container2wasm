"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

type TabsVariant = "default" | "underline" | "mavericks";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        "flex flex-col data-[orientation=vertical]:flex-row",
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsList({
  variant = "default",
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant;
}) {
  return (
    <TabsPrimitive.List
      className={cn(
        "relative z-0 flex w-full items-center text-muted-foreground",
        "data-[orientation=vertical]:flex-col",
        // Mavericks Finder-style tab bar (light + dark)
        variant === "mavericks"
          ? "bg-[linear-gradient(180deg,#a0a0a0_0%,#888888_100%)] border-b border-[rgba(0,0,0,0.3)] p-0 gap-0 dark:bg-[linear-gradient(180deg,#3a3a3a_0%,#2a2a2a_100%)] dark:border-b-[rgba(0,0,0,0.5)]"
          : variant === "default"
          ? "rounded-lg bg-muted p-0.5 text-muted-foreground/72 gap-x-0.5 w-fit"
          : "data-[orientation=vertical]:px-1 data-[orientation=horizontal]:py-1 *:data-[slot=tabs-trigger]:hover:bg-accent gap-x-0.5 w-fit",
        className,
      )}
      data-slot="tabs-list"
      data-variant={variant}
      {...props}
    >
      {children}
      {/* Only show indicator for non-mavericks variants */}
      {variant !== "mavericks" && (
        <TabsPrimitive.Indicator
          className={cn(
            "-translate-y-(--active-tab-bottom) absolute bottom-0 left-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) transition-[width,translate] duration-200 ease-in-out",
            variant === "underline"
              ? "data-[orientation=vertical]:-translate-x-px z-10 bg-primary data-[orientation=horizontal]:h-0.5 data-[orientation=vertical]:w-0.5 data-[orientation=horizontal]:translate-y-px"
              : "-z-1 rounded-md bg-background shadow-sm dark:bg-accent",
          )}
          data-slot="tab-indicator"
        />
      )}
    </TabsPrimitive.List>
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        // Base styles
        "flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap outline-none transition-all",
        // Check if parent has mavericks variant via group (light mode)
        "group-data-[variant=mavericks]:relative",
        "group-data-[variant=mavericks]:py-[6px] group-data-[variant=mavericks]:px-6",
        "group-data-[variant=mavericks]:text-[11px] group-data-[variant=mavericks]:font-medium",
        "group-data-[variant=mavericks]:text-[#333]",
        "group-data-[variant=mavericks]:[text-shadow:0_1px_0_rgba(255,255,255,0.3)]",
        "group-data-[variant=mavericks]:bg-[linear-gradient(180deg,#9a9a9a_0%,#7a7a7a_100%)]",
        "group-data-[variant=mavericks]:border-none",
        "group-data-[variant=mavericks]:[clip-path:polygon(8px_0%,calc(100%-8px)_0%,100%_100%,0%_100%)]",
        "group-data-[variant=mavericks]:-ml-1",
        "group-data-[variant=mavericks]:first:-ml-0",
        "group-data-[variant=mavericks]:first:[clip-path:polygon(0%_0%,calc(100%-8px)_0%,100%_100%,0%_100%)]",
        "group-data-[variant=mavericks]:hover:bg-[linear-gradient(180deg,#a8a8a8_0%,#888888_100%)]",
        // Active state for mavericks (light)
        "group-data-[variant=mavericks]:data-selected:bg-[linear-gradient(180deg,#e8e8e8_0%,#d0d0d0_100%)]",
        "group-data-[variant=mavericks]:data-selected:text-[#1a1a1a]",
        "group-data-[variant=mavericks]:data-selected:[text-shadow:0_1px_0_rgba(255,255,255,0.7)]",
        "group-data-[variant=mavericks]:data-selected:z-10",
        "group-data-[variant=mavericks]:data-selected:shadow-[inset_0_-1px_0_rgba(255,255,255,0.5),1px_0_2px_rgba(0,0,0,0.1),-1px_0_2px_rgba(0,0,0,0.1)]",
        // Dark mode for mavericks tabs
        "dark:group-data-[variant=mavericks]:text-[#999]",
        "dark:group-data-[variant=mavericks]:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]",
        "dark:group-data-[variant=mavericks]:bg-[linear-gradient(180deg,#333_0%,#252525_100%)]",
        "dark:group-data-[variant=mavericks]:hover:bg-[linear-gradient(180deg,#3a3a3a_0%,#2d2d2d_100%)]",
        // Dark mode active state for mavericks
        "dark:group-data-[variant=mavericks]:data-selected:bg-[linear-gradient(180deg,#4a4a4a_0%,#3a3a3a_100%)]",
        "dark:group-data-[variant=mavericks]:data-selected:text-[#e8e8e8]",
        "dark:group-data-[variant=mavericks]:data-selected:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]",
        "dark:group-data-[variant=mavericks]:data-selected:shadow-[inset_0_-1px_0_rgba(255,255,255,0.1),1px_0_2px_rgba(0,0,0,0.2),-1px_0_2px_rgba(0,0,0,0.2)]",
        // Default variant styles
        "not-group-data-[variant=mavericks]:rounded-md not-group-data-[variant=mavericks]:border not-group-data-[variant=mavericks]:border-transparent not-group-data-[variant=mavericks]:font-medium not-group-data-[variant=mavericks]:text-base sm:not-group-data-[variant=mavericks]:text-sm",
        "not-group-data-[variant=mavericks]:hover:text-muted-foreground not-group-data-[variant=mavericks]:data-selected:text-foreground",
        "not-group-data-[variant=mavericks]:h-9 not-group-data-[variant=mavericks]:gap-1.5 not-group-data-[variant=mavericks]:px-[calc(--spacing(2.5)-1px)] sm:not-group-data-[variant=mavericks]:h-8",
        "not-group-data-[variant=mavericks]:data-[orientation=vertical]:w-full not-group-data-[variant=mavericks]:data-[orientation=vertical]:justify-start",
        // Icons
        "[&_svg]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        "focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-64",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsTab as TabsTrigger,
  TabsPanel,
  TabsPanel as TabsContent,
};
