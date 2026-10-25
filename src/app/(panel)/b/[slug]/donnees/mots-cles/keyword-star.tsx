import { Star } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { trackKeyword, untrackKeyword } from "../actions";

/** Étoile : suivre / ne plus suivre un mot-clé. */
export function KeywordStar({ query, tracked, businessId, slug }: { query: string; tracked: boolean; businessId: string; slug: string }) {
  return (
    <form action={tracked ? untrackKeyword : trackKeyword}>
      <input type="hidden" name="query" value={query} />
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        title={tracked ? "Ne plus suivre" : "Suivre ce mot-clé"}
        className="grid size-7 place-items-center rounded-full text-faint transition hover:bg-fill hover:text-text"
      >
        <Star className={cn("size-[15px]", tracked && "fill-ink text-ink")} />
        <span className="sr-only">{tracked ? "Ne plus suivre" : "Suivre"}</span>
      </button>
    </form>
  );
}
