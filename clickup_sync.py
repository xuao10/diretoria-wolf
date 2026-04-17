import os
import urllib.request
import json
import traceback
import unicodedata
import sys
import concurrent.futures
from datetime import datetime, timedelta
from dotenv import load_dotenv

try:
    import wolf_cache as _wolf_cache
except Exception:
    _wolf_cache = None

HISTORICAL_SPRINT_TTL = int(os.environ.get("CLICKUP_HIST_SPRINT_TTL", 86400))  # 24h
HISTORICAL_PARALLELISM = int(os.environ.get("CLICKUP_HIST_PARALLELISM", 6))

env_path = os.path.join(os.path.dirname(__file__), 'wolf_factory.env')
load_dotenv(env_path)

CLICKUP_TOKEN = os.environ.get("CLICKUP_API_TOKEN")
TEAM_ID = os.environ.get("CLICKUP_TEAM_ID", "31160754")

# Sprints históricos: IDs e labels em paralelo
SPRINT_IDS = [s.strip() for s in os.environ.get("CLICKUP_SPRINT_IDS", "").split(",") if s.strip()]
_sprint_labels_raw = [s.strip() for s in os.environ.get("CLICKUP_SPRINT_LABELS", "").split(",") if s.strip()]
SPRINT_LABEL_MAP = dict(zip(SPRINT_IDS, _sprint_labels_raw))  # {sprint_id: "Sprint N"}

# Sprint atual
CURRENT_SPRINT_ID = os.environ.get("CLICKUP_CURRENT_SPRINT_ID")
CURRENT_SPRINT_LABEL = os.environ.get("CLICKUP_CURRENT_SPRINT_LABEL", "Sprint Atual")
CURRENT_SPRINT_VIEW_ID = os.environ.get("CLICKUP_CURRENT_SPRINT_VIEW_ID")
CURRENT_SPRINT_START_DATE = os.environ.get("CLICKUP_CURRENT_SPRINT_START_DATE")  # e.g. "2026-03-30"
# Capacity override for shortened sprints (holidays). Values replace hours_week for current sprint.
# Format: "40:32,20:16" means 40h pilots → 32h, 20h pilots → 16h
_hours_override_raw = os.environ.get("CLICKUP_CURRENT_SPRINT_HOURS_OVERRIDE", "")
CURRENT_SPRINT_HOURS_OVERRIDE = {}  # {original_hours: adjusted_hours}
for _pair in _hours_override_raw.split(","):
    if ":" in _pair:
        _orig, _adj = _pair.strip().split(":", 1)
        try:
            CURRENT_SPRINT_HOURS_OVERRIDE[int(_orig)] = int(_adj)
        except ValueError:
            pass
# Sprint holidays (comma-separated dates "YYYY-MM-DD") — subtracted from business day count
_holidays_raw = os.environ.get("CLICKUP_CURRENT_SPRINT_HOLIDAYS", "")
CURRENT_SPRINT_HOLIDAYS = set()
for _hd in _holidays_raw.split(","):
    _hd = _hd.strip()
    if _hd:
        try:
            from datetime import date as _date
            CURRENT_SPRINT_HOLIDAYS.add(_date.fromisoformat(_hd))
        except ValueError:
            pass

# Monta o mapa de view IDs dinamicamente a partir das env vars CLICKUP_SPRINT{N}_VIEW_ID
SPRINT_VIEW_MAP = {}
for _sp_id, _label in SPRINT_LABEL_MAP.items():
    _n = _label.replace("Sprint ", "").strip()
    _view = os.environ.get(f"CLICKUP_SPRINT{_n}_VIEW_ID")
    if _view:
        SPRINT_VIEW_MAP[_sp_id] = _view
if CURRENT_SPRINT_ID:
    SPRINT_VIEW_MAP[CURRENT_SPRINT_ID] = CURRENT_SPRINT_VIEW_ID


def normalize_string(s):
    if not s:
        return ""
    # Força upper, remove acentos e espaços extras
    s = str(s).upper().strip()
    s = "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return s.strip()


ACADEMY_NAMES = ["FLAVIO", "MATHEUS", "AUREA", "JULIO", "ANA BEATRIZ", "CAIO", "CAIO CESAR"]

# Discipline → Team mapping
# TEL, SPDA, ELE → ELE team
# HID, SAN, SAN/DRE, DRE → HID team
DISC_TO_TEAM = {
    "TEL": "ELE", "SPDA": "ELE", "ELE": "ELE",
    "HID": "HID", "SAN": "HID", "SAN/DRE": "HID", "DRE": "HID",
}

# ══════════════════════════════════════════════════════════════
# TIER CONFIG — Multiplicadores por papel (PE Calibrada)
# O multiplicador NÃO interfere no PE do Sprint (distribuição)
# ══════════════════════════════════════════════════════════════
TIER_CONFIG = {
    "LIDERANCA":        {"mult": 0.80, "members": ["JOAO PEDRO TORRES", "DANIEL BEZERRA DE MACEDO"]},
    "MESMA_PRATELEIRA": {"mult": 1.00, "members": ["TERCIO OLIVEIRA", "RICARDO COSTA", "GABRIEL LEVI DE AQUINO SILVA", "JOAO VICTOR", "ANA LUIZA"]},
    "LIDER_ACADEMY":    {"mult": 0.85, "members": ["JULIO CESAR", "AUREA ROCHA"]},
    "ACADEMY_PURO":     {"mult": 0.60, "members": ["ANA BEATRIZ DA SILVA COSTA", "ANA BEATRIZ", "FLAVIO OLIVEIRA", "CAIO CESAR"]},
}

# Build reverse lookup: norm_name → tier_name
_MEMBER_TIER = {}
for tier_name, tier_info in TIER_CONFIG.items():
    for m in tier_info["members"]:
        _MEMBER_TIER[m] = tier_name

TEAM_MEMBERS_CONFIG = {
    "DANIEL BEZERRA DE MACEDO":     {"team": "ELE", "role": "LÍDER",      "hours_week": 40, "tier": "LIDERANCA"},
    "GABRIEL LEVI DE AQUINO SILVA":  {"team": "ELE", "role": "Projetista", "hours_week": 40, "tier": "MESMA_PRATELEIRA"},
    "ANA LUIZA":                     {"team": "ELE", "role": "Projetista", "hours_week": 20, "tier": "MESMA_PRATELEIRA"},
    "AUREA ROCHA":                   {"team": "ELE", "disc": "SPDA", "role": "ACADEMY",    "hours_week": 20, "tier": "LIDER_ACADEMY"},
    "FLAVIO OLIVEIRA":               {"team": "ELE", "disc": "SPDA", "role": "ACADEMY",    "hours_week": 20, "tier": "ACADEMY_PURO"},
    "JOAO VICTOR":                   {"team": "ELE", "role": "Projetista", "hours_week": 40, "tier": "MESMA_PRATELEIRA"},
    "RICARDO COSTA":                 {"team": "HID", "role": "Projetista", "hours_week": 40, "tier": "MESMA_PRATELEIRA"},
    "TERCIO OLIVEIRA":               {"team": "HID", "role": "Projetista", "hours_week": 40, "tier": "MESMA_PRATELEIRA"},
    "JULIO CESAR":                   {"team": "HID", "role": "ACADEMY",    "hours_week": 20, "tier": "LIDER_ACADEMY"},
    "JOAO PEDRO TORRES":             {"team": "HID", "role": "LÍDER",      "hours_week": 40, "tier": "LIDERANCA"},
    "ANA BEATRIZ DA SILVA COSTA":    {"team": "HID", "role": "ACADEMY",    "hours_week": 20, "tier": "ACADEMY_PURO"},
    "ANA BEATRIZ":                   {"team": "HID", "role": "ACADEMY",    "hours_week": 20, "tier": "ACADEMY_PURO"},
    "CAIO CESAR":                    {"team": "HID", "role": "ACADEMY",    "hours_week": 20, "tier": "ACADEMY_PURO"},
}

