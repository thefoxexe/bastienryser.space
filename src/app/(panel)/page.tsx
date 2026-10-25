import { Card } from "@/components/ui";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
      <Card>
        <p className="text-sm text-muted">Aucun business pour l&apos;instant. Ils arrivent à l&apos;étape suivante.</p>
      </Card>
    </div>
  );
}
