"""Veille TikTok, lancée toutes les heures par GitHub Actions.

Demande à l'Edge Function `veille` les comptes à surveiller, repère les nouvelles vidéos avec yt-dlp,
télécharge leur audio (compressé pour Whisper) et l'envoie à la fonction, qui retranscrit, explique
et publie dans Telegram. Aucune clé ici à part VEILLE_SECRET, qui ne sert qu'à parler à la fonction.
"""

import json
import os
import subprocess
import sys
import tempfile
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timezone

import yt_dlp

URL = os.environ.get("VEILLE_URL", "")
SECRET = os.environ.get("VEILLE_SECRET", "")
MAX_NEW_PER_SOURCE = 3  # au-delà, le reste attend le passage suivant


def call(payload=None, form=None, timeout=60):
    headers = {"x-veille-secret": SECRET}
    if form is not None:
        boundary = uuid.uuid4().hex
        body = b""
        for key, value in form.items():
            if isinstance(value, tuple):
                name, data, ctype = value
                body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b"\r\n"
            else:
                body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        body += f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    else:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code} {e.read()[:300].decode(errors='replace')}"}
    except Exception as e:  # réseau coupé, délai dépassé…
        return {"ok": False, "error": f"Fonction injoignable ({str(e)[:200]})"}


def latest(handle):
    opts = {"quiet": True, "no_warnings": True, "extract_flat": "in_playlist", "playlistend": 8}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.tiktok.com/@{handle}", download=False)
    out = []
    for e in info.get("entries") or []:
        vid = str(e.get("id") or "")
        if not vid:
            continue
        ts = e.get("timestamp")
        out.append({
            "external_id": vid,
            "url": e.get("url") or f"https://www.tiktok.com/@{handle}/video/{vid}",
            "title": (e.get("title") or e.get("description") or "")[:500],
            "posted_at": datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else "",
        })
    return out  # du plus récent au plus ancien


def media_of(url, workdir):
    """Télécharge la vidéo (720p au plus), puis en tire l'audio compressé (mono 16 kHz, pour Whisper)
    et une image du haut de l'écran agrandie (le bandeau où le compte indique la catégorie)."""
    opts = {"quiet": True, "no_warnings": True, "format": "best[height<=720]/best", "outtmpl": os.path.join(workdir, "src.%(ext)s")}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    src = next(os.path.join(workdir, f) for f in os.listdir(workdir) if f.startswith("src."))
    audio = os.path.join(workdir, "audio.mp3")
    frame = os.path.join(workdir, "frame.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio], check=True)
    # Image à 2 s : le tiers haut, doublé en taille pour que le petit texte du bandeau soit lisible.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2", "-i", src, "-frames:v", "1", "-vf", "crop=iw:ih/3:0:0,scale=iw*2:-2", "-q:v", "3", frame], check=False)
    with open(audio, "rb") as f:
        audio_bytes = f.read()
    frame_bytes = b""
    if os.path.exists(frame):
        with open(frame, "rb") as f:
            frame_bytes = f.read()
    return audio_bytes, frame_bytes, info


def ingest(fields, media):
    audio, frame, _ = media
    form = {**fields, "action": "ingest", "audio": ("audio.mp3", audio, "audio/mpeg")}
    if frame:
        form["frame"] = ("frame.jpg", frame, "image/jpeg")
    return call(form=form, timeout=280)


def main():
    if not URL or not SECRET:
        print("VEILLE_URL ou VEILLE_SECRET manquant : rien à faire.")
        return 0
    config = call({"action": "config"})
    if config.get("error"):
        print("Configuration illisible :", config["error"])
        return 1
    problems, sent = [], 0

    for src in config.get("sources", []):
        handle = src["handle"]
        try:
            videos = latest(handle)
        except Exception as e:  # yt-dlp lève des erreurs variées
            msg = f"@{handle} : liste des vidéos impossible ({str(e)[:200]})"
            print(msg)
            problems.append(msg)
            call({"action": "checked", "source_id": src["id"], "error": msg})
            continue
        known = set(src.get("known", []))
        fresh = [v for v in videos if v["external_id"] not in known]
        if src.get("baseline") and fresh:
            # Premier passage : seule la vidéo la plus récente est envoyée, les plus anciennes sont marquées comme vues.
            call({"action": "seen", "source_id": src["id"], "items": fresh[1:]})
            fresh = fresh[:1]
        for v in list(reversed(fresh))[:MAX_NEW_PER_SOURCE]:  # du plus ancien au plus récent
            with tempfile.TemporaryDirectory() as tmp:
                try:
                    media = media_of(v["url"], tmp)
                except Exception as e:
                    msg = f"@{handle} {v['external_id']} : téléchargement impossible ({str(e)[:200]})"
                    print(msg)
                    problems.append(msg)
                    continue
            result = ingest({"source_id": src["id"], **v}, media)
            print(f"@{handle} {v['external_id']} :", result)
            if result.get("ok"):
                sent += 0 if result.get("skipped") else 1
            else:
                problems.append(f"@{handle} {v['external_id']} : {result.get('error')}")
        call({"action": "checked", "source_id": src["id"]})

    for item in config.get("queued", []):
        with tempfile.TemporaryDirectory() as tmp:
            try:
                media = media_of(item["url"], tmp)
                info = media[2]
            except Exception as e:
                msg = f"Lien {item['url']} : téléchargement impossible ({str(e)[:200]})"
                print(msg)
                problems.append(msg)
                call({"action": "queued_failed", "item_id": item["id"], "error": msg})
                continue
        ts = info.get("timestamp")
        result = ingest({
            "item_id": item["id"],
            "external_id": str(info.get("id") or ""),
            "url": item["url"],
            "title": (info.get("title") or info.get("description") or "")[:500],
            "posted_at": datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else "",
        }, media)
        print("Lien", item["url"], ":", result)
        if result.get("ok"):
            sent += 1
        else:
            problems.append(f"Lien {item['url']} : {result.get('error')}")

    detail = f"{sent} vidéo(s) envoyée(s)" + (f" · {len(problems)} problème(s) : " + " | ".join(problems) if problems else "")
    call({"action": "run_end", "ok": not problems, "detail": detail})
    print(detail)
    return 0


if __name__ == "__main__":
    sys.exit(main())