HOURS_OVERRIDE_STR = os.environ.get("CLICKUP_CURRENT_SPRINT_HOURS_OVERRIDE", "").strip()
if HOURS_OVERRIDE_STR:
    override_map = {}
    for pair in HOURS_OVERRIDE_STR.split(","):
        if ":" in pair:
            try:
                orig, new_val = pair.split(":")
                override_map[int(orig)] = int(new_val)
            except ValueError:
                pass
    for member, cfg in TEAM_MEMBERS_CONFIG.items():
        if cfg["hours_week"] in override_map:
            cfg["hours_week"] = override_map[cfg["hours_week"]]

def compute_pe_sprint(team_total_pts, pilots):
    """PE do Sprint: distribuição proporcional à carga horária e multiplicador do papel DENTRO DE CADA TIME.
    team_total_pts = {"HID": X, "ELE": Y, "ACADEMY": Z, ...}
    Soma de todos os PE_Sprint do time = total_sprint_pts do time.
    Fórmula nova: 
      1. Peso_Ajustado_Piloto = Multiplicador_Função * Horas_Piloto
      2. Soma_Pesos_Equipe = Soma dos Pesos Ajustados
      3. PE_Sprint = Total_Pontos_Equipe * (Peso_Ajustado / Soma_Pesos)
    """
    
    # 1. Calcular o peso ajustado de cada piloto
    for p in pilots:
        norm = normalize_string(p["name"])
        tier_name = p.get("tier", _MEMBER_TIER.get(norm, "MESMA_PRATELEIRA"))
        mult = TIER_CONFIG.get(tier_name, {}).get("mult", 1.0)
        h = p.get("hours_week", 40)
        p["pe_peso_ajustado"] = h * mult
        
    # 2. Agrupar pilotos por time e somar os pesos ajustados de cada time
    team_weights = {}
    pilots_by_team = {}
    
    for p in pilots:
        t = p.get("team", "Geral")
        if t not in pilots_by_team:
            pilots_by_team[t] = []
        pilots_by_team[t].append(p)
        # Só adiciona o peso ao rateio da equipe se o piloto tiver pontos atribuídos neste sprint
        if p.get("assigned", 0) > 0:
            team_weights[t] = team_weights.get(t, 0) + p["pe_peso_ajustado"]
        
    # 3. Distribuir os pontos de cada time apenas para os membros daquele time
    for t, team_pilots in pilots_by_team.items():
        total_pts_time = team_total_pts.get(t, 0)
        total_w_time = team_weights.get(t, 1)
        if total_w_time == 0:
            total_w_time = 1
            
        for p in team_pilots:
            if p.get("assigned", 0) > 0:
                p["pe_sprint"] = round(total_pts_time * (p["pe_peso_ajustado"] / total_w_time), 1)
            else:
                p["pe_sprint"] = 0



def compute_pe_calibrada(team_historical_pts, pilots):
    """PE Calibrada: distribuição da média histórica da equipe baseada nos pesos ajustados.
    team_historical_pts = {"HID": X, "ELE": Y, "ACADEMY": Z, ...}
    Fórmula: Peso_Ajustado = Horas_Piloto * Multiplicador
             PE_Calibrada = Média_Histórica_Equipe * (Peso_Ajustado / Soma_Pesos_Equipe)
    A PE Calibrada é uma META (capacidade operacional), então é calculada para TODOS os
    membros do time, independente de terem tasks atribuídas no sprint atual.
    """

    # 1. Calcular o peso ajustado de cada piloto
    for p in pilots:
        norm = normalize_string(p["name"])
        tier_name = p.get("tier", _MEMBER_TIER.get(norm, "MESMA_PRATELEIRA"))
        mult = TIER_CONFIG.get(tier_name, {}).get("mult", 1.0)
        h = p.get("hours_week", 40)
        p["pe_peso_ajustado"] = h * mult

    # 2. Agrupar pilotos por time e somar os pesos ajustados de cada time
    # Inclui TODOS os membros no rateio (capacidade operacional = meta antes de atribuir tasks)
    team_weights = {}
    pilots_by_team = {}
    has_any_assigned = any(p.get("assigned", 0) > 0 for p in pilots)

    for p in pilots:
        t = p.get("team", "Geral")
        if t not in pilots_by_team:
            pilots_by_team[t] = []
        pilots_by_team[t].append(p)
        # Se o sprint tem tasks atribuídas, só inclui quem tem assigned > 0 no rateio
        # Se o sprint está vazio (planejamento), inclui TODOS no rateio
        if not has_any_assigned or p.get("assigned", 0) > 0:
            team_weights[t] = team_weights.get(t, 0) + p["pe_peso_ajustado"]

    # 3. Distribuir os pontos históricos de cada time para os membros
    for t, team_pilots in pilots_by_team.items():
        total_pts_time = team_historical_pts.get(t, 0)
        total_w_time = team_weights.get(t, 1)
        if total_w_time == 0:
            total_w_time = 1

        for p in team_pilots:
            # Atribui PE calibrada se piloto participa do rateio
            if not has_any_assigned or p.get("assigned", 0) > 0:
                p["pe_calibrada"] = round(total_pts_time * (p["pe_peso_ajustado"] / total_w_time), 1)
            else:
                p["pe_calibrada"] = 0

            # Reatribuindo os valores de tier só para fins informativos
            norm = normalize_string(p["name"])
            tier_name = p.get("tier", _MEMBER_TIER.get(norm, "MESMA_PRATELEIRA"))
            mult = TIER_CONFIG.get(tier_name, {}).get("mult", 1.0)
            p["tier"] = tier_name
            p["tier_mult"] = mult



def compute_pe_individual(pilot_history_norm, pilots):
    """PE Individual (Carro Fantasma): histórico real pessoal calibrado.
    Calcula a média do histórico pessoal (normalizado p/ 40h) e aplica multiplicador e carga atual.
    """
    # Verificamos se há histórico suficiente para o boost (facultativo)
    num_sprints = 0
    if pilot_history_norm:
        all_s_ids = set()
        for h in pilot_history_norm.values():
            all_s_ids.update(h.keys())
        num_sprints = len(all_s_ids)
    
    apply_boost = num_sprints >= 3  # ×1.05 a partir de 3 sprints históricos

    has_any_assigned = any(p.get("assigned", 0) > 0 for p in pilots)

    for p in pilots:
        norm = normalize_string(p["name"])
        # Se o sprint tem tasks e o piloto não tem assigned, zera o carro fantasma
        # Se o sprint está vazio (planejamento), calcula para todos
        if has_any_assigned and p.get("assigned", 0) == 0:
            p["pe_individual"] = 0
            continue

        # pilot_history_norm contém valores JÁ normalizados para 40h
        hist = pilot_history_norm.get(norm, {})
        if hist:
            done_values = list(hist.values())
            avg_40h = sum(done_values) / len(done_values)
            
            if apply_boost:
                avg_40h *= 1.05
            
            # Aplica o multiplicador do papel E a carga horária proporcional (base 40h)
            tier_name = _MEMBER_TIER.get(norm, "MESMA_PRATELEIRA")
            mult = TIER_CONFIG.get(tier_name, {}).get("mult", 1.0)
            h_factor = p.get("hours_week", 40) / 40.0
            
            p["pe_individual"] = round(avg_40h * mult * h_factor, 1)
        else:
            p["pe_individual"] = 0

DISCIPLINE_FIELD_ID = "7606f41b-81fa-4597-94df-84ff9d326ebf"

def get_sprint_business_days(start_dt, end_dt):
    days = []
    curr = start_dt
    while curr <= end_dt:
        if curr.weekday() < 5:  # Monday=0, Friday=4
            days.append(curr.strftime('%Y-%m-%d'))
        curr += timedelta(days=1)
        if len(days) == 10:  # Fix to exactly 10 days
            break
    return days

