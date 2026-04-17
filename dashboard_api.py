import os
import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
import json
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import gspread
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from dotenv import load_dotenv
import math
import threading
import wolf_cache
import wolf_watcher

def sanitize_nan(obj):
    """Recursively replace NaN/Inf float values with None for valid JSON."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    elif isinstance(obj, dict):
        return {k: sanitize_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan(i) for i in obj]
    return obj

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Carregar Variaveis de Ambiente
load_dotenv(os.path.join(SCRIPT_DIR, 'wolf_factory.env'))
SHEET_ID = os.environ.get('WOLF_FACTORY_CONTROL_SHEET_ID')

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
TOKEN_FILE = os.path.join(SCRIPT_DIR, 'token.json')
CRED_FILE = os.path.join(SCRIPT_DIR, 'client_secret.json')

DASHBOARD_DIR = os.path.join(SCRIPT_DIR, 'wolf-factory-hq')
app = Flask(__name__, static_folder=DASHBOARD_DIR)
CORS(app, origins=["https://diretoria.wolfengenhariabim.com", "http://localhost:6061", "http://localhost:5173", "*"])
app.config['JSON_AS_ASCII'] = False # Força o retorno em UTF-8 nativo para as chaves acentuadas

@app.route('/')
def serve_dashboard():
    """Health check / landing page for the API."""
    return jsonify({"status": "online", "service": "Motor Wolf API", "version": "5.0"})

import clickup_sync

@app.route('/api/debug/path', methods=['GET'])
def debug_path():
    import sys
    return {
        "api_file": __file__,
        "sync_file": clickup_sync.__file__,
        "cwd": os.getcwd(),
        "pid": os.getpid(),
        "sys_path": sys.path
    }

@app.route('/api/clickup/production', methods=['GET'])
def get_clickup_production():
    """Retorna metricas de producao do ClickUp."""
    try:
        data = clickup_sync.get_production_metrics()
        response = jsonify(sanitize_nan(data))
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/status', methods=['GET'])
def api_status():
    """Retorna o status atual do cache e processamento."""
    return jsonify(wolf_cache.get_status())


def get_authenticated_service():
    """Autentica com google usando o token local já existente (CLOUD MODE: sem fluxo interativo)"""
    creds = None
    
    # Suporte a credenciais via Variável de Ambiente (Cloud Native)
    env_token = os.environ.get('GOOGLE_TOKEN_JSON')
    
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    elif env_token:
        try:
            token_dict = json.loads(env_token)
            creds = Credentials.from_authorized_user_info(token_dict, SCOPES)
        except Exception as e:
            print(f"⚠️ Erro ao carregar token da variável de ambiente: {e}")

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                
                # Atualizar o token dependendo de onde ele veio
                if os.path.exists(TOKEN_FILE):
                    with open(TOKEN_FILE, 'w') as token:
                        token.write(creds.to_json())
                else:
                    # Em cloud (via ENV), imprime no log pra avisar da renovação
                    print("✅ [AUTH] Token renovado na memória. Atualize no Coolify quando puder.")
            except Exception as e:
                print(f"⚠️ Erro ao atualizar token da API: {e}")
                raise RuntimeError(f"Token Google expirado e não pôde ser renovado: {e}")

        if not creds:
            # CLOUD MODE: Não pode abrir browser para OAuth interativo
            raise RuntimeError("Token Google não encontrado ou inválido. Adicione a variável GOOGLE_TOKEN_JSON no Coolify.")
    
    return gspread.authorize(creds)

# Configuração do RAG (ChromaDB) — CLOUD MODE: Desabilitado (sem base de vetores local)
from pathlib import Path
import datetime

CLOUD_MODE = os.environ.get('WOLF_CLOUD_MODE', '0') == '1'

try:
    import chromadb
    from chromadb.utils import embedding_functions
    CHROMA_AVAILABLE = True
except ImportError:
    CHROMA_AVAILABLE = False
    print("⚠️ ChromaDB não instalado — RAG desativado")

BASE_DIR = Path(r"G:\Meu Drive\ROBSON\WONKA WOLF V1\00_WOLF_KNOWLEDGE_BASE")
DB_DIR = BASE_DIR / "chroma_db"

def get_chroma_collection():
    """Conecta ao ChromaDB — retorna None em cloud mode."""
    if CLOUD_MODE or not CHROMA_AVAILABLE:
        return None
    if not hasattr(get_chroma_collection, "collection") or get_chroma_collection.collection is None:
        if not DB_DIR.exists():
            return None
        try:
            client = chromadb.PersistentClient(path=str(DB_DIR))
            ef = embedding_functions.DefaultEmbeddingFunction()
            get_chroma_collection.collection = client.get_collection(name="wolf_knowledge", embedding_function=ef)
            print("✅ Conectado ao ChromaDB (wolf_knowledge)")
        except Exception as e:
            print(f"⚠️ Erro ao conectar ChromaDB (RAG Desativado): {e}")
            get_chroma_collection.collection = None
    return get_chroma_collection.collection

def get_normas_collection():
    """Conecta a colecao wolf_normas — retorna None em cloud mode."""
    if CLOUD_MODE or not CHROMA_AVAILABLE:
        return None
    if not hasattr(get_normas_collection, "collection") or get_normas_collection.collection is None:
        if not DB_DIR.exists():
            return None
        try:
            client = chromadb.PersistentClient(path=str(DB_DIR))
            ef = embedding_functions.DefaultEmbeddingFunction()
            get_normas_collection.collection = client.get_collection(name="wolf_normas", embedding_function=ef)
            print("✅ Conectado ao ChromaDB (wolf_normas)")
        except Exception as e:
            print(f"⚠️ Colecao wolf_normas nao encontrada: {e}")
            get_normas_collection.collection = None
    return get_normas_collection.collection

@app.route('/api/issues', methods=['GET'])
def get_issues(bypass_cache=False):
    """Retorna todas as Issues da Aba Produção em JSON para o Dashboard, enriquecidas pelo RAG."""
    # Se não foi pedido bypass explícito (pelo watcher), procura no cache
    if not bypass_cache and not request.args.get('refresh'):
        cached_data, _ = wolf_cache.load_cache("issues")
        if cached_data is not None:
            return jsonify(sanitize_nan(cached_data))

    try:
        client = get_authenticated_service()
        sheet = client.open_by_key(SHEET_ID).worksheet("PRODUÇÃO")
        
        # Pega todos os registros e converte em dicionários
        records = sheet.get_all_records()
        
        # ==========================================
        # MOTOR RAG (Retrieval-Augmented Generation)
        # ==========================================
        col = get_chroma_collection()
        
        # Inicializa valores defaults seguros para não quebrar front
        for r in records:
            r['rag_match'] = True
            r['rag_source'] = ""
            r['rag_text'] = ""
            
        if col:
            # Seleciona apenas as issues que exigem validação rigorosa (Normas, Padrões, etc) 
            # Isso garante que a API fique rápida (poucos itens no RAG) enquanto não ignora as issues cruciais
            keywords = ['nbr', 'norma', 'desempenho', 'padrão', 'padrao', 'bombeiro', 'segurança', 'critico', 'crítico', 'distância']
            
            rag_subset = []
            for r in records:
                text = str(r.get('Descricao', '')).lower()
                if text and any(kw in text for kw in keywords):
                    rag_subset.append(r)
            
            # Limite de segurança extra para evitar travamentos
            RAG_BATCH_LIMIT = 300
            rag_subset = rag_subset[:RAG_BATCH_LIMIT]
            queries = [str(r.get('Descricao', '')) for r in rag_subset]
            
            if queries:
                try:
                    # Upgrade: Top-5 results for multi-level reasoning
                    results = col.query(query_texts=queries, n_results=5)
                    
                    for i, r in enumerate(rag_subset):
                        if results['distances'] and len(results['distances'][i]) > 0:
                            # Selection Logic: Find best source (Norma > Padrão > Projeto)
                            candidates = []
                            for j in range(len(results['distances'][i])):
                                dist = results['distances'][i][j]
                                meta = results['metadatas'][i][j]
                                doc = results['documents'][i][j]
                                
                                source_path = str(meta.get('source', '')).upper()
                                level = "SUGESTÃO"
                                if "01_NORMAS" in source_path: level = "NORMA"
                                elif "02_PADROES" in source_path: level = "PADRÃO"
                                
                                candidates.append({
                                    "dist": dist,
                                    "level": level,
                                    "source": meta.get('source', 'Documento Desconhecido'),
                                    "text": doc
                                })
                            
                            # Sort by Rigor first, then Distance
                            priority = {"NORMA": 0, "PADRÃO": 1, "SUGESTÃO": 2}
                            candidates = sorted(candidates, key=lambda x: (priority.get(x["level"], 3), x["dist"]))
                            
                            best = candidates[0]
                            if best["dist"] < 1.7: # Slightly more relaxed for top-5
                                r['rag_match'] = True
                                r['rag_source'] = best["source"]
                                r['rag_text'] = best["text"]
                                r['rag_level'] = best["level"]
                            else:
                                r['rag_match'] = False
                        else:
                            r['rag_match'] = False
                except Exception as e:
                    print(f"Erro na predição em lote do RAG: {e}")
        
        # ==========================================
        # DEFENSIVE DEDUPLICATION: Ensure unique ID_Issue PER PROJECT
        # ==========================================
        unique_records = {}
        for r in records:
            iid = str(r.get('ID_Issue', ''))
            proj = str(r.get('Nome_Projeto', ''))
            key = f"{proj}_{iid}"
            if iid and (key not in unique_records or len(str(r)) > len(str(unique_records[key]))):
                unique_records[key] = r
        records = list(unique_records.values())

        response_dict = {
            "status": "success",
            "count": len(records),
            "data": records
        }
        
        # Salva no cache sempre que busca dados frescos
        wolf_cache.save_cache("issues", response_dict)

        return jsonify(sanitize_nan(response_dict))
    except Exception as e:
        # Se falhou mas temos cache antigo, devolvemos pra não quebrar (resiliência)
        cached_data, _ = wolf_cache.load_cache("issues")
        if cached_data is not None:
            print(f"⚠️ Erro ao buscar issues ({e}). Servindo cache antigo.")
            return jsonify(sanitize_nan(cached_data))
            
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/checklists', methods=['GET'])
def get_checklists(bypass_cache=False):
    """Retorna os dados dos Checklists com Motor Preditivo e Drill-down."""
    print(">>> Entrou em /api/checklists")
    
    # Se não foi pedido bypass explícito, procura no cache primeiro
    if not bypass_cache and not request.args.get('refresh'):
        cached_data, _ = wolf_cache.load_cache("checklists")
        if cached_data is not None:
            return jsonify(sanitize_nan(cached_data))
            
    try:
        client = get_authenticated_service()
        ss = client.open_by_key(SHEET_ID)
        
        ws_scores = ss.worksheet("CHECKLIST_SCORES")
        ws_log = ss.worksheet("CHECKLISTS_LOG")
        
        scores_raw = ws_scores.get_all_records()
        logs_raw = ws_log.get_all_records()
        
        # SANITIZAÇÃO: Remover registros com nomes de etapa no campo Projeto
        # Estes foram gravados erroneamente pelo oompa_loompa_cloud_checklists
        KNOWN_ETAPA_NAMES = {'01_ESTUDO', '02_MODELAGEM', '03_DOCUMENTACAO', 'GERAL'}
        KNOWN_BAD_PROJECTS = {'GUIBE PESSOAL', '_TEMPLATE_PROJETO'}
        
        def is_valid_project(proj_name):
            p = str(proj_name).strip().upper()
            if p in KNOWN_ETAPA_NAMES:
                return False
            if proj_name in KNOWN_BAD_PROJECTS:
                return False
            if not p or p == '':
                return False
            return True
        
        scores_raw = [s for s in scores_raw if is_valid_project(s.get('Projeto', ''))]
        logs_raw = [l for l in logs_raw if is_valid_project(l.get('Projeto', ''))]
        print(f">>> Após sanitização: {len(scores_raw)} scores, {len(logs_raw)} logs")
        
        # 0. Mapa Temporal: Sincronização Dinâmica com Banco de Issues (PRODUÇÃO)
        ws_prod = ss.worksheet("PRODUÇÃO")
        prod_records = ws_prod.get_all_records()
        date_map = {}
        for r in prod_records:
            proj_issue = str(r.get('Nome_Projeto', '')).strip().upper()
            er = str(r.get('Etapa', '')).upper()
            etapa_issue = 'ESTUDO' if 'ESTUDO' in er else ('MODELAGEM' if 'MODELAGEM' in er else ('DOCUMENTACAO' if 'DOC' in er else 'OUT'))
            
            if not proj_issue or etapa_issue == 'OUT': continue
            
            # Pega a data da issue
            raw_date = str(r.get('Criado_Em', ''))
            import re
            parsed_date_str = ""
            m_iso = re.search(r'(\d{4})-(\d{2})-(\d{2})', raw_date)
            if m_iso:
                parsed_date_str = m_iso.group(0)
            elif re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', raw_date):
                m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', raw_date)
                parsed_date_str = f"{m.group(3)}-{str(m.group(2)).zfill(2)}-{str(m.group(1)).zfill(2)}"
            elif ' de ' in raw_date.lower():
                # Handle Portuguese dates like "28 de out de 2025" or "15 de março de 2026"
                pts = raw_date.lower().split(' de ')
                if len(pts) >= 3:
                    ms = {"jan": "01", "fev": "02", "mar": "03", "abr": "04", "mai": "05", "jun": "06", "jul": "07", "ago": "08", "set": "09", "out": "10", "nov": "11", "dez": "12"}
                    # Get year (part 2), month (part 1), day (part 0)
                    yr = pts[2].strip()[:4]
                    mo = ms.get(pts[1].strip()[:3], "01")
                    dy = pts[0].strip().zfill(2)
                    parsed_date_str = f"{yr}-{mo}-{dy}"
            
            if parsed_date_str:
                d_prod = str(r.get('Disciplina', '')).upper()
                d_norm = '01_ELETRICO' if 'EL' in d_prod else ('02_HIDROSSANITARIO' if 'HID' in d_prod else d_prod)
                
                k1 = f"{proj_issue}_{etapa_issue}"
                k2 = f"{proj_issue}_{etapa_issue}_{d_norm}"
                
                if k1 not in date_map or parsed_date_str > date_map[k1]: date_map[k1] = parsed_date_str
                if k2 not in date_map or parsed_date_str > date_map[k2]: date_map[k2] = parsed_date_str

        # 1. Agregação por Disciplina e Projeto (Preditivo)
        projects = {}
        for s in scores_raw:
            proj = s['Projeto']
            disc = s['Disciplina']
            score = float(s['Score'])
            
            key = f"{proj}_{disc}"
            if key not in projects:
                # Normaliza para o Frontend (ELE ou HID)
                d_up = disc.upper()
                disc_norm = "ELE" if ("ELET" in d_up or "EL" in d_up and "TRIC" in d_up or "EL" in d_up) else ("HID" if "HID" in d_up else disc)
                projects[key] = {"projeto": proj, "disciplina": disc_norm, "stages": [], "unique_stages_set": set()}
            
            # DEFENSIVE DEDUPLICATION: Solo el último score por etapa/disciplina
            stage_name = s.get('Etapa', 'N/A')
            key_stage = f"{key}_{stage_name}"
            
            # Sincronização de Data para o Gráfico (Linha de Balanço)
            p_log = str(proj).strip().upper()
            st_raw = str(stage_name).strip().upper()
            st_log = 'ESTUDO' if 'ESTUDO' in st_raw else ('MODELAGEM' if 'MODELAGEM' in st_raw else ('DOCUMENTACAO' if 'DOC' in st_raw else st_raw))
            
            d_norm_audit = '01_ELETRICO' if 'ELET' in disc.upper() or 'EL' in disc.upper() else ('02_HIDROSSANITARIO' if 'HID' in disc.upper() else disc.upper())
            
            # Normalização da Disciplina para o Frontend
            s['Disciplina'] = '01_ELETRICO' if 'EL' in d_norm_audit else '02_HIDROSSANITARIO'
            
            k_date_full = f"{p_log}_{st_log}_{d_norm_audit}"
            k_date_simple = f"{p_log}_{st_log}"
            canon_date = date_map.get(k_date_full, date_map.get(k_date_simple, s.get('Data_Fechamento', s.get('Data_Referencia', '2026-03-01'))))
            
            # ATUALIZA O REGISTRO ORIGINAL para o Front-end (Linha de Balanço)
            s['Data_Referencia'] = canon_date
            
            # Se já existe um score para esta etapa neste projeto/disciplina, sobrescrevemos (mantendo o mais recente)
            projects[key]["stages_map"] = projects[key].get("stages_map", {})
            projects[key]["stages_map"][stage_name] = {
                "etapa": stage_name, 
                "score": score,
                "Data_Referencia": canon_date
            }
            projects[key]["unique_stages_set"].add(stage_name)

        predictive_data = []
        for key, p in projects.items():
            stages_list = list(p["stages_map"].values())
            all_scores = [s['score'] for s in stages_list]
            avg = sum(all_scores) / len(all_scores)
            num_finished = len(p["unique_stages_set"])
            
            # Survival Calculation (Meta 90%, Surv 80%) - Assuming 3 stages total
            target_90 = (90 * 3) - sum(all_scores)
            target_80 = (80 * 3) - sum(all_scores)
            
            predictive_data.append({
                "projeto": p["projeto"],
                "disciplina": p["disciplina"],
                "media_atual": round(avg, 2),
                "finalizados": f"{num_finished}/3",
                "stages": stages_list,
                "meta_90": round(target_90, 2) if num_finished < 3 else None,
                "meta_80": round(target_80, 2) if num_finished < 3 else None,
                "alerta": (target_90 > 100) if num_finished < 3 else False
            })

        # 2. Agregação de Falhas (Drill-down V3 com Telemetria Dinâmica Histórica)
        failure_map = {}
        for l in logs_raw:
            try:
                # Tratar ID_Item para evitar "NAN" e garantir string limpa
                raw_id = l.get('ID_Item')
                if pd.isna(raw_id) or str(raw_id).strip().upper() == 'NAN' or str(raw_id).strip() == '':
                    item_id = "S/ID"
                else:
                    item_id = str(raw_id).replace('.0', '').strip()
            except:
                item_id = "S/ID"
                
            desc = str(l.get('Item_Desc', '')).strip()
            proj_log = str(l.get('Projeto', '')).strip().upper()
            stage_log = str(l.get('Etapa', '')).strip().upper()
            analyst = str(l.get('Analista', 'N/A')).strip()
            peso = l.get('Peso', 0)
            disc = str(l.get('Disciplina', '')).strip()
            
            # ID_Problema vem do banco de logs agora
            prob_id = str(l.get('ID_Problema', '')).replace('.0', '').strip()
            if prob_id.upper() == 'NAN' or not prob_id: prob_id = "N/A"
            
            analise = str(l.get('Analise_MRV', '')).strip().upper()
            
            # Cruza Etapa, Projeto e Disciplina com a Data Cânone do Banco de Issues
            st_norm_log = 'ESTUDO' if 'ESTUDO' in stage_log else ('MODELAGEM' if 'MODELAGEM' in stage_log else ('DOCUMENTACAO' if 'DOC' in stage_log else stage_log))
            
            d_norm = '01_ELETRICO' if 'ELET' in disc.upper() or 'EL' in disc.upper() else ('02_HIDROSSANITARIO' if 'HID' in disc.upper() else disc.upper())
            key_date_full = f"{proj_log}_{st_norm_log}_{d_norm}"
            key_date_simple = f"{proj_log}_{st_norm_log}"
            
            # Prioridade: 1. Proj+Etapa+Disc | 2. Proj+Etapa | 3. Data Ref do Checklist
            data_oficial_issue = date_map.get(key_date_full, date_map.get(key_date_simple, l.get('Data_Referencia', 'N/D')))
            
            # Chave Global: Agrupa o mesmo item de auditoria em todos os projetos
            # Usamos o ID do Item + Disciplina Normalizada como âncora
            key = f"{item_id} | {d_norm}"
            
            if key not in failure_map:
                failure_map[key] = {
                    "item": f"{item_id} - {desc}", 
                    "item_id": item_id,
                    "desc": desc,
                    "total": 0, 
                    "peso": peso, 
                    "disciplina": d_norm,
                    "disc": d_norm,
                    "projeto": proj_log, # Fallback para o primeiro encontrado
                    "etapa": stage_log,
                    "produto": "PROJETO",
                    "telemetry": [],
                    "details": []
                }
            
            # Telemetria Global: Guarda o histórico completo (CORRETO e INCORRETO)
            # Isso permite ver se o item "voltou a acertar" em outros relatórios
            failure_map[key]["telemetry"].append({
                "status": analise,
                "data": data_oficial_issue,
                "projeto": proj_log,
                "etapa": stage_log,
                "analista": analyst
            })

            # Contabilização de Falhas (Apenas INCORRETO)
            if analise == 'INCORRETO':
                failure_map[key]["total"] += 1
                failure_map[key]["details"].append({
                    "projeto": proj_log,
                    "etapa": stage_log,
                    "analista": analyst,
                    "peso": peso,
                    "prob_ids": prob_id
                })

        # Group by Discipline for Frontend Accordions
        grouped_failures = {"HIDROSSANITÁRIO": [], "ELÉTRICO": []}
        for f in failure_map.values():
            if f["total"] > 0: # Apenas mostra no Raio-X se houver pelo menos 1 falha
                # Ordena os blocos da telemetria daquele item da Esquerda para a Direita (Antigo -> Recente)
                f["telemetry"] = sorted(f["telemetry"], key=lambda x: str(x.get("data", "")))
                d = f["disciplina"].upper()
                target = "HIDROSSANITÁRIO" if "HID" in d else "ELÉTRICO"
                grouped_failures[target].append(f)

        # Sort each discipline by total failures
        for d in grouped_failures:
            grouped_failures[d] = sorted(grouped_failures[d], key=lambda x: x["total"], reverse=True)

        print(f">>> Sucesso em /api/checklists. Retornando {len(scores_raw)} summary logs.")
        response_data = {
            "status": "success",
            "predictive": predictive_data,
            "critical_ranking_v3": grouped_failures,
            "raw_logs": logs_raw,
            "summary_logs": scores_raw
        }
        
        # Salva no cache sempre que busca dados frescos
        wolf_cache.save_cache("checklists", response_data)
        
        return jsonify(sanitize_nan(response_data))
    except Exception as e:
        # Se falhou mas temos cache antigo, devolvemos pra não quebrar (resiliência)
        cached_data, _ = wolf_cache.load_cache("checklists")
        if cached_data is not None:
            print(f"⚠️ Erro ao buscar checklists ({e}). Servindo cache antigo.")
            return jsonify(sanitize_nan(cached_data))
            
        print(f">>> ERRO em /api/checklists: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/proxy-image', methods=['GET'])
def proxy_image():
    """Proxy for loading ClickUp profile pictures to bypass CORS issues on Canvas."""
    url = request.args.get('url')
    if not url:
        return "Missing URL", 400
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            image_data = response.read()
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            flask_resp = Response(image_data, content_type=content_type)
            # Permite que o canvas (origem local) leia os dados da imagem sem erro de Tainted Canvas
            flask_resp.headers['Access-Control-Allow-Origin'] = '*'
            flask_resp.headers['Cache-Control'] = 'public, max-age=86400'
            return flask_resp
    except Exception as e:
        print(f"Erro no proxy de imagem ({url}): {e}")
        return str(e), 500


@app.route('/api/verify-issue', methods=['GET'])
def verify_issue():
    """
    WOLF VEREDITO ENGINE V4 — Juiz Tecnico Inteligente.

    Evolucoes V4:
    - Busca hibrida: colecao wolf_normas (metadados ricos) + wolf_knowledge (legado)
    - Filtro por norma_id no ChromaDB (nao depende so de semantica)
    - Retorna secao, pagina e tabela exatos da norma
    - Modo advogado: detecta se solicitacao do analista tira projeto de norma
    - Contestacao inteligente com trecho literal da norma
    """
    import re

    issue_id = request.args.get('id')
    project = request.args.get('project')
    description = request.args.get('desc', '')

    if not description:
        return jsonify({"status": "error", "message": "Descricao nao fornecida"}), 400

    desc_lower = description.lower()

    # ── ETAPA 1: Mapeamento de Entidades ──
    entities = {
        "normas_citadas": [],
        "normas_ids": [],      # IDs para filtro no ChromaDB (ex: "NBR 8160", "NBR 05410")
        "parametros": [],
        "valores": [],
        "tipo_claim": "generico"
    }

    # Extrair normas citadas (NBR XXXX, NBR-XXXX)
    nbr_matches = re.findall(r'nbr[\s\-]?(\d{3,5})', desc_lower)
    for nbr in nbr_matches:
        label = f"NBR {nbr}"
        entities["normas_citadas"].append(label)
        # IDs possiveis no ChromaDB (com e sem zero a esquerda)
        entities["normas_ids"].append(label)
        if len(nbr) == 4:
            entities["normas_ids"].append(f"NBR 0{nbr}")
        if nbr.startswith('0'):
            entities["normas_ids"].append(f"NBR {nbr.lstrip('0')}")

    # Detectar mencao generica a norma
    if any(w in desc_lower for w in ['por norma', 'segundo norma', 'conforme norma', 'norma de desempenho', 'normativa']):
        if not entities["normas_citadas"]:
            entities["normas_citadas"].append("NORMA_GENERICA")

    # Detectar padronizacao MRV
    if any(w in desc_lower for w in ['padronizacao', 'padrao mrv', 'conforme padronizacao', 'padronizacao mrv']):
        entities["tipo_claim"] = "padronizacao"

    # Extrair valores numericos com unidades
    valor_patterns = re.findall(r'(\d+(?:[,\.]\d+)?)\s*(mm2|mm|cm|m|va|a|cv|kva|kw|l/s|dn|pol|")', desc_lower)
    for val, unit in valor_patterns:
        entities["valores"].append(f"{val}{unit}")

    # Extrair parametros-chave
    param_words = ['distancia', 'distância', 'diametro', 'diâmetro', 'potencia', 'potência',
                   'carga', 'secao', 'seção', 'bitola', 'profundidade', 'altura', 'volume',
                   'vazao', 'vazão', 'corrente', 'tensao', 'tensão', 'comprimento',
                   'afastamento', 'inclinacao', 'inclinação', 'declividade', 'espessura',
                   'ventilacao', 'ventilação', 'desconector', 'sifao', 'sifão',
                   'aterramento', 'seccionamento', 'queda de tensao']
    for pw in param_words:
        if pw in desc_lower:
            entities["parametros"].append(pw)

    # Classificar tipo de claim
    if entities["normas_citadas"] and entities["normas_citadas"][0] != "NORMA_GENERICA":
        entities["tipo_claim"] = "normativo"
    elif entities["normas_citadas"]:
        entities["tipo_claim"] = "normativo_generico"
    elif entities["valores"] and entities["parametros"]:
        entities["tipo_claim"] = "parametrico"

    # ── ETAPA 2: Busca Hibrida no ChromaDB ──
    col_normas = get_normas_collection()  # Colecao inteligente (V2)
    col_legacy = get_chroma_collection()  # Colecao legado
    rag_results = []

    def _query_collection(col, queries, n_results=5, where_filter=None):
        """Executa query no ChromaDB com tratamento de erro."""
        results = []
        if not col:
            return results
        try:
            kwargs = {"query_texts": queries, "n_results": n_results}
            if where_filter:
                kwargs["where"] = where_filter
            r = col.query(**kwargs)
            for qi in range(len(queries)):
                if r['documents'] and qi < len(r['documents']):
                    for j in range(len(r['documents'][qi])):
                        meta = r['metadatas'][qi][j] if r['metadatas'] else {}
                        results.append({
                            "text": r['documents'][qi][j],
                            "source": meta.get('source', ''),
                            "distance": r['distances'][qi][j],
                            "level": meta.get('nivel', 'NORMA') if 'nivel' in meta else (
                                "NORMA" if "NBR" in meta.get('source', '').upper() else "SUGESTAO"
                            ),
                            "pagina": meta.get('pagina', ''),
                            "secao": meta.get('secao', ''),
                            "secao_titulo": meta.get('secao_titulo', ''),
                            "tipo": meta.get('tipo', ''),
                            "norma_id": meta.get('norma_id', ''),
                            "keywords": meta.get('keywords', ''),
                        })
        except Exception as e:
            print(f"  Erro RAG query: {e}")
        return results

    # === ESTRATEGIA DE BUSCA MULTI-CAMADA ===

    # Camada 1: Busca FILTRADA por norma_id (mais precisa — recebe boost)
    if entities["normas_ids"] and col_normas:
        for nid in entities["normas_ids"]:
            queries_focused = [description]
            for param in entities["parametros"][:3] or ["requisito"]:
                queries_focused.append(f"{nid} {param}")
            # Query especifica para tabelas (muito util em normas)
            if entities["parametros"]:
                queries_focused.append(f"Tabela {' '.join(entities['parametros'][:3])} DN")
            for val in entities["valores"][:2]:
                queries_focused.append(f"{nid} {val}")

            results_filtered = _query_collection(
                col_normas, queries_focused[:5], n_results=8,
                where_filter={"norma_id": nid}
            )
            # Boost: resultados filtrados por norma sao mais confiaveis
            # Reduz distancia em 0.15 para priorizar na ordenacao
            for r in results_filtered:
                r['_filtered'] = True
                r['_original_distance'] = r['distance']
                r['distance'] = max(0.01, r['distance'] - 0.15)
            rag_results.extend(results_filtered)

    # Camada 2: Busca AMPLA na colecao de normas (sem filtro)
    if col_normas:
        results_broad = _query_collection(col_normas, [description], n_results=10)
        for r in results_broad:
            r['_filtered'] = False
        rag_results.extend(results_broad)

    # Camada 3: Busca na colecao legado (compatibilidade)
    if col_legacy and not rag_results:
        results_legacy = _query_collection(col_legacy, [description], n_results=10)
        for r in results_legacy:
            src = r['source'].upper()
            if "NBR" in src or "NORMA" in src:
                r['level'] = "NORMA"
            elif "PADRON" in src or "MRV" in src:
                r['level'] = "PADRAO"
            r['_filtered'] = False
        rag_results.extend(results_legacy)

    # Boost extra para resultados que sao tabelas (mais uteis para validacao)
    for r in rag_results:
        if r.get('tipo') == 'tabela':
            r['distance'] = max(0.01, r['distance'] - 0.1)

    # Deduplicar e ordenar por distancia (ja com boosts aplicados)
    seen = set()
    unique_results = []
    for r in sorted(rag_results, key=lambda x: x['distance']):
        key = r['text'][:120]
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    rag_results = unique_results

    # ── ETAPA 3: Motor de Veredito V4 ──
    verdict = {
        "acao": "DADO_INSUFICIENTE",
        "confianca": 0,
        "resumo": "",
        "contestacao": "",
        "fundamentacao": [],
        "localizacao_norma": [],  # NOVO: secao/pagina/tabela exatos
        "modo_advogado": None,    # NOVO: protecao do projetista
        "entities": entities
    }

    # Classificar resultados
    norma_results = [r for r in rag_results if r.get('level') == 'NORMA' and r['distance'] < 1.2]
    padrao_results = [r for r in rag_results if r.get('level') in ('PADRAO', 'PADRÃO') and r['distance'] < 1.5]
    all_relevant = [r for r in rag_results if r['distance'] < 1.2]

    def _build_localizacao(results, max_items=5):
        """Constroi lista de localizacoes precisas na norma."""
        locs = []
        for r in results[:max_items]:
            loc = {
                "norma": r.get('norma_id', '') or r.get('source', '').split(',')[0],
                "pagina": r.get('pagina', ''),
                "secao": r.get('secao', ''),
                "secao_titulo": r.get('secao_titulo', ''),
                "tipo": r.get('tipo', ''),
                "trecho": r.get('text', '')[:600],
                "distancia": round(r['distance'], 3),
                "nivel": r.get('level', ''),
            }
            locs.append(loc)
        return locs

    def _build_fundamentacao(results, max_items=5):
        """Constroi fundamentacao com todos os metadados."""
        return [{
            "fonte": r['source'],
            "trecho": r['text'][:600],
            "distancia": round(r['distance'], 3),
            "nivel": r.get('level', 'SUGESTAO'),
            "pagina": r.get('pagina', ''),
            "secao": r.get('secao', ''),
            "secao_titulo": r.get('secao_titulo', ''),
            "tipo": r.get('tipo', ''),
            "norma_id": r.get('norma_id', ''),
        } for r in results[:max_items]]

    def _check_valor_overlap(results, valores):
        """Verifica se valores numericos da issue aparecem no texto normativo."""
        for r in results[:5]:
            norm_text = r['text'].lower()
            for val in valores:
                num = re.sub(r'[^\d,.]', '', val)
                if num and num in norm_text:
                    return True, r
        return False, None

    # ═══════════════════════════════════════════════════════════════
    # CENARIO A: CLAIM NORMATIVO (analista cita NBR especifica)
    # ═══════════════════════════════════════════════════════════════
    if entities["tipo_claim"] == "normativo":
        if norma_results:
            best = norma_results[0]
            verdict["fundamentacao"] = _build_fundamentacao(norma_results)
            verdict["localizacao_norma"] = _build_localizacao(norma_results)

            has_overlap, overlap_result = _check_valor_overlap(norma_results, entities["valores"])
            confidence_boost = 15 if has_overlap else 0

            if best['distance'] < 0.6:
                # Correspondencia EXATA — norma confirma o apontamento
                verdict["acao"] = "VALIDAR"
                verdict["confianca"] = min(98, 95 + confidence_boost)
                loc = verdict["localizacao_norma"][0] if verdict["localizacao_norma"] else {}
                loc_str = ""
                if loc.get("secao"):
                    loc_str = f", Secao {loc['secao']}"
                if loc.get("pagina"):
                    loc_str += f" (Pagina {loc['pagina']})"
                verdict["resumo"] = (
                    f"VALIDADO. A {best.get('norma_id', best['source'])}{loc_str} "
                    f"confirma o apontamento do analista com alta precisao. "
                    f"O projetista deve corrigir conforme a norma."
                )

            elif best['distance'] < 0.9:
                verdict["acao"] = "VALIDAR"
                verdict["confianca"] = min(90, int((1.2 - best['distance']) / 1.2 * 100) + confidence_boost)
                loc = verdict["localizacao_norma"][0] if verdict["localizacao_norma"] else {}
                verdict["resumo"] = (
                    f"VALIDADO. Correspondencia encontrada na {best.get('norma_id', best['source'])}"
                    f"{', Secao ' + loc.get('secao','') if loc.get('secao') else ''}"
                    f"{' (Pagina ' + str(loc.get('pagina','')) + ')' if loc.get('pagina') else ''}. "
                    f"A norma sustenta o apontamento. Recomenda-se verificacao do trecho exato."
                )

            elif best['distance'] < 1.2:
                # Correspondencia MODERADA — pode validar mas com ressalvas
                verdict["acao"] = "VERIFICAR"
                verdict["confianca"] = min(70, int((1.5 - best['distance']) / 1.5 * 100) + confidence_boost)
                verdict["resumo"] = (
                    f"Correspondencia moderada em {best.get('norma_id', best['source'])}. "
                    f"O trecho encontrado e relacionado mas nao confirma com precisao absoluta. "
                    f"Verificar manualmente a Secao {best.get('secao','')} Pagina {best.get('pagina','')}."
                )
            else:
                # Correspondencia FRACA — contestar
                verdict["acao"] = "CONTESTAR"
                verdict["confianca"] = 65
                norma_str = ', '.join(entities['normas_citadas'])
                verdict["resumo"] = (
                    f"A {norma_str} foi consultada mas a correspondencia e fraca. "
                    f"O apontamento pode carecer de fundamento tecnico preciso."
                )
                verdict["contestacao"] = (
                    f"Em analise ao referencial normativo citado ({norma_str}), "
                    f"nao foi encontrado trecho que confirme com precisao o apontamento. "
                    f"Solicitamos que o analista indique o artigo, paragrafo e tabela "
                    f"especificos da norma que fundamentam esta inconformidade."
                )

            # ── MODO ADVOGADO: Verificar se a solicitacao CONTRADIZ a norma ──
            if verdict["acao"] == "VALIDAR" and norma_results:
                # Aqui verificamos se o que o analista pede TIRA o projeto de norma
                # Ex: analista pede distancia de 0,5m mas a norma exige minimo 1,0m
                advogado_check = _check_analista_contradiz_norma(
                    description, norma_results, entities
                )
                if advogado_check:
                    verdict["modo_advogado"] = advogado_check

        else:
            # Nenhuma norma encontrada na base
            verdict["acao"] = "CONTESTAR"
            verdict["confianca"] = 85
            norma_str = ', '.join(entities['normas_citadas']) if entities['normas_citadas'] else 'a norma citada'
            verdict["resumo"] = (
                f"O analista cita {norma_str}, porem NAO foi encontrada correspondencia "
                f"na base de conhecimento Wolf (2.695 trechos normativos indexados). "
                f"Possivel embasamento incorreto ou norma ausente da base."
            )
            verdict["contestacao"] = (
                f"O apontamento carece de fundamento tecnico verificavel. "
                f"A {norma_str} foi consultada na base de conhecimento Wolf e nao foi "
                f"localizado trecho que sustente esta inconformidade. "
                f"Solicitamos que o analista forneca: "
                f"1) O numero exato da norma; "
                f"2) A secao/artigo aplicavel; "
                f"3) A tabela de referencia, se houver. "
                f"Sem estas informacoes, o apontamento nao pode ser acatado."
            )

    # ═══════════════════════════════════════════════════════════════
    # CENARIO B: CLAIM NORMATIVO GENERICO (cita "norma" sem numero)
    # ═══════════════════════════════════════════════════════════════
    elif entities["tipo_claim"] == "normativo_generico":
        if all_relevant:
            best = all_relevant[0]
            verdict["acao"] = "VERIFICAR"
            verdict["confianca"] = min(60, int((1.2 - best['distance']) / 1.2 * 100))
            verdict["fundamentacao"] = _build_fundamentacao(all_relevant)
            verdict["localizacao_norma"] = _build_localizacao(all_relevant)
            verdict["resumo"] = (
                f"O analista menciona 'norma' sem especificar qual. "
                f"Referencia possivelmente relacionada encontrada em "
                f"{best.get('norma_id', best['source'])}. Verificacao manual necessaria."
            )
        else:
            verdict["acao"] = "CONTESTAR"
            verdict["confianca"] = 75
            verdict["resumo"] = "O analista cita 'norma' genericamente mas sem especificar qual NBR."
            verdict["contestacao"] = (
                "O apontamento faz referencia a 'norma' de forma generica, "
                "sem indicar a NBR especifica. Solicitamos que o analista "
                "indique a norma ABNT aplicavel (ex: NBR 5410, NBR 8160) "
                "e o artigo/secao que fundamenta a inconformidade."
            )

    # ═══════════════════════════════════════════════════════════════
    # CENARIO C: CLAIM DE PADRONIZACAO MRV
    # ═══════════════════════════════════════════════════════════════
    elif entities["tipo_claim"] == "padronizacao":
        if padrao_results:
            best = padrao_results[0]
            verdict["fundamentacao"] = _build_fundamentacao(padrao_results)
            if best['distance'] < 1.0:
                verdict["acao"] = "VALIDAR"
                verdict["confianca"] = min(90, int((1.5 - best['distance']) / 1.5 * 100))
                verdict["resumo"] = f"Confirmado na padronizacao MRV ({best['source']})."
            else:
                verdict["acao"] = "VERIFICAR"
                verdict["confianca"] = 50
                verdict["resumo"] = f"Correspondencia parcial em {best['source']}. Validacao manual recomendada."
        else:
            verdict["acao"] = "CONTESTAR"
            verdict["confianca"] = 70
            verdict["resumo"] = "Padronizacao MRV citada mas nao encontrada na base."
            verdict["contestacao"] = (
                "O apontamento cita a padronizacao MRV, porem nao foi localizado "
                "na base Wolf o item especifico. Solicitamos que o analista "
                "indique o capitulo e item da padronizacao MRV aplicavel."
            )

    # ═══════════════════════════════════════════════════════════════
    # CENARIO D: CLAIM PARAMETRICO (valores sem norma)
    # ═══════════════════════════════════════════════════════════════
    elif entities["tipo_claim"] == "parametrico":
        if all_relevant:
            best = all_relevant[0]
            verdict["acao"] = "VERIFICAR"
            verdict["confianca"] = min(60, int((1.2 - best['distance']) / 1.2 * 100))
            verdict["fundamentacao"] = _build_fundamentacao(all_relevant)
            verdict["localizacao_norma"] = _build_localizacao(all_relevant)
            verdict["resumo"] = (
                f"Parametros ({', '.join(entities['parametros'])}: {', '.join(entities['valores'])}) "
                f"encontrados em {best.get('norma_id', best['source'])}. "
                f"Cruzamento manual recomendado."
            )
        else:
            verdict["acao"] = "DADO_INSUFICIENTE"
            verdict["confianca"] = 30
            verdict["resumo"] = (
                f"Parametros citados ({', '.join(entities['parametros'])}: "
                f"{', '.join(entities['valores'])}) sem referencia normativa localizada."
            )

    # ═══════════════════════════════════════════════════════════════
    # CENARIO E: GENERICO (sem norma, sem parametro)
    # ═══════════════════════════════════════════════════════════════
    else:
        if all_relevant:
            verdict["acao"] = "VERIFICAR"
            verdict["confianca"] = 35
            verdict["fundamentacao"] = _build_fundamentacao(all_relevant[:3])
            verdict["resumo"] = "Descricao generica. Referencia relacionada encontrada, mas insuficiente para validacao automatica."
        else:
            verdict["acao"] = "DADO_INSUFICIENTE"
            verdict["confianca"] = 20
            verdict["resumo"] = "Descricao generica sem referencia normativa. Veredito automatizado impossivel."
            verdict["contestacao"] = (
                "O apontamento nao cita norma, padrao MRV ou parametro tecnico. "
                "Solicitamos fundamentacao tecnica (norma, artigo, padrao) "
                "para que a inconformidade possa ser verificada."
            )

    # ── Top referencias ──
    verdict["referencias"] = [{
        "fonte": r['source'],
        "trecho": r['text'][:500],
        "distancia": round(r['distance'], 3),
        "nivel": r.get('level', 'SUGESTAO'),
        "pagina": r.get('pagina', ''),
        "secao": r.get('secao', ''),
        "norma_id": r.get('norma_id', ''),
    } for r in rag_results[:7]]

    return jsonify({
        "status": "success",
        "issue_id": issue_id,
        "project": project,
        "verdict": verdict
    })


def _check_analista_contradiz_norma(description, norma_results, entities):
    """
    MODO ADVOGADO: Verifica se o que o analista solicita
    poderia tirar o projeto de conformidade com a norma.

    Retorna dict com alerta se detectar contradicao, None caso contrario.
    """
    import re
    desc_lower = description.lower()

    # Detectar se o analista esta PEDINDO algo (verbos imperativos)
    verbos_ordem = ['alterar', 'mudar', 'trocar', 'substituir', 'reduzir',
                    'diminuir', 'aumentar', 'remover', 'eliminar', 'retirar',
                    'deslocar', 'mover', 'reposicionar']
    is_ordering = any(v in desc_lower for v in verbos_ordem)

    if not is_ordering:
        return None

    # Verificar se valores da norma sao mais restritivos que o pedido do analista
    # Ex: norma diz minimo 1,0m e analista quer 0,5m
    for r in norma_results[:3]:
        norm_text = r['text'].lower()
        # Extrair valores numericos do texto normativo
        norm_values = re.findall(r'(\d+(?:[,\.]\d+)?)\s*(mm|cm|m|dn)', norm_text)
        desc_values = re.findall(r'(\d+(?:[,\.]\d+)?)\s*(mm|cm|m|dn)', desc_lower)

        if norm_values and desc_values:
            # Comparacao simplificada: alertar que ha valores diferentes
            return {
                "alerta": "ATENCAO: A norma pode impor limites que conflitem com a solicitacao do analista.",
                "trecho_norma": r['text'][:400],
                "localizacao": f"{r.get('norma_id', '')} Secao {r.get('secao', '')} Pagina {r.get('pagina', '')}",
                "recomendacao": (
                    "Antes de acatar a solicitacao, verifique se os valores "
                    "exigidos pela norma sao compatíveis com o que esta sendo pedido. "
                    "Caso a alteracao solicitada viole a norma, o projetista tem "
                    "direito de contestar o apontamento."
                )
            }

    return None


@app.route('/api/export-dossier', methods=['GET'])
def export_dossier():
    """Gera um Dossiê estruturado para upload no NotebookLM."""
    issue_id = request.args.get('id')
    project = request.args.get('project')
    
    if not issue_id or not project:
        return jsonify({"status": "error", "message": "Missing ID or Project"}), 400

    try:
        client = get_authenticated_service()
        sheet = client.open_by_key(SHEET_ID).worksheet("PRODUÇÃO")
        records = sheet.get_all_records()
        
        issue = next((r for r in records if str(r.get('ID_Issue')) == str(issue_id) and r.get('Nome_Projeto') == project), None)
        
        if not issue:
            return "Issue não encontrada.", 404

        # RAG Context Re-query for Dossier
        col = get_chroma_collection()
        context_text = "Nenhum contexto encontrado na base de conhecimento."
        if col:
            q_res = col.query(query_texts=[str(issue.get('Descricao', ''))], n_results=10)
            if q_res['documents'] and len(q_res['documents'][0]) > 0:
                context_text = "\n\n---\n\n".join([f"FONTE: {m.get('source')}\nCONTEÚDO: {d}" for m, d in zip(q_res['metadatas'][0], q_res['documents'][0])])

        dossier = f"""# DOSSIÊ DE AUDITORIA WOLF
