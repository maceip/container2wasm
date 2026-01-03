"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      className={cn(
        // Mavericks-style modal backdrop (light + dark)
        "fixed inset-0 z-50 bg-black/40 transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-black/60",
        className,
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  );
}

function DialogViewport({
  className,
  ...props
}: DialogPrimitive.Viewport.Props) {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
        className,
      )}
      data-slot="dialog-viewport"
      {...props}
    />
  );
}

function DialogPopup({
  className,
  children,
  showCloseButton = true,
  bottomStickOnMobile = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  bottomStickOnMobile?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport
        className={cn(
          bottomStickOnMobile && "max-sm:grid-rows-[1fr_auto] max-sm:pt-12",
        )}
      >
        <DialogPrimitive.Popup
          className={cn(
            // Mavericks-style dialog window (light + dark)
            "-translate-y-[calc(1.25rem*var(--nested-dialogs))] relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg scale-[calc(1-0.1*var(--nested-dialogs))] flex-col rounded-[5px] overflow-hidden",
            "border border-t-[#b0b0b0] border-l-[#8a8a8a] border-r-[#8a8a8a] border-b-[#808080]",
            "bg-[#e8e8e8] text-[#1a1a1a]",
            "shadow-[0_15px_50px_rgba(0,0,0,0.35),0_0_1px_rgba(0,0,0,0.2)]",
            "opacity-[calc(1-0.1*var(--nested-dialogs))] transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform",
            "data-nested:data-ending-style:translate-y-8 data-nested:data-starting-style:translate-y-8 data-nested-dialog-open:origin-top data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0",
            // Dark mode
            "dark:border-t-[#555] dark:border-l-[#444] dark:border-r-[#444] dark:border-b-[#333]",
            "dark:bg-[#2a2a2a] dark:text-[#e8e8e8]",
            "dark:shadow-[0_15px_50px_rgba(0,0,0,0.5),0_0_1px_rgba(0,0,0,0.3)]",
            bottomStickOnMobile &&
              "max-sm:rounded-none max-sm:border-x-0 max-sm:border-t max-sm:border-b-0 max-sm:opacity-[calc(1-min(var(--nested-dialogs),1))] max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4",
            className,
          )}
          data-slot="dialog-popup"
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute end-2 top-2"
              render={<Button size="icon" variant="ghost" />}
            >
              <XIcon />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogViewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        // Mavericks-style dialog header / title bar (light + dark)
        "flex flex-col gap-1 px-4 py-3",
        "bg-[linear-gradient(180deg,#e8e8e8_0%,#d3d3d3_50%,#c8c8c8_100%)]",
        "border-b border-[#a0a0a0]",
        "in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pb-2 max-sm:pb-3",
        // Dark mode
        "dark:bg-[linear-gradient(180deg,#3a3a3a_0%,#2d2d2d_50%,#252525_100%)]",
        "dark:border-b-[#1a1a1a]",
        className,
      )}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}) {
  return (
    <div
      className={cn(
        // Mavericks-style dialog footer (light + dark)
        "flex flex-col-reverse gap-2 px-4 sm:flex-row sm:justify-end",
        variant === "default" &&
          "py-3 bg-[linear-gradient(180deg,#d0d0d0_0%,#b8b8b8_100%)] border-t border-[#a0a0a0] dark:bg-[linear-gradient(180deg,#2d2d2d_0%,#1f1f1f_100%)] dark:border-t-[#1a1a1a]",
        variant === "bare" &&
          "in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pt-2 pt-3 pb-4",
        className,
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      className={cn(
        // Mavericks-style dialog title (light + dark)
        "text-center text-[13px] font-semibold text-[#333] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]",
        "dark:text-[#e8e8e8] dark:[text-shadow:0_1px_0_rgba(0,0,0,0.5)]",
        className,
      )}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn(
        // Mavericks-style dialog description (light + dark)
        "text-center text-[11px] text-[#666] dark:text-[#999]",
        className,
      )}
      data-slot="dialog-description"
      {...props}
    />
  );
}

function DialogPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <ScrollArea>
      <div
        className={cn(
          // Mavericks-style dialog content panel (light + dark)
          "px-4 py-3 bg-[linear-gradient(180deg,#c8c8c8_0%,#d8d8d8_100%)]",
          "in-[[data-slot=dialog-popup]:has([data-slot=dialog-header])]:pt-2",
          "in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-header]))]:pt-4",
          "in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-footer]))]:pb-4!",
          "in-[[data-slot=dialog-popup]:not(:has([data-slot=dialog-footer].border-t))]:pb-2",
          // Dark mode
          "dark:bg-[linear-gradient(180deg,#252525_0%,#2d2d2d_100%)]",
          className,
        )}
        data-slot="dialog-panel"
        {...props}
      />
    </ScrollArea>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogBackdrop as DialogOverlay,
  DialogPopup,
  DialogPopup as DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogViewport,
};