def compute_telemetry(current_pilots, tasks, start_dt, end_dt):
    business_days = get_sprint_business_days(start_dt, end_dt)
    today_str = datetime.now().strftime('%Y-%m-%d')
    
    # Coletar TODOS os dias do sprint (incluindo Sat/Sun) para acumular pontos de fim de semana
    all_days = []
    curr = start_dt
    while curr <= end_dt and len([d for d in all_days if datetime.strptime(d, '%Y-%m-%d').weekday() < 5]) <= 10:
        all_days.append(curr.strftime('%Y-%m-%d'))
        curr += timedelta(days=1)
    
    # Track points per pilot per ALL days (including weekends)
    daily_done_all = {normalize_string(p["name"]): {d: 0 for d in all_days} for p in current_pilots}

    for t in tasks:
        status_type = t.get('status', {}).get('type')
        if status_type in ('closed', 'done'):
            pts = t.get('points') or 0
            dc = t.get('date_closed') or t.get('date_updated')
            if dc and pts > 0:
                dt_str = datetime.fromtimestamp(int(dc)/1000).strftime('%Y-%m-%d')
                for a in t.get('assignees', []):
                    assignee_norm = normalize_string(a.get('username'))
                    if assignee_norm in daily_done_all and dt_str in daily_done_all[assignee_norm]:
                        daily_done_all[assignee_norm][dt_str] += pts

    # Acumular pontuação de sábado/domingo na próxima segunda-feira
    daily_done = {norm: {d: 0 for d in business_days} for norm in daily_done_all}
    for norm, all_day_pts in daily_done_all.items():
        weekend_buffer = 0
        for d_str in all_days:
            dt_obj = datetime.strptime(d_str, '%Y-%m-%d')
            pts = all_day_pts[d_str]
            if dt_obj.weekday() >= 5:  # Sábado=5, Domingo=6
                weekend_buffer += pts
            else:
                # É dia útil — soma o buffer do fim de semana anterior
                if d_str in daily_done[norm]:
                    daily_done[norm][d_str] = pts + weekend_buffer
                    weekend_buffer = 0
        # Se sobrou buffer no final (sprint termina num domingo), soma no último dia útil
        if weekend_buffer > 0 and business_days:
            daily_done[norm][business_days[-1]] += weekend_buffer

    # Convert business days into 48h blocks (pairs of days)
    blocks = []
    for i in range(0, len(business_days), 2):
        chunk = business_days[i:i+2]
        blocks.append(chunk)

    # Calculate telemetry array for each pilot using 48h blocks
    for p in current_pilots:
        norm_name = normalize_string(p["name"])
        telemetry = []
        accumulated_done = 0
        pe_calibrada = p.get("pe_calibrada", p.get("pe", 50))
        meta_bloco = (pe_calibrada / 5) * 0.8  # Expectativa flexibilizada baseada na calibração

        for b_index, block_days in enumerate(blocks):
            pts_block = sum(daily_done[norm_name].get(d, 0) for d in block_days)
            
            # Formata a data para exibir no tooltip (ex: 17/03 e 18/03)
            b_dates_str = " e ".join([datetime.strptime(d, '%Y-%m-%d').strftime('%d/%m') for d in block_days])
            
            if all(d > today_str for d in block_days):
                telemetry.append({"color": "gray", "pts": 0, "date": b_dates_str})
                continue

            accumulated_done += pts_block
            blocks_passed = b_index + 1
            accumulated_expected = (pe_calibrada / 5) * blocks_passed

            # Determine block color
            if pts_block >= meta_bloco:
                # Find maximum points among those who are also "In Pace" in this block
                max_pts_in_pace = 0
                for pn in daily_done:
                    pn_pts_block = sum(daily_done[pn].get(d, 0) for d in block_days)
                    # We need the meta of this other pilot 'pn' to check if they are "In Pace"
                    # Optimization: find the pilot object
                    other_p = next((x for x in current_pilots if normalize_string(x["name"]) == pn), None)
                    if other_p:
                        other_pe_calib = other_p.get("pe_calibrada", other_p.get("pe", 50))
                        other_meta_bloco = (other_pe_calib / 5) * 0.8
                        if pn_pts_block >= other_meta_bloco and pn_pts_block > max_pts_in_pace:
                            max_pts_in_pace = pn_pts_block
                
                if pts_block > 0 and pts_block == max_pts_in_pace:
                    color = "purple" # Best of the In-Pace group
                else:
                    color = "green" # In Pace
            elif accumulated_done >= accumulated_expected:
                color = "orange" # Na gordura (atrasado no bloco, mas saldo positivo total)
            elif pts_block > 0:
                color = "orange" # Recovering (Abaixo da meta, mas tentou)
            else:
                color = "red" # Off Pace (0 pts ou sem gordura)
            
            telemetry.append({"color": color, "pts": pts_block, "date": b_dates_str, "meta": round(meta_bloco, 1)})
                
        p["telemetry"] = telemetry
        
        # Telemetria 24h (diária) para o modal detalhado — 10 blocos de 1 dia útil
        meta_diaria = (pe_calibrada / 10) * 0.8  # Meta diária flexibilizada
        telemetry_24h = []
        acc_done_24h = 0
        for day_index, b_day in enumerate(business_days):
            pts_day = daily_done[norm_name].get(b_day, 0)
            b_date_str = datetime.strptime(b_day, '%Y-%m-%d').strftime('%d/%m')
            
            if b_day > today_str:
                telemetry_24h.append({"color": "gray", "pts": 0, "date": b_date_str})
                continue
            
            acc_done_24h += pts_day
            acc_expected_24h = (pe_calibrada / 10) * (day_index + 1)
            
            # Determine daily color
            if pts_day >= meta_diaria:
                # Find maximum points among those who are "In Pace" today
                max_pts_ip_day = 0
                for pn in daily_done:
                    pn_pts = daily_done[pn].get(b_day, 0)
                    other_p = next((x for x in current_pilots if normalize_string(x["name"]) == pn), None)
                    if other_p:
                        other_pe_calib = other_p.get("pe_calibrada", other_p.get("pe", 50))
                        other_meta_diaria = (other_pe_calib / 10) * 0.8
                        if pn_pts >= other_meta_diaria and pn_pts > max_pts_ip_day:
                            max_pts_ip_day = pn_pts
                            
                if pts_day > 0 and pts_day == max_pts_ip_day:
                    color_24h = "purple" # Best of the day
                else:
                    color_24h = "green"
            elif acc_done_24h >= acc_expected_24h:
                color_24h = "orange" # Na gordura
            elif pts_day > 0:
                color_24h = "orange" # Tentou
            else:
                color_24h = "red"
            
            telemetry_24h.append({"color": color_24h, "pts": pts_day, "date": b_date_str, "meta": round(meta_diaria, 1)})
        
        p["telemetry_24h"] = telemetry_24h
        
        # Array cumulativo diário para o gráfico de Trajetória do frontend (0 no dia 0)
        trajectory_real = [0]
        acc_real = 0
        for b_day in business_days:
            pts_day = daily_done[norm_name].get(b_day, 0)
            acc_real += pts_day
            if b_day <= today_str:
                trajectory_real.append(round(acc_real, 1))
            else:
                trajectory_real.append(None)
        p["trajectory_real"] = trajectory_real

WORKSPACE_USER_IDS = "101109797,284522139,95164059,224457558,95138614,188642164,89308805,60927197,49083135,81966483,49091131,290443652"