## ISSUE: {issue.get('Descricao')}
**ID:** {issue_id} | **PROJETO:** {project}
**DISCIPLINA:** {issue.get('Disciplina')} | **ETAPA:** {issue.get('Etapa')}
**COMENTÁRIO ANALISTA:** {issue.get('Comentario_Analista', 'N/A')}

---

## CONTEXTO DE CONHECIMENTO (FONTE PARA O NOTEBOOK LM)
{context_text}

---

## INSTRUÇÃO PARA O NOTEBOOK LM:
Você é um consultor sênior de normas ABNT e padrões MRV. 
Analise se a ISSUE acima é uma violação real baseada no CONTEXTO fornecido. 
Gere uma CONTESTAÇÃO técnica citando o item específico da norma se houver divergência.
"""
        return dossier, 200, {
            'Content-Type': 'text/markdown',
            'Content-Disposition': f'attachment; filename=dossie_wolf_{issue_id}.md'
        }
    except Exception as e:
        return str(e), 500

def pre_warm_cache():
    """Warms the cache from Google Sheets if it is not already loaded on disk."""
    with app.app_context():
        try:
            print("⏳ Initializing cache and background extraction engine...")
            wolf_cache.set_status(processing=True)
            
            # Start watcher in background
            wolf_watcher.start()
            
            # The watcher might take care of the initial refresh if there's no cache, but let's be safe:
            import time
            time.sleep(2) # brief pause to let watcher initialize
            wolf_cache.set_status(processing=False)
            
        except Exception as e:
            print(f"❌ Erro no pre-warm do cache: {e}")
            wolf_cache.set_status(processing=False, error=str(e))

# Pre-warm cache on gunicorn worker start
threading.Thread(target=pre_warm_cache, daemon=True, name="WolfPreWarm").start()

if __name__ == '__main__':
    print("🐺 Motor API WOLF OOMPA-LOOMPA Iniciado - Servindo dados na porta 6061")
    print(f"📊 Dashboard disponível em: http://localhost:6061/")
    
    app.run(host='0.0.0.0', port=6061, debug=False, use_reloader=False)
