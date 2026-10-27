import { Sparkles } from "lucide-react";
import { DialogButton } from "@/components/ui/dialog";
import { AiImport } from "./[id]/ai-import";
import type { BusinessChoice } from "./project-form";

/** « Depuis une séance » : dépose la transcription, l'IA prépare le chantier et ses tâches. */
export function FromMeeting(props: { businessId: string; slug: string } | { businesses: BusinessChoice[] }) {
  return (
    <DialogButton
      size="sm"
      variant="secondary"
      label={
        <>
          <Sparkles /> Depuis une séance
        </>
      }
      title="Nouveau chantier depuis une séance"
      description="Dépose la transcription (TurboScribe, .txt) ou un compte rendu : l'IA prépare le chantier, ses tâches et un compte rendu propre."
    >
      {"businesses" in props ? <AiImport businesses={props.businesses} /> : <AiImport businessId={props.businessId} slug={props.slug} />}
    </DialogButton>
  );
}
