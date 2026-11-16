"""Runs under a Scheduled-Task S4U logon to validate the headless environment.

Writes only booleans and a username to the result file; no credential
material is ever written or logged here.
"""

import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'backend' / '.state' / 'live' / 's4u-probe.json'
result = {
    'user': os.environ.get('USERNAME') or '?',
    'localappdata_set': bool(os.environ.get('LOCALAPPDATA')),
    'cwd_writable': os.access(ROOT, os.W_OK),
}

# SQL Server through the backend's own engine stack (same as the supervisor).
try:
    sys.path.insert(0, str(ROOT / 'backend'))
    os.chdir(ROOT / 'backend')
    from sqlalchemy import create_engine, text
    from app.core.database import database_url

    engine = create_engine(database_url())
    with engine.connect() as connection:
        connection.execute(text('SELECT 1'))
    result['sql_ok'] = True
except Exception as error:
    result['sql_ok'] = False
    result['sql_error'] = type(error).__name__

# Git credential availability; only success is recorded - the token itself
# is read into memory and discarded without ever reaching disk or logs.
try:
    git = sys.argv[1] if len(sys.argv) > 1 else 'git'
    environment = {**os.environ, 'GCM_INTERACTIVE': 'Never', 'GIT_TERMINAL_PROMPT': '0'}
    process = subprocess.run(
        [git, '-c', 'credential.interactive=never', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\n\n', text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30, env=environment,
    )
    fields = dict(line.split('=', 1) for line in process.stdout.splitlines() if '=' in line)
    result['git_ok'] = process.returncode == 0 and bool(fields.get('password'))
except Exception:
    result['git_ok'] = False

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, indent=2), encoding='utf-8')