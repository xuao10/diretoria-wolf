"""Debug: Show all custom_item_id=1004 tasks (likely the 'tarefa' type to remove)."""
import os, json
from datetime import datetime
from dotenv import load_dotenv
import clickup_sync

env_path = os.path.join(os.path.dirname(__file__), 'wolf_factory.env')
load_dotenv(env_path)

VIEW_ID = os.environ.get("CLICKUP_CURRENT_SPRINT_VIEW_ID")
tasks = clickup_sync.fetch_view_tasks(VIEW_ID)

parent_ids = {t.get('parent') for t in tasks if t.get('parent') is not None}

print("=== ALL custom_item_id=1004 TASKS ===")
done_pts = 0
for t in tasks:
    cii = t.get('custom_item_id')
    if cii == 1004:
        status = t.get('status', {}).get('status', '')
        status_type = t.get('status', {}).get('type', '')
        pts = t.get('points') or 0
        is_parent = t.get('id') in parent_ids
        has_parent = t.get('parent') is not None
        assignees = [a.get('username', '') for a in t.get('assignees', [])]
        is_done = status_type in ('closed', 'done')
        if is_done:
            done_pts += pts
        print(f"  {'✓' if is_done else ' '} pts={pts:<4} is_parent={is_parent}  status={status:<20} {', '.join(assignees):<25} {t.get('name')[:60]}")

print(f"\nTotal 1004 done points: {done_pts}")

# Also check: which of these have subtasks?
print("\n=== 1004 TASKS THAT ARE PARENTS (have subtasks) ===")
for t in tasks:
    cii = t.get('custom_item_id')
    if cii == 1004 and t.get('id') in parent_ids:
        subtask_count = sum(1 for st in tasks if st.get('parent') == t.get('id'))
        pts = t.get('points') or 0
        status = t.get('status', {}).get('status', '')
        print(f"  pts={pts:<4} subs={subtask_count}  status={status:<15} {t.get('name')[:60]}")
