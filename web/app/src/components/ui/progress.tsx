"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  children,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      className={cn("flex w-full flex-col gap-1", className)}
      data-slot="progress"
      {...props}
    >
      {children ? (
        children
      ) : (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      className={cn("font-medium text-[11px] text-[#333] [text-shadow:0_1px_0_rgba(255,255,255,0.5)] dark:text-[#e8e8e8] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        // Mavericks-style progress track (light + dark)
        "block h-[16px] w-full overflow-hidden rounded-[3px] border border-[#a0a0a0]",
        "bg-[linear-gradient(180deg,#c8c8c8_0%,#e0e0e0_100%)]",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]",
        // Dark mode
        "dark:border-[#555] dark:bg-[linear-gradient(180deg,#2a2a2a_0%,#3a3a3a_100%)]",
        "dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      className={cn(
        // Mavericks-style blue progress indicator (light + dark)
        "h-full transition-all duration-300",
        "bg-[linear-gradient(180deg,#6cb3fa_0%,#1a82f7_50%,#166ee1_100%)]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]",
        // Dark mode
        "dark:bg-[linear-gradient(180deg,#5a9ee8_0%,#3a8ee8_50%,#2a7ed8_100%)]",
        "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
        className,
      )}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      className={cn("text-[11px] text-[#333] tabular-nums [text-shadow:0_1px_0_rgba(255,255,255,0.5)] dark:text-[#e8e8e8] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export {
  Progress,
  ProgressLabel,
  ProgressTrack,
  ProgressIndicator,
  ProgressValue,
};
