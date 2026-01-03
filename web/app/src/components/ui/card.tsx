import type * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Mavericks-style card/window (light + dark)
        "relative flex flex-col rounded-[5px] border text-[#1a1a1a] overflow-hidden",
        "border-t-[#b0b0b0] border-l-[#8a8a8a] border-r-[#8a8a8a] border-b-[#808080]",
        "bg-[#e8e8e8]",
        "shadow-[0_15px_50px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.2)]",
        // Dark mode
        "dark:text-[#e8e8e8]",
        "dark:border-t-[#555] dark:border-l-[#444] dark:border-r-[#444] dark:border-b-[#333]",
        "dark:bg-[#2a2a2a]",
        "dark:shadow-[0_15px_50px_rgba(0,0,0,0.5),0_0_1px_rgba(0,0,0,0.3)]",
        className,
      )}
      data-slot="card"
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Mavericks-style title bar (light + dark)
        "flex items-center h-[22px] px-2",
        "bg-[linear-gradient(180deg,#e8e8e8_0%,#d3d3d3_50%,#c8c8c8_100%)]",
        "border-b border-[#a0a0a0]",
        // Dark mode
        "dark:bg-[linear-gradient(180deg,#3a3a3a_0%,#2d2d2d_50%,#252525_100%)]",
        "dark:border-b-[#1a1a1a]",
        className,
      )}
      data-slot="card-header"
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex-1 text-center text-[13px] font-normal text-[#4a4a4a] [text-shadow:0_1px_0_rgba(255,255,255,0.5)] dark:text-[#c0c0c0] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]",
        className,
      )}
      data-slot="card-title"
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-[#666] text-[11px] dark:text-[#999]", className)}
      data-slot="card-description"
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-[8px]", className)}
      data-slot="card-action"
      {...props}
    />
  );
}

function CardPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Mavericks-style content area (light + dark)
        "p-2 bg-[linear-gradient(180deg,#c8c8c8_0%,#d8d8d8_100%)]",
        "dark:bg-[linear-gradient(180deg,#252525_0%,#2d2d2d_100%)]",
        className,
      )}
      data-slot="card-content"
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Mavericks-style status bar (light + dark)
        "flex items-center px-2 py-1 text-[10px]",
        "bg-[linear-gradient(180deg,#d0d0d0_0%,#b8b8b8_100%)]",
        "border-t border-[#a0a0a0]",
        "text-[#555] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]",
        // Dark mode
        "dark:bg-[linear-gradient(180deg,#2d2d2d_0%,#1f1f1f_100%)]",
        "dark:border-t-[#1a1a1a]",
        "dark:text-[#999] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]",
        className,
      )}
      data-slot="card-footer"
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardPanel,
  CardPanel as CardContent,
};
