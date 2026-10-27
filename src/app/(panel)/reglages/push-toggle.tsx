"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { getPushKey, removePushSubscription, savePushSubscription, sendTestPush } from "./push-actions";

type State = "loading" | "unsupported" | "ios-browser" | "denied" | "off" | "on";

const toKey = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function report(res: Awaited<ReturnType<typeof sendTestPush>>) {
  if ("error" in res) return res.error;
  if (res.sent) return `Envoyée à ${res.sent} appareil${res.sent > 1 ? "s" : ""}.`;
  return res.errors.length ? `Envoi refusé par le service de notifications : ${res.errors[0]}` : "Aucun appareil enregistré : désactive puis réactive.";
}

/** Active les notifications push sur cet appareil (app installée ou navigateur). */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(ios && !standalone ? "ios-browser" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      // L'appareil est abonné : on s'assure que le serveur le connaît (il a pu l'oublier).
      if (sub) await savePushSubscription(sub.toJSON(), navigator.userAgent);
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMessage(null);
      // La demande d'autorisation doit partir du clic.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const key = await getPushKey();
      if ("error" in key) return setMessage(key.error);
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      try {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key.publicKey) });
        const saved = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (!saved.ok) return setMessage(saved.error);
        setState("on");
        const test = await sendTestPush();
        setMessage(report(test));
      } catch {
        setMessage("Le navigateur a refusé l'abonnement. Sur Brave : Réglages › Confidentialité › activer « Utiliser les services Google pour les notifications push ».");
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMessage(null);
    });

  const test = () =>
    start(async () => {
      setMessage(report(await sendTestPush()));
    });

  return (
    <div className="flex flex-col gap-3">
      {state === "loading" ? null : state === "ios-browser" ? (
        <p className="text-[13px] text-muted">Sur iPhone, ajoute d&apos;abord le panel à l&apos;écran d&apos;accueil (Partager › Sur l&apos;écran d&apos;accueil), puis ouvre-le depuis l&apos;icône pour activer les notifications.</p>
      ) : state === "unsupported" ? (
        <p className="text-[13px] text-muted">Ce navigateur ne gère pas les notifications push.</p>
      ) : state === "denied" ? (
        <p className="text-[13px] text-muted">Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (icône à gauche de l&apos;adresse), puis recharge la page.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {state === "on" ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={test} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Bell />} Envoyer un essai
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={disable} disabled={pending}>
                <BellOff /> Désactiver sur cet appareil
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={enable} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Bell />} Activer sur cet appareil
            </Button>
          )}
        </div>
      )}
      {message ? <p className="text-[13px] text-muted">{message}</p> : null}
    </div>
  );
}
