"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

function Spinner({ className, size = "md", ...props }: SpinnerProps) {
  const sizeClass = {
    sm: "size-3",
    md: "size-3.5",
    lg: "size-5",
  }[size];

  return (
    <div role="status" {...props}>
      <Loader2 className={cn("animate-spin", sizeClass, className)} />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export { Spinner };
