import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LedgerEntry } from "@/lib/finance";

export type ProjectStatus = "active" | "paused" | "done";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type Project = {
  id: string;
  business_id: string;
  name: string;
  client: string | null;
  url: string | null;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  created_at: string;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  position: number;
  done_at: string | null;
  created_at: string;
};

export type ProjectFile = { id: string; name: string; size: number; mime: string | null; created_at: string; url: string | null };

export type ProjectSummary = Project & {
  tasks: { total: number; done: number; late: number; next: { title: string; due_date: string | null } | null };
  money: { income: number; expenses: number };
};

const PROJECT_COLUMNS = "id,business_id,name,client,url,description,status,due_date,created_at";
const TASK_COLUMNS = "id,project_id,title,notes,status,priority,due_date,position,done_at,created_at";

export const STATUS_LABEL: Record<ProjectStatus, string> = { active: "En cours", paused: "En pause", done: "Terminé" };
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Basse", normal: "Normale", high: "Haute" };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());

/** Chantiers d'un business, avec l'avancement des tâches et les montants liés (CHF). */
export async function listProjects(businessId: string): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("business_id", businessId).order("created_at", { ascending: false });
  const ids = (projects ?? []).map((p) => p.id);
  if (!ids.length) return [];
  const [{ data: tasks }, { data: entries }] = await Promise.all([
    supabase.from("project_tasks").select("project_id,title,status,due_date,position").in("project_id", ids).order("position"),
    supabase.from("ledger_entries").select("project_id,kind,amount").in("project_id", ids),
  ]);
  const now = today();
  return (projects as Project[]).map((p) => {
    const own = (tasks ?? []).filter((t) => t.project_id === p.id);
    const open = own.filter((t) => t.status !== "done");
    const dated = open.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
    const next = dated[0] ?? open[0] ?? null;
    const money = (entries ?? []).filter((e) => e.project_id === p.id);
    return {
      ...p,
      tasks: {
        total: own.length,
        done: own.length - open.length,
        late: open.filter((t) => t.due_date && t.due_date < now).length,
        next: next ? { title: next.title, due_date: next.due_date } : null,
      },
      money: {
        income: money.filter((e) => e.kind === "income").reduce((a, e) => a + Number(e.amount), 0),
        expenses: money.filter((e) => e.kind === "expense").reduce((a, e) => a + Number(e.amount), 0),
      },
    };
  });
}

export async function getProject(businessId: string, id: string) {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).eq("business_id", businessId).maybeSingle();
  if (!project) return null;
  const [{ data: tasks }, { data: files }, { data: linked }, { data: unlinked }] = await Promise.all([
    supabase.from("project_tasks").select(TASK_COLUMNS).eq("project_id", id).order("position").order("created_at"),
    supabase.from("project_files").select("id,name,size,mime,created_at,storage_path").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("ledger_entries").select("id,business_id,day,kind,amount,currency,label,category,reference").eq("project_id", id).order("day", { ascending: false }),
    supabase
      .from("ledger_entries")
      .select("id,business_id,day,kind,amount,currency,label,category,reference")
      .eq("business_id", businessId)
      .is("project_id", null)
      .order("day", { ascending: false })
      .limit(60),
  ]);
  const signed = files?.length
    ? (await supabase.storage.from("project-files").createSignedUrls(files.map((f) => f.storage_path), 3600, { download: true })).data ?? []
    : [];
  const num = (e: LedgerEntry) => ({ ...e, amount: Number(e.amount) });
  return {
    project: project as Project,
    tasks: (tasks ?? []) as ProjectTask[],
    files: (files ?? []).map((f, i): ProjectFile => ({ id: f.id, name: f.name, size: Number(f.size), mime: f.mime, created_at: f.created_at, url: signed[i]?.signedUrl ?? null })),
    entries: ((linked ?? []) as LedgerEntry[]).map(num),
    unlinked: ((unlinked ?? []) as LedgerEntry[]).map(num),
  };
}
