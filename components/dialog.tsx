"use client";
import { useEffect, useRef } from "react";
export function Dialog({
  children,
  labelledBy,
  onClose,
  className = "",
}: {
  children: React.ReactNode;
  labelledBy: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal native-dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={onClose}
    >
      {children}
    </dialog>
  );
}