def fetch_time_entries(start_date, end_date):
    """Fetch time entries for the entire workspace within a date range."""
    start_ms = int(start_date.timestamp() * 1000)
    end_ms = int(end_date.timestamp() * 1000)
    url = f"https://api.clickup.com/api/v2/team/{TEAM_ID}/time_entries?start_date={start_ms}&end_date={end_ms}&assignee={WORKSPACE_USER_IDS}"
    req = urllib.request.Request(url, headers={"Authorization": CLICKUP_TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read())
            entries = data.get("data", [])
            print(f"  Time entries fetched: {len(entries)} entries")
            return entries
    except Exception as e:
        print(f"  Time entries fetch error: {e}")
        return []


def get_sprint_tracked_hours(sprint_start_dt):
    """
    Get tracked hours per pilot for the sprint, separating Week 1 and Week 2.
    Calculates deficit based on 85% weekly target.
    """
    now = datetime.now()
    # Assume sprints are 2 weeks.
    week1_end = sprint_start_dt + timedelta(days=7)
    
    # We fetch ALL entries since the start of the sprint
    sprint_start = sprint_start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    entries = fetch_time_entries(sprint_start, now)

    user_hours_wk1 = {}
    user_hours_wk2 = {}

    for entry in entries:
        user = entry.get("user", {})
        username = user.get("username", "Unknown")
        norm = normalize_string(username)
        duration_ms = int(entry.get("duration", 0))
        entry_start_ms = int(entry.get("start", 0))
        entry_dt = datetime.fromtimestamp(entry_start_ms / 1000.0)
        
        if entry_dt < week1_end:
            user_hours_wk1[norm] = user_hours_wk1.get(norm, 0) + duration_ms
        else:
            user_hours_wk2[norm] = user_hours_wk2.get(norm, 0) + duration_ms

    result = {}
    
    # Base configuration iteration to ensure all active configure members get parsed
    # even if they have 0 entries
    for norm_name, config in TEAM_MEMBERS_CONFIG.items():
        wk1_ms = user_hours_wk1.get(norm_name, 0)
        wk2_ms = user_hours_wk2.get(norm_name, 0)
        
        tracked_wk1_h = round(wk1_ms / 3_600_000, 1)
        tracked_wk2_h = round(wk2_ms / 3_600_000, 1)
        
        hours_week = config.get("hours_week", 40)
        target_wk1_h = round(hours_week * 0.85, 1)
        
        # Calculate Deficit from Week 1 (if they didn't hit 85%)
        deficit_wk1 = round(max(0, target_wk1_h - tracked_wk1_h), 1)
        
        # New target for Week 2 is base 85% + Deficit
        target_wk2_h = round(target_wk1_h + deficit_wk1, 1)
        
        # Decide current week to display on the main dashboard Table
        is_week2 = now >= week1_end
        current_tracked = tracked_wk2_h if is_week2 else tracked_wk1_h
        current_target = target_wk2_h if is_week2 else target_wk1_h
        
        # Calculate Percentage relative to Current Target Goal
        pct = round((current_tracked / current_target) * 100, 1) if current_target > 0 else 0
        
        # Thresholds logic (Green only if hitting 100% of accumulated target)
        color = "green" if pct >= 100 else ("orange" if pct >= 80 else "red")
        
        result[norm_name] = {
            "tracked_hours": current_tracked,
            "hours_week": hours_week,
            "tracked_pct": pct,
            "tracked_color": color,
            # Extra fields for Modal Breakdown
            "tracked_wk1": tracked_wk1_h,
            "tracked_wk2": tracked_wk2_h,
            "target_wk1": target_wk1_h,
            "target_wk2": target_wk2_h,
            "deficit_wk1": deficit_wk1,
            "is_week2": is_week2
        }
        
    return result


def count_business_days(start_date, end_date, holidays=None):
    """Count weekdays (Mon-Fri) between two dates, inclusive of both ends, excluding holidays."""
    if isinstance(start_date, str):
        start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00')).replace(tzinfo=None)
    if isinstance(end_date, str):
        end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00')).replace(tzinfo=None)
    # Normalize to date-only for clean day counting
    d = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
    holiday_dates = holidays or set()
    count = 0
    while d <= end:
        if d.weekday() < 5 and d.date() not in holiday_dates:  # Mon=0 .. Fri=4, skip holidays
            count += 1
        d += timedelta(days=1)
    return count


def is_academy(name):
    norm_name = normalize_string(name)
    
    # Verifica no mapping primeiro
    config = TEAM_MEMBERS_CONFIG.get(norm_name)
    if config:
        return config["role"] == "ACADEMY"
    # Fallback para nomes genéricos
    for ac in ACADEMY_NAMES:
        if ac in norm_name:
            return True
    return False


def get_discipline(custom_fields):
    """Extract discipline label from task custom fields."""
    for cf in custom_fields:
        if cf.get("id") == DISCIPLINE_FIELD_ID:
            opts = cf.get("type_config", {}).get("options", [])
            vals = cf.get("value") or []
            for v in vals:
                for opt in opts:
                    if opt.get("id") == v:
                        return opt.get("label", "Geral")
    return "Geral"


def get_team_for_disc(disc):
    """Map a discipline to its team (ELE or HID)."""
    return DISC_TO_TEAM.get(disc, "Geral")


def get_role(assignee_name, disc):
    norm_name = normalize_string(assignee_name)
    config = TEAM_MEMBERS_CONFIG.get(norm_name)
    
    if config:
        role_base = config["role"]
        return f"{role_base} {disc}"
        
    prefix = "Academy" if is_academy(assignee_name) else "Projetista"
    return f"{prefix} {disc}"


def fetch_view_tasks(view_id):
    """Fetch ALL tasks from a ClickUp View (with pagination)."""
    all_tasks = []
    page = 0
    while True:
        url = f"https://api.clickup.com/api/v2/view/{view_id}/task?page={page}&include_closed=true&subtasks=true"
        req = urllib.request.Request(url, headers={"Authorization": CLICKUP_TOKEN})
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                data = json.loads(response.read())
                tasks = data.get("tasks", [])
                if not tasks:
                    break
                all_tasks.extend(tasks)
                print(f"  View page {page}: {len(tasks)} tasks (total: {len(all_tasks)})")
                page += 1
                if page > 15:
                    break
        except Exception as e:
            print(f"  View fetch error page {page}: {e}")
            break
    return all_tasks


def fetch_folder_tasks(folder_id):
    """Fetch tasks from a ClickUp Folder with pagination support."""
    all_tasks = []
    page = 0
    while True:
        url = f"https://api.clickup.com/api/v2/folder/{folder_id}/task?page={page}&subtasks=true&include_closed=true"
        req = urllib.request.Request(url, headers={"Authorization": CLICKUP_TOKEN})
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read())
                tasks = data.get("tasks", [])
                if not tasks:
                    break
                all_tasks.extend(tasks)
                print(f"  Folder {folder_id} page {page}: {len(tasks)} tasks (total: {len(all_tasks)})")
                page += 1
                if page > 15:
                    break
        except Exception as e:
            print(f"  Folder fetch error page {page}: {e}")
            break
    return all_tasks


def fetch_list_tasks(list_id):
    """Fetch tasks directly from a ClickUp List with pagination support."""
    all_tasks = []
    page = 0
    while True:
        url = f"https://api.clickup.com/api/v2/list/{list_id}/task?page={page}&subtasks=true&include_closed=true"
        req = urllib.request.Request(url, headers={"Authorization": CLICKUP_TOKEN})
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.loads(response.read())
                tasks = data.get("tasks", [])
                if not tasks:
                    break
                all_tasks.extend(tasks)
                print(f"  List {list_id} page {page}: {len(tasks)} tasks (total: {len(all_tasks)})")
                page += 1
                if page > 15:
                    break
        except Exception as e:
            print(f"  List fetch error page {page}: {e}")
            break
    return all_tasks


