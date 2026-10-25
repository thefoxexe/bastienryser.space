"use client";

import { useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, FileText, GripVertical, ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/components/ui/cn";

export type MediaItem = {
  key: string;
  status: "uploading" | "ready" | "error";
  error?: string;
  storagePath: string | null;
  kind: "image" | "pdf";
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  previewUrl: string | null;
  name: string;
};

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function MediaPicker({
  items,
  onChange,
  onFiles,
}: {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    onChange(arrayMove(items, from, to));
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.key)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {items.map((item, index) => (
                <SortableTile key={item.key} item={item} index={index} onRemove={() => onChange(items.filter((i) => i.key !== item.key))} />
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="grid aspect-[4/5] w-full place-items-center rounded-xl border border-dashed border-border-strong text-muted transition hover:border-text hover:text-text"
                >
                  <span className="flex flex-col items-center gap-1 text-[12px]">
                    <ImagePlus className="size-5" />
                    Ajouter
                  </span>
                </button>
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onFiles([...e.dataTransfer.files]);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition",
            over ? "border-accent bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]" : "border-border-strong hover:border-text",
          )}
        >
          <span className="grid size-11 place-items-center rounded-xl border border-border bg-surface shadow-card">
            <ImagePlus className="size-5 text-muted" />
          </span>
          <span className="text-sm font-medium">Dépose tes images ici</span>
          <span className="max-w-xs text-[13px] text-muted">
            1 image = post simple, plusieurs = carrousel. Format conseillé 4:5 (1080 × 1350). PDF possible pour LinkedIn.
          </span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function SortableTile({ item, index, onRemove }: { item: MediaItem; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const ratio = item.width && item.height ? item.width / item.height : null;
  const offRatio = item.kind === "image" && ratio !== null && Math.abs(ratio - 0.8) > 0.03;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative", isDragging && "z-10 opacity-80")}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "relative aspect-[4/5] cursor-grab touch-none overflow-hidden rounded-xl border bg-surface-2 active:cursor-grabbing",
          item.status === "error" ? "border-danger" : "border-border",
          isDragging && "shadow-pop",
        )}
      >
        {item.kind === "image" && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-muted">
            <FileText className="size-7" />
            <span className="line-clamp-2 text-[11px]">{item.name}</span>
          </div>
        )}
        {item.status === "uploading" ? (
          <div className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[1px]">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        ) : null}
        {item.status === "error" ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-danger px-2 py-1 text-[11px] text-white">
            <AlertCircle className="size-3 shrink-0" />
            <span className="truncate">{item.error ?? "Erreur"}</span>
          </div>
        ) : null}
        <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-md bg-black/60 px-1 text-[11px] font-semibold text-white">
          {index + 1}
        </span>
        <GripVertical className="absolute bottom-1.5 left-1.5 size-4 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
        {offRatio && item.status === "ready" ? (
          <span
            title={`Ratio ${item.width}×${item.height} : Instagram recadrera. Conseillé 4:5 (1080 × 1350).`}
            className="absolute bottom-1.5 right-1.5 rounded-md bg-amber-500/90 px-1.5 text-[10px] font-semibold text-black"
          >
            {item.width}×{item.height}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-border bg-surface text-muted shadow-card transition hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="Retirer"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}
