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


def audio_of(url, workdir):
    """Télécharge l'audio puis le compresse (mono 16 kHz) : quelques Mo au plus, bien sous la limite de Whisper."""
    opts = {"quiet": True, "no_warnings": True, "format": "bestaudio/best", "outtmpl": os.path.join(workdir, "src.%(ext)s")}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    src = next(os.path.join(workdir, f) for f in os.listdir(workdir) if f.startswith("src."))
    out = os.path.join(workdir, "audio.mp3")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "16000", "-b:a", "48k", out], check=True)
    os.remove(src)
    with open(out, "rb") as f:
        data = f.read()
    os.remove(out)
    return data, info


def ingest(fields, data):
    return call(form={**fields, "action": "ingest", "audio": ("audio.mp3", data, "audio/mpeg")}, timeout=280)


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
                    data, _ = audio_of(v["url"], tmp)
                except Exception as e:
                    msg = f"@{handle} {v['external_id']} : téléchargement impossible ({str(e)[:200]})"
                    print(msg)
                    problems.append(msg)
                    continue
            result = ingest({"source_id": src["id"], **v}, data)
            print(f"@{handle} {v['external_id']} :", result)
            if result.get("ok"):
                sent += 0 if result.get("skipped") else 1
            else:
                problems.append(f"@{handle} {v['external_id']} : {result.get('error')}")
        call({"action": "checked", "source_id": src["id"]})

    for item in config.get("queued", []):
        with tempfile.TemporaryDirectory() as tmp:
            try:
                data, info = audio_of(item["url"], tmp)
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
        }, data)
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
