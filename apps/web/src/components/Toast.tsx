"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
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
      {typeof document !== "undefined" && items.length > 0
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
