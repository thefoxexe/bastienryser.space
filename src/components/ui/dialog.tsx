"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "./button";

const CloseContext = createContext<() => void>(() => {});

/** Ferme la fenêtre parente (après un enregistrement réussi, par exemple). */
export const useCloseDialog = () => useContext(CloseContext);

/** Bouton qui ouvre une fenêtre centrée (feuille plein écran en bas sur téléphone). */
export function DialogButton({
  label,
  title,
  description,
  children,
  ...button
}: { label: ReactNode; title: string; description?: string; children: ReactNode } & Omit<ButtonProps, "children" | "onClick" | "title">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" {...button} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="animate-rise max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-[24px] sm:p-6"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
                {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid size-8 shrink-0 place-items-center rounded-full bg-fill text-muted hover:text-text" aria-label="Fermer">
                <X className="size-4" />
              </button>
            </div>
            <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
          </div>
        </div>
      ) : null}
    </>
  );
}
