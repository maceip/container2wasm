import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  // Mavericks-style alert base
  "relative grid w-full items-start gap-x-2 gap-y-0.5 rounded-[4px] border px-3 py-2.5 text-[12px] has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*4)_1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-data-[slot=alert-action]:grid-cols-[1fr_auto] has-[>svg]:gap-x-2 [&>svg]:h-4 [&>svg]:w-4",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        // Default gray alert (light + dark)
        default:
          "bg-[linear-gradient(180deg,#f5f5f5_0%,#e8e8e8_100%)] border-[#c0c0c0] text-[#333] [&>svg]:text-[#666] dark:bg-[linear-gradient(180deg,#3a3a3a_0%,#2a2a2a_100%)] dark:border-[#555] dark:text-[#e8e8e8] dark:[&>svg]:text-[#999]",
        // Error/destructive alert (light + dark)
        error:
          "bg-[linear-gradient(180deg,#fff5f5_0%,#ffebee_100%)] border-[#ffcdd2] text-[#c62828] [&>svg]:text-[#e53935] dark:bg-[linear-gradient(180deg,#3a2020_0%,#2a1515_100%)] dark:border-[#5a2020] dark:text-[#ff8a80] dark:[&>svg]:text-[#ff6b6b]",
        // Info alert (light + dark)
        info:
          "bg-[linear-gradient(180deg,#f5f9ff_0%,#e3f2fd_100%)] border-[#bbdefb] text-[#1565c0] [&>svg]:text-[#1a82f7] dark:bg-[linear-gradient(180deg,#1a2a3a_0%,#152535_100%)] dark:border-[#1a4a6a] dark:text-[#7ac0ff] dark:[&>svg]:text-[#5a9ef5]",
        // Success alert (light + dark)
        success:
          "bg-[linear-gradient(180deg,#f5fff5_0%,#e8f5e9_100%)] border-[#c8e6c9] text-[#2e7d32] [&>svg]:text-[#34b534] dark:bg-[linear-gradient(180deg,#1a3a1a_0%,#152f15_100%)] dark:border-[#2a5a2a] dark:text-[#7adf7a] dark:[&>svg]:text-[#4ade80]",
        // Warning alert (light + dark)
        warning:
          "bg-[linear-gradient(180deg,#fffdf5_0%,#fff8e1_100%)] border-[#ffecb3] text-[#e65100] [&>svg]:text-[#ffa000] dark:bg-[linear-gradient(180deg,#3a3020_0%,#2f2515_100%)] dark:border-[#5a4a20] dark:text-[#ffca28] dark:[&>svg]:text-[#fbbf24]",
      },
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-semibold text-[12px] [svg~&]:col-start-2 dark:font-medium", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-[11px] opacity-90 [svg~&]:col-start-2 dark:opacity-80",
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex gap-1 max-sm:col-start-2 max-sm:mt-2 sm:row-start-1 sm:row-end-3 sm:self-center sm:[[data-slot=alert-description]~&]:col-start-2 sm:[[data-slot=alert-title]~&]:col-start-2 sm:[svg~&]:col-start-2 sm:[svg~[data-slot=alert-description]~&]:col-start-3 sm:[svg~[data-slot=alert-title]~&]:col-start-3",
        className,
      )}
      data-slot="alert-action"
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
