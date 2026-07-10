"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, X } from "lucide-react";
import { useMemo } from "react";

type ToastApi = {
  toast: (message: string) => void;
  toastError: (message: string) => void;
};

const SUCCESS_MS = 2200;
const ERROR_MS = 4500;

/** App-wide toasts, backed by Base UI Toast (correct aria-live announcement,
 * hover-to-pause, swipe-to-dismiss, focus management). The public API
 * (`ToastProvider` + `useToast`) is unchanged, so call sites are untouched. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="toast-wrap">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const isError = toast.type === "error";
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={`toast${isError ? " toast-error" : ""}`}
      >
        <span className="tk" aria-hidden="true">
          {isError ? <X size={16} /> : <Check size={16} />}
        </span>
        <Toast.Title />
      </Toast.Root>
    );
  });
}

export function useToast(): ToastApi {
  const manager = Toast.useToastManager();
  return useMemo<ToastApi>(
    () => ({
      toast: (message) => {
        manager.add({ title: message, timeout: SUCCESS_MS });
      },
      toastError: (message) => {
        manager.add({ title: message, type: "error", timeout: ERROR_MS });
      },
    }),
    [manager],
  );
}
