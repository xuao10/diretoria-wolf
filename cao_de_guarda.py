"""
cao_de_guarda.py — Cloud Mode Stub
In cloud mode, file processing functions are available but directory monitoring is disabled.
This stub prevents ImportError while the actual file monitoring is not applicable in Docker.
"""
import os
import sys
import datetime


def wait_for_drive(timeout_mins=1):
    """In cloud mode, Drive is never available."""
    return False


def get_authenticated_service():
    """Stub - not used in cloud mode."""
    return None


def load_processed_files():
    return set()


def save_processed_file(filepath):
    pass


def identify_context(filepath):
    raise ValueError("Cloud mode: no local file processing")


def get_stage_date(client, project, stage):
    return datetime.datetime.now().strftime('%Y-%m-%d')


def process_pdf_file(filepath, project, stage, discipline):
    return []


def process_csv_file(filepath, project, stage, discipline):
    return []


def process_xlsx_file(filepath, project, stage, discipline):
    return [], []


def sync_to_cloud(client, **kwargs):
    return False


DIR_PROCESSADOS = None
