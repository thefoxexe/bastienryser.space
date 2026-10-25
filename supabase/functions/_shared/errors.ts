/** Erreur renvoyée par un réseau, avec un message en français compréhensible. */
export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly authProblem = false,
    public readonly detail?: string,
  ) {
    super(message);
  }
}

type MetaErrorBody = { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } };

export function metaError(status: number, body: MetaErrorBody): NetworkError {
  const e = body.error ?? {};
  const code = e.code ?? 0;
  const detail = `Meta ${status} code ${code}/${e.error_subcode ?? "-"} : ${e.message ?? "?"}`;
  if (code === 190 || code === 102 || e.error_subcode === 463 || e.error_subcode === 460) {
    return new NetworkError("La connexion Meta a expiré ou a été révoquée. Reconnecte le compte dans « Comptes connectés ».", false, true, detail);
  }
  if (code === 10 || code === 200 || (code >= 200 && code < 300)) {
    return new NetworkError("Permission manquante côté Meta. Reconnecte le compte en acceptant toutes les autorisations demandées.", false, true, detail);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || e.is_transient) {
    return new NetworkError("Meta limite temporairement les publications. Nouvel essai automatique dans quelques minutes.", true, false, detail);
  }
  if (code === 9004 || code === 36003 || e.error_subcode === 2207052) {
    return new NetworkError("Instagram n'a pas pu télécharger l'image. Vérifie le format (JPEG) et le ratio (entre 4:5 et 1.91:1).", false, false, detail);
  }
  if (code === 25 || code === 36000 || e.error_subcode === 2207026) {
    return new NetworkError("Format d'image refusé par Instagram (ratio entre 4:5 et 1.91:1, JPEG, 8 Mo max).", false, false, detail);
  }
  if (code === 9007 || e.error_subcode === 2207027) {
    return new NetworkError("Instagram traite encore les images. Nouvel essai automatique.", true, false, detail);
  }
  if (status >= 500) {
    return new NetworkError("Meta ne répond pas correctement pour le moment. Nouvel essai automatique.", true, false, detail);
  }
  return new NetworkError(e.error_user_msg || `Meta a refusé la publication : ${e.message ?? "erreur inconnue"}`, false, false, detail);
}

export function linkedinError(status: number, body: { message?: string; serviceErrorCode?: number; code?: string }): NetworkError {
  const detail = `LinkedIn ${status} ${body.serviceErrorCode ?? ""} ${body.code ?? ""} : ${body.message ?? "?"}`;
  if (status === 401) {
    return new NetworkError("La connexion LinkedIn a expiré. Reconnecte le compte dans « Comptes connectés ».", false, true, detail);
  }
  if (status === 403) {
    return new NetworkError("LinkedIn refuse l'accès (permission manquante pour ce compte ou cette page).", false, true, detail);
  }
  if (status === 429) {
    return new NetworkError("LinkedIn limite temporairement les publications. Nouvel essai automatique.", true, false, detail);
  }
  if (status === 422 && /duplicate/i.test(body.message ?? "")) {
    return new NetworkError("LinkedIn refuse un post identique à un post récent.", false, false, detail);
  }
  if (status >= 500) {
    return new NetworkError("LinkedIn ne répond pas correctement pour le moment. Nouvel essai automatique.", true, false, detail);
  }
  return new NetworkError(`LinkedIn a refusé la publication : ${body.message ?? "erreur inconnue"}`, false, false, detail);
}

export function asNetworkError(e: unknown): NetworkError {
  if (e instanceof NetworkError) return e;
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return new NetworkError("Le réseau a mis trop de temps à répondre. Nouvel essai automatique.", true, false, String(e));
  }
  if (e instanceof TypeError) {
    return new NetworkError("Connexion au réseau impossible. Nouvel essai automatique.", true, false, String(e));
  }
  return new NetworkError("Erreur inattendue pendant la publication.", true, false, e instanceof Error ? e.message : String(e));
}
