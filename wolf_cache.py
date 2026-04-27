"""
wolf_cache.py — Persistent JSON Disk Cache (Thread-Safe)
Cache-first architecture: API serves cached data instantly while background thread refreshes.
"""
import os
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import json
import threading
import datetime
from pathlib import Path

SCRIPT_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = SCRIPT_DIR / ".wolf_cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()

# ─── STATUS TRACKING ──────────────────────────────────────────────
_status = {
    "loaded": False,
    "processing": False,
    "last_update": None,
    "error": None,
    "issues_count": 0,
    "checklists_count": 0,
}


def get_status():
    """Returns the current system status dict (thread-safe copy)."""
    with _lock:
        return dict(_status)


def set_status(**kwargs):
    """Update status fields atomically. Only updates provided keys."""
    with _lock:
        for k, v in kwargs.items():
            if k in _status:
                _status[k] = v
        # Persist to disk
        try:
            _write_json(CACHE_DIR / "status.json", dict(_status))
        except Exception:
            pass


def _write_json(filepath, data):
    """Write JSON atomically: write to .tmp then rename. Catch Disk Full errors."""
    try:
        tmp = str(filepath) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, default=str)
        # Atomic rename (Windows: need to remove target first)
        if os.path.exists(str(filepath)):
            os.remove(str(filepath))
        os.rename(tmp, str(filepath))
    except (OSError, IOError) as e:
        import time, shutil
        time.sleep(0.5)
        shutil.copyfile(tmp, str(filepath))
        os.remove(tmp)
        print(f"⚠️ Erro de disco ao salvar cache (Pode ser falta de espaço): {e}")
        # Se falhou a escrita, não interrompemos o fluxo do programa
        pass


def _read_json(filepath):
    """Read JSON file, return None if missing/corrupt."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


# ─── CACHE READ/WRITE ─────────────────────────────────────────────

def save_cache(key, data):
    """Save aggregated data to disk cache (thread-safe)."""
    filepath = CACHE_DIR / f"{key}.json"
    envelope = {
        "timestamp": datetime.datetime.now().isoformat(),
        "data": data,
    }
    with _lock:
        _write_json(filepath, envelope)
    print(f"💾 Cache salvo: {key} ({filepath.name})")


def load_cache(key):
    """Load cached data from disk. Returns (data, timestamp) or (None, None)."""
    filepath = CACHE_DIR / f"{key}.json"
    with _lock:
        envelope = _read_json(filepath)
    if envelope and "data" in envelope:
        return envelope["data"], envelope.get("timestamp")
    return None, None


def has_cache(key):
    """Check if a cache file exists for this key."""
    return (CACHE_DIR / f"{key}.json").exists()


def cache_age_seconds(key):
    """Returns the age of the cache in seconds, or None if no cache."""
    filepath = CACHE_DIR / f"{key}.json"
    if not filepath.exists():
        return None
    try:
        mtime = filepath.stat().st_mtime
        return (datetime.datetime.now().timestamp() - mtime)
    except OSError:
        return None


def delete_cache(key):
    """Remove o cache. Retorna True se removeu, False se nao existia."""
    filepath = CACHE_DIR / f"{key}.json"
    with _lock:
        try:
            filepath.unlink()
            return True
        except FileNotFoundError:
            return False
        except OSError:
            return False


# ─── STARTUP: Restore status from disk if available ────────────────
def _restore_status_from_disk():
    """On import, try to restore the last-known status from disk."""
    disk_status = _read_json(CACHE_DIR / "status.json")
    if disk_status:
        for k in _status:
            if k in disk_status:
                _status[k] = disk_status[k]
        # Always start as not-processing (fresh boot)
        _status["processing"] = False
        # If we have cached data on disk, mark as loaded so frontend sees data immediately
        if has_cache("issues") or has_cache("checklists"):
            _status["loaded"] = True

_restore_status_from_disk()
