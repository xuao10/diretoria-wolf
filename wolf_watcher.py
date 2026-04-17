"""
wolf_watcher.py — Cloud Mode (No File Monitoring)
In cloud mode, the watcher only refreshes cached data from Google Sheets periodically.
File monitoring is disabled as there's no local Drive access.
"""
import os
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import time
import threading
import datetime

import wolf_cache

_watcher_thread = None
_watcher_running = False

CLOUD_MODE = os.environ.get('WOLF_CLOUD_MODE', '0') == '1'


def trigger_cache_refresh():
    """Called periodically to update the memory & disk cache from Google Sheets."""
    print("🔄 [WATCHER] Atualizando cache global em background...")
    try:
        import dashboard_api
        
        with dashboard_api.app.app_context():
            issues_res = dashboard_api.get_issues(bypass_cache=True)
            checklists_res = dashboard_api.get_checklists(bypass_cache=True)
            
            try:
                i_count = len(issues_res.json.get('data', [])) if issues_res.json else 0
                c_count = len(checklists_res.json.get('summary_logs', [])) if checklists_res.json else 0
                
                wolf_cache.set_status(
                    last_update=datetime.datetime.now().isoformat(),
                    issues_count=i_count,
                    checklists_count=c_count
                )
                print(f"✅ [WATCHER] Cache atualizado ({i_count} issues, {c_count} checklists)")
            except Exception as e:
                print(f"⚠️ [WATCHER] Erro ao extrair count do cache: {e}")
                
    except Exception as e:
        print(f"❌ [WATCHER] Falha ao atualizar cache: {e}")


def _watcher_loop():
    global _watcher_running
    print("🐺 [WATCHER] Thread iniciada (CLOUD MODE - sem file monitoring).")
    
    # Initial cache load
    if not wolf_cache.has_cache("issues") or not wolf_cache.has_cache("checklists"):
        wolf_cache.set_status(processing=True)
        trigger_cache_refresh()
        wolf_cache.set_status(processing=False, loaded=True)
    else:
        wolf_cache.set_status(loaded=True, processing=False)

    # Polling loop - refresh every 5 minutes
    REFRESH_INTERVAL = 300  # 5 minutes
    while _watcher_running:
        try:
            wolf_cache.set_status(processing=True)
            trigger_cache_refresh()
            wolf_cache.set_status(processing=False)
        except Exception as e:
            print(f"⚠️ [WATCHER] Erro não tratado: {e}")
            wolf_cache.set_status(processing=False, error=str(e))
            
        # Sleep in small chunks for responsive shutdown
        for _ in range(REFRESH_INTERVAL):
            if not _watcher_running:
                break
            time.sleep(1)


def start():
    """Start the background watcher thread."""
    global _watcher_thread, _watcher_running
    if _watcher_thread and _watcher_thread.is_alive():
        print("⚠️ [WATCHER] Já está rodando.")
        return
        
    _watcher_running = True
    _watcher_thread = threading.Thread(target=_watcher_loop, daemon=True, name="WolfWatcher")
    _watcher_thread.start()


def stop():
    """Stop the background watcher thread."""
    global _watcher_running
    print("🛑 [WATCHER] Parando thread...")
    _watcher_running = False