def fetch_list_details(list_id):
    """Fetch details of a specific List."""
    url = f"https://api.clickup.com/api/v2/list/{list_id}"
    req = urllib.request.Request(url, headers={"Authorization": CLICKUP_TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read())
    except Exception as e:
        print(f"  List fetch error {list_id}: {e}")
        return {}


def _historical_cache_age(sp_id):
    if _wolf_cache is None:
        return None
    try:
        return _wolf_cache.cache_age_seconds(f"sprint_hist_{sp_id}")
    except Exception:
        return None


def _load_historical_cache(sp_id):
    if _wolf_cache is None:
        return None
    age = _historical_cache_age(sp_id)
    if age is None or age > HISTORICAL_SPRINT_TTL:
        return None
    data, _ = _wolf_cache.load_cache(f"sprint_hist_{sp_id}")
    return data


def _save_historical_cache(sp_id, data):
    if _wolf_cache is None:
        return
    try:
        _wolf_cache.save_cache(f"sprint_hist_{sp_id}", data)
    except Exception as e:
        print(f"  Warn: falha ao salvar cache do sprint {sp_id}: {e}")


def _process_historical_sprint(sp_id, force_refresh=False):
    """Fetch + agrega métricas de um sprint histórico. Usa cache de 24h por padrão."""
    if not force_refresh:
        cached = _load_historical_cache(sp_id)
        if cached is not None:
            print(f"  [cache HIT] sprint {sp_id}")
            return cached

    view_id = SPRINT_VIEW_MAP.get(sp_id)
    if view_id:
        print(f"Fetching historical sprint {sp_id} via View: {view_id}")
        tasks = fetch_view_tasks(view_id)
    else:
        print(f"Fetching historical sprint {sp_id} via List API")
        tasks = fetch_list_tasks(sp_id)

    print(f"  {len(tasks)} tasks for historical sprint {sp_id}")
    pilots = process_sprint_tasks(tasks)

    parent_ids = {t.get('parent') for t in tasks if t.get('parent') is not None}
    sp_lt_data = []
    for t in tasks:
        if t.get('status', {}).get('type') in ('closed', 'done'):
            is_mother = t.get('id') in parent_ids
            pts = t.get('points') or 0
            time_tracked_ms = t.get('time_spent') or 0
            if not is_mother and pts > 0 and time_tracked_ms > 0:
                lt_hours = time_tracked_ms / (1000 * 60 * 60)
                sp_lt_data.append({"value": lt_hours, "points": pts})

    sum_w = sum(x["value"] * x["points"] for x in sp_lt_data)
    sum_p = sum(x["points"] for x in sp_lt_data)
    sp_lead_time_avg = round(sum_w / sum_p, 1) if sum_p > 0 else 0

    sprint_done_all = sum(p["done"] for p in pilots)
    sprint_done_hid = sum(p["done"] for p in pilots if p["team"] == "HID")
    sprint_done_ele = sum(p["done"] for p in pilots if p["team"] == "ELE")
    sprint_done_academy = sum(p["done"] for p in pilots if p.get("isAcademy"))
    sprint_total_pts = sum(t.get('points') or 0 for t in tasks)
    sprint_label = SPRINT_LABEL_MAP.get(sp_id, f'Sprint {sp_id}')

    result = {
        'sp_id': sp_id,
        'sprint_label': sprint_label,
        'pilots': pilots,
        'sprint_done_all': sprint_done_all,
        'sprint_done_hid': sprint_done_hid,
        'sprint_done_ele': sprint_done_ele,
        'sprint_done_academy': sprint_done_academy,
        'sprint_total_pts': sprint_total_pts,
        'sp_lead_time_avg': sp_lead_time_avg,
    }
    _save_historical_cache(sp_id, result)
    return result


def process_sprint_tasks(tasks):
    """Process tasks into pilot metrics with discipline, photos, and status tracking."""
    pilots_map = {}
    
    # Extrai o ID de toda tarefa que é pai de outra nesta Sprint (a verdadeira definição de Tarefa Mãe)
    parent_ids = {t.get('parent') for t in tasks if t.get('parent') is not None}

    for t in tasks:
        pts = t.get('points') or 0
        status_type = t.get('status', {}).get('type', 'open')
        status_name = t.get('status', {}).get('status', '').lower()

        is_doing = status_name in [
            'fazendo', 'em revisão', 'em revisao', 'correção', 'correcao',
            'in progress', 'em andamento', 'revisão', 'review', 'travado'
        ]
        is_done = (
            status_type in ['closed', 'done']
            or status_name in ['acc interna', 'acc mrv', 'aprovado',
                               'concluído', 'done', 'finalizado']
        )

        time_spent_ms = t.get('time_spent') or 0
        tracked_hours = time_spent_ms / (1000 * 60 * 60)
        
        # Gargalo Logic: Avalia data da ultima movimentacao (Fazendo/Travado) + Tempo Rastreado
        # 8h rastreadas = 1 dia de trabalho. 24h = 3 dias.
        date_updated = int(t.get('date_updated') or t.get('date_created') or 0)
        now = datetime.now().timestamp() * 1000
        days_since_update = max((now - date_updated) / (1000 * 60 * 60 * 24), 0)
        
        if is_doing:
            age_days = max(days_since_update, tracked_hours / 8.0)
        else:
            age_days = tracked_hours / 8.0

        custom_fields = t.get('custom_fields', [])
        disc = get_discipline(custom_fields)
        team = get_team_for_disc(disc)

        # IDENTIFICAÇÃO DE TAREFA MÃE (Regra Refinada: Baseada na Paternidade Real)
        # Se o ID desta tarefa consta na lista de pais das outras tarefas da Sprint
        is_mother = t.get('id') in parent_ids

        for a in t.get('assignees', []):
            un = a.get('username', 'Unknown')
            photo = a.get('profilePicture') or None

            if un not in pilots_map:
                norm_name = normalize_string(un)
                config = TEAM_MEMBERS_CONFIG.get(norm_name)
                
                # Se estiver no config, usa o time como função/disciplina (ELE ou HID) para exibição limpa (FUNÇÃO = TIME)
                member_team = config["team"] if config else team
                member_disc = member_team # Sempre usa ELE ou HID puro
                role = get_role(un, disc)
                member_hours = config["hours_week"] if config else 40
                # Apply sprint-specific capacity override (e.g. holiday shortening)
                member_hours = CURRENT_SPRINT_HOURS_OVERRIDE.get(member_hours, member_hours)
                member_tier = config.get("tier", "MESMA_PRATELEIRA") if config else "MESMA_PRATELEIRA"
                
                pilots_map[un] = {
                    "name": un,
                    "role": role,
                    "disc": member_disc,
                    "team": member_team,
                    "hours_week": member_hours,
                    "tier": member_tier,
                    "assigned": 0,
                    "doing": 0,
                    "done": 0,
                    "photo": photo,
                    "ageAvgTotal": 0,
                    "doingCount": 0,
                    "isAcademy": is_academy(un),
                    "taskCount": 0,
                    "bottleneck_tasks": [],
                    "doing_tasks": [],
                    "recent_done_tasks": [],
                }

            p = pilots_map[un]
            task_points = t.get('points') or 0
            p["assigned"] += task_points
            
            # Não conta tarefa mãe na quantidade total de tarefas do piloto
            if not is_mother:
                p["taskCount"] += 1

            if photo and not p["photo"]:
                p["photo"] = photo
            if is_doing:
                p["doing"] += task_points
                # Não conta tarefa mãe no WIP (evita inflar simultaneidade)
                if not is_mother:
                    p["ageAvgTotal"] += age_days
                    p["doingCount"] += 1
                    # Registra tarefa em Doing para o modal de detalhe
                    p["doing_tasks"].append({
                        "name": t.get('name', 'Sem nome'),
                        "points": task_points,
                        "age_days": round(age_days, 1),
                        "status": t.get('status', {}).get('status', 'Doing'),
                        "disc": disc,
                        "id": t.get('id', ''),
                    })
                    # Gargalo: tarefa em Doing há 3+ dias
                    if age_days >= 3:
                        p["bottleneck_tasks"].append({
                            "name": t.get('name', 'Sem nome'),
                            "points": task_points,
                            "age_days": round(age_days, 1),
                            "status": t.get('status', {}).get('status', 'Doing'),
                            "disc": disc,
                            "id": t.get('id', ''),
                        })
            if is_done:
                p["done"] += task_points
                # Registra tarefa concluída para o modal de detalhe
                dc_ts = t.get('date_closed') or t.get('date_updated')
                done_date_str = datetime.fromtimestamp(int(dc_ts)/1000).strftime('%d/%m') if dc_ts else ''
                p["recent_done_tasks"].append({
                    "name": t.get('name', 'Sem nome'),
                    "points": task_points,
                    "date": done_date_str,
                    "id": t.get('id', ''),
                })

    pilots = []
    for p in pilots_map.values():
        if p["assigned"] == 0:
            continue
            
        p["ageAvg"] = round(p["ageAvgTotal"] / p["doingCount"], 1) if p["doingCount"] > 0 else 0
        p["load"] = p["assigned"]
        # Gargalo Score agora é a QUANTIDADE de tarefas travadas (3+ dias)
        p["gargaloScore"] = len(p["bottleneck_tasks"])
        del p["ageAvgTotal"]
        # Ordenar doing_tasks por age_days decrescente (mais travadas primeiro)
        p["doing_tasks"].sort(key=lambda x: x["age_days"], reverse=True)
        # Ordenar recent_done_tasks e manter apenas as últimas 5
        p["recent_done_tasks"] = p["recent_done_tasks"][-5:]
        pilots.append(p)

    return pilots


def get_production_metrics(force_refresh=False):
    if not CLICKUP_TOKEN:
        return {"error": "Missing ClickUp API token.", "status": "error"}

    # ── Current Sprint: use Views API for accurate data ──
    current_pilots = []
    current_total_tasks = 0
    current_total_points = 0
    current_total_done = 0
    current_total_doing = 0
    burndown_data = {}

    # Flow Distribution: 4 buckets
    flow_backlog_pts = 0
    flow_todo_pts = 0
    flow_doing_pts = 0
    flow_done_pts = 0

    # Lead Time metrics (uses REAL time_tracked from ClickUp, not calendar elapsed)
    lead_times_data = []

    # Real-time throughput/arrival (last 24h)
    throughput_today = 0
    arrival_today = 0
    burndown_done_pts = 0  # Align with ClickUp Burndown (type=closed OR type=done)
    now_ts = datetime.now().timestamp() * 1000

    # Fetch List start date for accurate Sprint Day calculation
    # Priority: env var > ClickUp List API start_date > fallback
    sprint_start_date_iso = "2026-03-30T00:00:00Z"
    if CURRENT_SPRINT_START_DATE:
        sprint_start_date_iso = CURRENT_SPRINT_START_DATE + "T00:00:00Z"
    elif CURRENT_SPRINT_ID:
        list_details = fetch_list_details(CURRENT_SPRINT_ID)
        start_ts = list_details.get('start_date')
        if start_ts:
            sprint_start_date_iso = datetime.fromtimestamp(int(start_ts)/1000).isoformat() + "Z"
        else:
            created_ts = list_details.get('date_created')
            if created_ts:
                sprint_start_date_iso = datetime.fromtimestamp(int(created_ts)/1000).isoformat() + "Z"

    # Compute sprint end date (start + 13 calendar days = 14-day sprint)
    sprint_start_dt = datetime.fromisoformat(sprint_start_date_iso.replace('Z', ''))
    sprint_end_dt = sprint_start_dt + timedelta(days=13)
    now_dt = datetime.now()

    # Business-day metrics (aligned with ClickUp burndown which skips weekends + holidays)
    dias_uteis_total = count_business_days(sprint_start_dt, sprint_end_dt, CURRENT_SPRINT_HOLIDAYS)
    dias_uteis_passados = count_business_days(sprint_start_dt, min(now_dt, sprint_end_dt), CURRENT_SPRINT_HOLIDAYS)
    print(f"  Sprint dates: {sprint_start_dt.date()} -> {sprint_end_dt.date()}, dias uteis: {dias_uteis_passados}/{dias_uteis_total}")

    twenty_four_hours_ms = 24 * 60 * 60 * 1000

    # Status classification sets
    BACKLOG_STATUSES = {'backlog', 'open'}
    TODO_STATUSES = {'to do', 'pronto para iniciar', 'em modelagem'}
    DOING_STATUSES = {'fazendo', 'em andamento', 'em revisão', 'em revisao',
                      'correção', 'correcao', 'travado',
                      'in progress', 'doing', 'pendente', 'revisão', 'review'}
    # NOTE: 'roe', 'acc interna', 'acc mrv' have type=done in ClickUp, so they
    # are counted as DONE by the burndown, NOT as Doing.
    DONE_STATUSES = {'aprovado', 'concluído', 'concluido', 'done', 'finalizado'}

    # ═══════════════════════════════════════════════════════════════════
    # SOURCE OF TRUTH: View API (matches ClickUp Burndown exactly)
    # The View returns 547 pts = Esforço Total in the official Burndown.
    # ═══════════════════════════════════════════════════════════════════
    current_team_total_pts = {}
    current_team_done_pts = {}
    
    if CURRENT_SPRINT_VIEW_ID:
        print(f"Fetching truth from View API: {CURRENT_SPRINT_VIEW_ID}")
        tasks = fetch_view_tasks(CURRENT_SPRINT_VIEW_ID)
        current_tasks = tasks  # Save for telemetry later
        current_pilots = process_sprint_tasks(tasks)
        
        current_total_tasks = len(tasks)
        current_total_points = sum(t.get('points') or 0 for t in tasks)
        
        for t in tasks:
            pts = t.get('points') or 0
            if pts > 0:
                disc = get_discipline(t.get('custom_fields', []))
                team = get_team_for_disc(disc)
                current_team_total_pts[team] = current_team_total_pts.get(team, 0) + pts
                
                status_obj = t.get('status', {})
                status_type = status_obj.get('type')
                if status_type in ('closed', 'done'):
                    current_team_done_pts[team] = current_team_done_pts.get(team, 0) + pts
        
        # Identifica IDs de pais para excluir tarefas mãe do Cycle Time
        parent_ids = {t.get('parent') for t in tasks if t.get('parent') is not None}
        
        for t in tasks:
            status_obj = t.get('status', {})
            status_name = (status_obj.get('status') or '').lower()
            status_type = status_obj.get('type')
            pts = t.get('points') or 0
            
            # ClickUp Burndown "Concluído" = type=closed OR type=done
            # This includes: aprovado (closed), acc interna (done), roe (done)
            is_burndown_done = status_type in ('closed', 'done')
            
            if is_burndown_done:
                flow_done_pts += pts
                current_total_done += pts
                burndown_done_pts += pts
                
                # Throughput: recently completed
                dc = t.get('date_closed') or t.get('date_updated')
                if dc and (now_ts - int(dc)) <= twenty_four_hours_ms:
                    throughput_today += pts
                
                # Lead Time: TEMPO REAL RASTREADO no ClickUp (time_spent)
                # NÃO usa date_closed - date_created (que mede tempo calendário)
                is_mother = t.get('id') in parent_ids
                time_tracked_ms = t.get('time_spent') or 0
                
                if not is_mother and pts > 0 and time_tracked_ms > 0:
                    lt_hours = time_tracked_ms / (1000 * 60 * 60)  # em horas
                    lt_days = lt_hours / 24  # converter para dias para consistência
                    owner = ", ".join([a.get('username') for a in t.get('assignees', [])])
                    task_disc = get_discipline(t.get('custom_fields', []))
                    task_team = get_team_for_disc(task_disc)
                    lead_times_data.append({
                        "id": t.get('id'),
                        "value": lt_days,
                        "value_hours": round(lt_hours, 1),
                        "value_min": round(time_tracked_ms / (1000 * 60), 1),
                        "task": t.get('name'),
                        "owner": owner,
                        "points": pts,
                        "team": task_team
                    })

                # Burndown plot data
                ts_val = t.get('date_closed') or t.get('date_updated')
                if ts_val:
                    dt_str = datetime.fromtimestamp(int(ts_val)/1000).strftime('%Y-%m-%d')
                    burndown_data[dt_str] = burndown_data.get(dt_str, 0) + pts
            
            elif status_name in DOING_STATUSES:
                flow_doing_pts += pts
                current_total_doing += pts
            elif status_name in TODO_STATUSES:
                flow_todo_pts += pts
            elif status_name in BACKLOG_STATUSES:
                flow_backlog_pts += pts
            else:
                flow_backlog_pts += pts  # Fallback

            # Arrival: created today
            dc_created = t.get('date_created')
            if dc_created and (now_ts - int(dc_created)) <= twenty_four_hours_ms:
                arrival_today += pts

        print(f"  View Truth: {current_total_tasks} tasks, {current_total_points} pts total, {burndown_done_pts} pts done, {current_total_doing} pts doing")
    
    elif CURRENT_SPRINT_ID:
        print(f"Fallback: fetching via List API: {CURRENT_SPRINT_ID}")
        tasks = fetch_list_tasks(CURRENT_SPRINT_ID)
        current_tasks = tasks  # Save for telemetry later
        current_total_tasks = len(tasks)
        current_total_points = sum(t.get('points') or 0 for t in tasks)
        current_pilots = process_sprint_tasks(tasks)
        
        for t in tasks:
            pts = t.get('points') or 0
            if pts > 0:
                disc = get_discipline(t.get('custom_fields', []))
                team = get_team_for_disc(disc)
                current_team_total_pts[team] = current_team_total_pts.get(team, 0) + pts
                
                status_obj = t.get('status', {})
                status_type = status_obj.get('type')
                if status_type in ('closed', 'done'):
                    current_team_done_pts[team] = current_team_done_pts.get(team, 0) + pts

    # ── Ensure ALL configured team members appear as pilots (capacity planning) ──
    # Aliases: longer names that duplicate a shorter entry (skip them)
    _CONFIG_ALIASES = {"ANA BEATRIZ DA SILVA COSTA"}  # covered by "ANA BEATRIZ"
    existing_norms = {normalize_string(p["name"]) for p in current_pilots}
    for member_name, cfg in TEAM_MEMBERS_CONFIG.items():
        if member_name in _CONFIG_ALIASES:
            continue
        if member_name not in existing_norms:
            member_hours = cfg["hours_week"]
            member_hours = CURRENT_SPRINT_HOURS_OVERRIDE.get(member_hours, member_hours)
            current_pilots.append({
                "name": member_name.title(),
                "role": f"{cfg['role']} {cfg['team']}",
                "disc": cfg["team"],
                "team": cfg["team"],
                "hours_week": member_hours,
                "tier": cfg.get("tier", "MESMA_PRATELEIRA"),
                "assigned": 0,
                "doing": 0,
                "done": 0,
                "photo": None,
                "ageAvg": 0,
                "doingCount": 0,
                "isAcademy": cfg["role"] == "ACADEMY",
                "taskCount": 0,
                "load": 0,
                "gargaloScore": 0,
                "bottleneck_tasks": [],
                "doing_tasks": [],
                "recent_done_tasks": [],
            })
    print(f"  Pilots after config injection: {len(current_pilots)} (from tasks: {len(existing_norms)})")

    # ── Historical Sprints: use Views API when available, fallback to List API ──

    history = {}
    historical_pe_total = 0
    historical_pe_hid = 0
    historical_pe_ele = 0
    historical_pe_academy = 0
    historical_sprint_count = 0

    # Per-sprint velocity for TOP-3 BEST selection (PE Calibrada)
    sprint_velocities = []  # [{total, hid, ele, academy, label}]

    # PE TRIPLO: collect per-pilot and per-tier Done history
    pilot_sprint_history = {}   # {norm_name: {sprint_label: done_pts}}
    tier_sprint_done = {}       # {tier_name: {sprint_label: [done_pts per member]}}
    
    sprint_ids_to_process = [
        sid.strip() for sid in SPRINT_IDS
        if sid and sid.strip() and sid.strip() != CURRENT_SPRINT_ID
    ]

    historical_results = []
    if sprint_ids_to_process:
        workers = max(1, min(HISTORICAL_PARALLELISM, len(sprint_ids_to_process)))
        print(f"Processing {len(sprint_ids_to_process)} historical sprints em paralelo (workers={workers})")
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            future_map = {
                ex.submit(_process_historical_sprint, sid, force_refresh): sid
                for sid in sprint_ids_to_process
            }
            for fut in concurrent.futures.as_completed(future_map):
                sid = future_map[fut]
                try:
                    historical_results.append(fut.result())
                except Exception as e:
                    print(f"  Erro processando sprint {sid}: {e}")

    # Ordem estável: seguindo SPRINT_IDS original
    order_index = {sid: i for i, sid in enumerate(sprint_ids_to_process)}
    historical_results.sort(key=lambda r: order_index.get(r['sp_id'], 1_000_000))

    for r in historical_results:
        sp_id = r['sp_id']
        pilots = r['pilots']
        sprint_done_all = r['sprint_done_all']
        sprint_done_hid = r['sprint_done_hid']
        sprint_done_ele = r['sprint_done_ele']
        sprint_done_academy = r['sprint_done_academy']
        sprint_total_pts = r['sprint_total_pts']
        sp_lead_time_avg = r['sp_lead_time_avg']
        sprint_label = r['sprint_label']

        historical_pe_total += sprint_done_all
        historical_pe_hid += sprint_done_hid
        historical_pe_ele += sprint_done_ele
        historical_pe_academy += sprint_done_academy
        historical_sprint_count += 1

        history[sp_id] = {
            'pilots': pilots,
            'velocity_total': sprint_done_all,
            'velocity_hid': sprint_done_hid,
            'velocity_ele': sprint_done_ele,
            'velocity_academy': sprint_done_academy,
            'total_points': sprint_total_pts,
            'label': sprint_label,
            'leadTime': sp_lead_time_avg
        }
        print(f"  Sprint {sp_id} Done All: {sprint_done_all} (HID: {sprint_done_hid}, ELE: {sprint_done_ele}, Academy: {sprint_done_academy})")

        sprint_velocities.append({
            'total': sprint_done_all,
            'hid': sprint_done_hid,
            'ele': sprint_done_ele,
            'academy': sprint_done_academy,
            'label': sprint_label
        })

        for hp in pilots:
            norm = normalize_string(hp["name"])
            tier = hp.get("tier", _MEMBER_TIER.get(norm, "MESMA_PRATELEIRA"))
            team = hp.get("team", hp.get("disc", "Geral"))
            tier_team_key = f"{tier}_{team}"
            done_v = hp["done"]
            h_factor = hp.get("hours_week", 40) / 40.0
            if h_factor <= 0: h_factor = 1.0
            done_normalized = done_v / h_factor

            if norm not in pilot_sprint_history:
                pilot_sprint_history[norm] = {}
            pilot_sprint_history[norm][sprint_label] = done_normalized

            if tier_team_key not in tier_sprint_done:
                tier_sprint_done[tier_team_key] = {}
            if sprint_label not in tier_sprint_done[tier_team_key]:
                tier_sprint_done[tier_team_key][sprint_label] = []

            tier_sprint_done[tier_team_key][sprint_label].append(done_normalized)

    # Calculate average historical velocity using TOP-3 BEST sprints (by total velocity)
    TOP_N = 3
    if sprint_velocities:
        sorted_sprints = sorted(sprint_velocities, key=lambda x: x['total'], reverse=True)
        top_sprints = sorted_sprints[:TOP_N]
        top_labels = [s['label'] for s in top_sprints]
        n = len(top_sprints)
        historical_average_pe = round(sum(s['total'] for s in top_sprints) / n)
        historical_average_pe_hid = round(sum(s['hid'] for s in top_sprints) / n)
        historical_average_pe_ele = round(sum(s['ele'] for s in top_sprints) / n)
        historical_average_pe_academy = round(sum(s['academy'] for s in top_sprints) / n)
        print(f"  PE Calibrada TOP-{TOP_N}: {top_labels} → Total={historical_average_pe}, HID={historical_average_pe_hid}, ELE={historical_average_pe_ele}")
    else:
        historical_average_pe = current_total_points
        historical_average_pe_hid = 1
        historical_average_pe_ele = 1
        historical_average_pe_academy = 1

    # ═══════════════════════════════════════════════════════════════════
    # PE TRIPLO: Calculate tier averages and inject all 3 PEs
    # ═══════════════════════════════════════════════════════════════════
    # tier_avg_done: average Done per member of this tier/team across historical sprints
    tier_avg_done = {}
    for tier_team_key, sprint_data in tier_sprint_done.items():
        all_member_avgs = []
        for sp_label, done_list in sprint_data.items():
            # Average Done per member in this tier for this sprint
            if done_list:
                avg_per_member = sum(done_list) / len(done_list)
                all_member_avgs.append(avg_per_member)
        tier_avg_done[tier_team_key] = round(sum(all_member_avgs) / len(all_member_avgs), 1) if all_member_avgs else 0
    print(f"  PE TRIPLO tier averages: {tier_avg_done}")
    print(f"  PE TRIPLO pilot history: {len(pilot_sprint_history)} pilots")

    # 1. PE do Sprint (meta proporcional — por time)
    print(f"  PE TRIPLO team_total_pts para distribuicao: {current_team_total_pts}")
    compute_pe_sprint(current_team_total_pts, current_pilots)

    # 2. PE Calibrada (distribuição da média histórica por time)
    team_historical_pts = {
        "HID": historical_average_pe_hid,
        "ELE": historical_average_pe_ele,
        "ACADEMY": historical_average_pe_academy,
        "Geral": historical_average_pe
    }
    compute_pe_calibrada(team_historical_pts, current_pilots)

    # 3. PE Individual (carro fantasma — histórico pessoal)
    compute_pe_individual(pilot_sprint_history, current_pilots)

    # 4. Telemetria de Consistência (precisa dos PEs calculados acima)
    compute_telemetry(current_pilots, current_tasks, sprint_start_dt, sprint_end_dt)

    # Backward-compatibility: set 'pe' to pe_sprint for any remaining references
    for p in current_pilots:
        p["pe"] = p.get("pe_sprint", 0)

    # Lead Time Ponderado (baseado no tempo REAL rastreado no ClickUp)
    def calc_lt(data):
        if not data:
            return {"avg": 0, "min": 0, "max": 0, "minTask": "", "maxTask": ""}
        sum_w = sum(x["value"] * x["points"] for x in data)
        sum_p = sum(x["points"] for x in data)
        avg_days = sum_w / sum_p if sum_p > 0 else 0
        h_avg = round(avg_days * 24, 1)
        
        lt_min = min(data, key=lambda x: x["value"])
        lt_max = max(data, key=lambda x: x["value"])
        return {
            "avg": h_avg,
            "min": round(lt_min["value_hours"], 1),
            "max": round(lt_max["value_hours"], 1),
            "minTask": f"{lt_min['task']} ({lt_min['owner']})",
            "maxTask": f"{lt_max['task']} ({lt_max['owner']})"
        }

    lt_global = calc_lt(lead_times_data)
    lt_hid = calc_lt([x for x in lead_times_data if x.get("team") == "HID"])
    lt_ele = calc_lt([x for x in lead_times_data if x.get("team") == "ELE"])
    
    if lead_times_data:
        print(f"  Lead Time Global: {lt_global['avg']}h | HID: {lt_hid['avg']}h | ELE: {lt_ele['avg']}h")

    # ═══════════════════════════════════════════════════════════════════
    # SINCRONIA: Esforço Total DINÂMICO + Dias Úteis (NUNCA hardcoded)
    # ═══════════════════════════════════════════════════════════════════
    esforco_total_sprint = current_total_points  # Sempre do ClickUp, NUNCA fixo
    ideal_ate_hoje = round(esforco_total_sprint * (dias_uteis_passados / max(1, dias_uteis_total)), 1)
    sincronia_pct = round((burndown_done_pts / max(1, ideal_ate_hoje)) * 100 - 100, 1) if ideal_ate_hoje > 0 else 0
    print(f"  Sincronia: Esforço={esforco_total_sprint}, Ideal={ideal_ate_hoje}, Done={burndown_done_pts}, Sync={sincronia_pct}%")

    # ═══════════════════════════════════════════════════════════════════
    # CARGA HORÁRIA RASTREADA (semanal) — indicador de aderência
    # NÃO afeta PE nem distribuição de tarefas
    # ═══════════════════════════════════════════════════════════════════
    try:
     # Tracking metrics (Weekly limits and percentages) with carry over logic
        tracked_hours_data = get_sprint_tracked_hours(sprint_start_dt)
        with open("flask_tracking_result.txt", "w") as f:
            f.write(f"Executed tracking! pilots: {len(tracked_hours_data)}\n")
            import json
            f.write(json.dumps(tracked_hours_data))
        print(f"  Weekly tracking: {len(tracked_hours_data)} pilots with data")
    except Exception as e:
        print(f"  Weekly tracking error: {e}")
        import traceback
        with open("flask_tracking_error.txt", "w") as f:
            f.write(f"Error: {e}\n{traceback.format_exc()}")
        tracked_hours_data = {}

    for p in current_pilots:
        norm = normalize_string(p["name"])
        tracked_info = tracked_hours_data.get(norm, {})
        p["tracked_hours"] = tracked_info.get("tracked_hours", 0)
        p["tracked_pct"] = tracked_info.get("tracked_pct", 0)
        p["tracked_color"] = tracked_info.get("tracked_color", "red")
            
        # Additional attributes for Modal breakdown
        p["tracked_wk1"] = tracked_info.get("tracked_wk1", 0)
        p["tracked_wk2"] = tracked_info.get("tracked_wk2", 0)
        p["target_wk1"] = tracked_info.get("target_wk1", 0)
        p["target_wk2"] = tracked_info.get("target_wk2", 0)
        p["deficit_wk1"] = tracked_info.get("deficit_wk1", 0)
        p["is_week2"] = tracked_info.get("is_week2", False)

    # Remover Julio Cesar do painel individual para nao influenciar graficos individuais
    final_pilots = [p for p in current_pilots if normalize_string(p["name"]) != "JULIO CESAR"]

    return {
        "status": "success",
        "pilots": final_pilots,
        "history": history,
        "current_sprint_id": CURRENT_SPRINT_ID,
        "current_sprint_label": CURRENT_SPRINT_LABEL,
        "raw_total_tasks": current_total_tasks,
        "raw_total_points": current_total_points,
        "raw_total_done": current_total_done,
        "raw_total_doing": current_total_doing,
        "historical_average_pe": historical_average_pe,
        "historical_average_pe_hid": historical_average_pe_hid,
        "historical_average_pe_ele": historical_average_pe_ele,
        "historical_average_pe_academy": historical_average_pe_academy,
        "leadTime": lt_global["avg"],
        "leadMin": lt_global["min"],
        "leadMax": lt_global["max"],
        "leadMinTask": lt_global["minTask"],
        "leadMaxTask": lt_global["maxTask"],
        "leadTime_HID": lt_hid["avg"],
        "leadMin_HID": lt_hid["min"],
        "leadMax_HID": lt_hid["max"],
        "leadMinTask_HID": lt_hid["minTask"],
        "leadMaxTask_HID": lt_hid["maxTask"],
        "leadTime_ELE": lt_ele["avg"],
        "leadMin_ELE": lt_ele["min"],
        "leadMax_ELE": lt_ele["max"],
        "leadMinTask_ELE": lt_ele["minTask"],
        "leadMaxTask_ELE": lt_ele["maxTask"],
        "leadTimeUnit": "h",
        "burndown_data": burndown_data,
        "flow_distribution": {
            "backlog_pts": flow_backlog_pts,
            "todo_pts": flow_todo_pts,
            "doing_pts": flow_doing_pts,
            "done_pts": flow_done_pts
        },
        "throughput_today": throughput_today,
        "arrival_today": arrival_today,
        "burndown_done_pts": burndown_done_pts,
        "sprint_start_date": sprint_start_date_iso,
        "esforco_total_sprint": esforco_total_sprint,
        "team_total_pts": current_team_total_pts,
        "team_done_pts": current_team_done_pts,
        "dias_uteis_total": dias_uteis_total,
        "dias_uteis_passados": dias_uteis_passados,
        "ideal_ate_hoje": ideal_ate_hoje,
        "sincronia_pct": sincronia_pct
    }


if __name__ == "__main__":
    print("Testando ClickUp Sync standalone...")
    result = get_production_metrics()
    print(json.dumps(result, indent=2, ensure_ascii=False))
