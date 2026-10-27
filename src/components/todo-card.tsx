import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TodoList } from "@/components/todo-list";
import { Card, CardHeader } from "@/components/ui";
import { lastDays } from "@/lib/metrics";
import type { OpenTask } from "@/lib/projects";

/** Encart « À faire » : les prochaines tâches des chantiers, cochables sans quitter la page. Rien s'il n'y en a pas. */
export function TodoCard({ tasks, href, showBusiness = true }: { tasks: OpenTask[]; href: string; showBusiness?: boolean }) {
  if (!tasks.length) return null;
  return (
    <Card className="animate-rise [animation-delay:50ms]">
      <CardHeader
        title="À faire"
        action={
          <Link href={href} className="flex items-center gap-0.5 text-[13px] text-muted hover:text-text">
            Chantiers <ChevronRight className="size-4" />
          </Link>
        }
      />
      <div className="pt-2">
        <TodoList tasks={tasks} today={lastDays(1)[0]} showBusiness={showBusiness} />
      </div>
    </Card>
  );
}
