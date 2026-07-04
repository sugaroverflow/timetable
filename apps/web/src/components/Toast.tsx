"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

type ToastKind = "success" | "error";
type ToastItem = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  toast: (message: string) => void;
  toastError: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const SUCCESS_MS = 2200;
const ERROR_MS = 4500;

const emptySubscribe = () => () => {};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  // Portal only after hydration: the server renders nothing here, so
  // rendering the portal during the hydration pass is a mismatch React drops.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(
      () => setItems((prev) => prev.filter((t) => t.id !== id)),
      kind === "error" ? ERROR_MS : SUCCESS_MS,
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast: (message) => push("success", message),
      toastError: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The live region must exist BEFORE a toast arrives or most screen
          readers won't announce it — keep the container mounted permanently
          and only toggle its children. */}
      {mounted
        ? createPortal(
            <div className="toast-wrap" role="status" aria-live="polite">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={`toast${t.kind === "error" ? " toast-error" : ""}`}
                >
                  <span className="tk">{t.kind === "error" ? "✕" : "✓"}</span>
                  {t.message}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
