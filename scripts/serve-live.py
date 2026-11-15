"""Keep the local API and its public tunnel running from a Windows scheduled task."""

import argparse
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import queue
import re
import signal
import socket
import subprocess
import sys
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / 'backend'
STATE = BACKEND / '.state' / 'live'
LOCAL_URL = 'http://127.0.0.1:8000'
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
TUNNEL_URL = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com\b')


def read_json(url, *, headers=None, method='GET', body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, headers=headers or {}, method=method)
    with urlopen(request, timeout=20) as response:
        content = response.read()
        return (json.loads(content) if content else None), response.headers


def credential(git):
    environment = {**os.environ, 'GCM_INTERACTIVE': 'Never', 'GIT_TERMINAL_PROMPT': '0'}
    result = subprocess.run(
        [git, '-c', 'credential.interactive=never', 'credential', 'fill'],
        input='protocol=https\nhost=github.com\n\n', text=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30,
        env=environment, cwd=ROOT, creationflags=NO_WINDOW,
    )
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    token = fields.get('password')
    if result.returncode or not token:
        raise RuntimeError('GitHub credentials are unavailable')
    return token


def github_headers(git):
    return {
        'Authorization': f'Bearer {credential(git)}',
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'EarthTrend-live-supervisor',
    }


def pages_dispatch_runs(repository, headers):
    url = (f'https://api.github.com/repos/{repository}/actions/workflows/deploy-pages.yml/runs'
           '?event=workflow_dispatch&branch=main&per_page=10')
    data, _ = read_json(url, headers=headers)
    return data['workflow_runs']


def publish_api_url(git, repository, api_url):
    headers = github_headers(git)
    base = f'https://api.github.com/repos/{repository}/actions'
    variable = f'{base}/variables/VITE_API_BASE_URL'
    try:
        existing, _ = read_json(variable, headers=headers)
    except HTTPError as error:
        if error.code != 404:
            raise
        existing = None
    body = {'name': 'VITE_API_BASE_URL', 'value': api_url}
    if existing is None:
        read_json(f'{base}/variables', headers=headers, method='POST', body=body)
    elif existing.get('value') != api_url:
        read_json(variable, headers=headers, method='PATCH', body=body)
    baseline = max((run['id'] for run in pages_dispatch_runs(repository, headers)), default=0)
    # Always retry dispatch until it succeeds, including after a successful variable update.
    read_json(f'{base}/workflows/deploy-pages.yml/dispatches', headers=headers,
              method='POST', body={'ref': 'main'})
    return baseline


def port_is_open():
    try:
        with socket.create_connection(('127.0.0.1', 8000), timeout=1):
            return True
    except OSError:
        return False


def public_is_ready(api_url, origin):
    data, headers = read_json(f'{api_url}/api/v1/health/readiness', headers={'Origin': origin})
    return data.get('status') == 'ready' and headers.get('Access-Control-Allow-Origin') == origin


def collect_output(stream, output):
    try:
        for line in stream:
            output.put(line.rstrip())
    finally:
        stream.close()


def stop_child(process):
    if process is None or process.poll() is not None:
        return
    try:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cloudflared', required=True, type=lambda value: str(Path(value).resolve(strict=True)))
    parser.add_argument('--git', required=True, type=lambda value: str(Path(value).resolve(strict=True)))
    parser.add_argument('--repository', default='Mohammed-Emad2004/Earth-Trend-Detective')
    args = parser.parse_args()
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', args.repository):
        parser.error('--repository must have the form owner/repository')
    STATE.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(STATE / 'supervisor.log', maxBytes=2_000_000, backupCount=2, encoding='utf-8')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=[handler])
    stopping = threading.Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda *_: stopping.set())
    origin = f'https://{args.repository.split("/")[0].lower()}.github.io'
    origins = ['http://localhost:5173', 'https://maria-ashraf-haleem.github.io',
               'https://mohammed-emad2004.github.io', origin]
    environment = {**os.environ, 'CORS_ORIGINS': json.dumps(list(dict.fromkeys(origins)))}
    backend = tunnel = None
    output = queue.Queue()
    api_url = deployed_url = None
    pending_deployment = None
    next_publish = 0
    logging.info('Starting live runtime for %s', args.repository)
    with (STATE / 'backend.log').open('a', encoding='utf-8') as backend_log:
        try:
            while not stopping.is_set():
                try:
                    if backend is not None and backend.poll() is not None:
                        logging.warning('Owned backend exited with status %s', backend.returncode)
                        backend = None
                    if backend is None and not port_is_open():
                        backend = subprocess.Popen(
                            [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1',
                             '--port', '8000', '--no-access-log'], cwd=BACKEND, env=environment,
                            stdin=subprocess.DEVNULL, stdout=backend_log, stderr=subprocess.STDOUT,
                            creationflags=NO_WINDOW,
                        )
                        logging.info('Started backend process %s', backend.pid)
                    if tunnel is None or tunnel.poll() is not None:
                        if tunnel is not None:
                            logging.warning('Tunnel exited with status %s', tunnel.returncode)
                        api_url = None
                        deployed_url = pending_deployment = None
                        output = queue.Queue()
                        tunnel = subprocess.Popen(
                            [args.cloudflared, 'tunnel', '--url', LOCAL_URL, '--no-autoupdate',
                             '--protocol', 'http2'], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace',
                            creationflags=NO_WINDOW,
                        )
                        threading.Thread(target=collect_output, args=(tunnel.stdout, output), daemon=True).start()
                        logging.info('Started tunnel process %s', tunnel.pid)
                    while not output.empty():
                        line = output.get_nowait()
                        logging.info('cloudflared %s', line)
                        match = TUNNEL_URL.search(line)
                        if match and match.group() != api_url:
                            api_url = match.group()
                            deployed_url = pending_deployment = None
                            next_publish = 0
                            logging.info('Public API origin is %s', api_url)
                    if api_url and api_url != deployed_url and time.monotonic() >= next_publish:
                        next_publish = time.monotonic() + 30
                        if pending_deployment:
                            runs = pages_dispatch_runs(args.repository, github_headers(args.git))
                            newer_runs = [run for run in runs if run['id'] > pending_deployment['baseline']]
                            run = min(newer_runs, key=lambda item: item['id'], default=None)
                            if run and run['status'] == 'completed':
                                if run['conclusion'] == 'success':
                                    deployed_url = pending_deployment['url']
                                    logging.info('Pages deployment %s succeeded', run['id'])
                                else:
                                    logging.warning('Pages deployment %s ended with %s, retrying',
                                                    run['id'], run['conclusion'])
                                pending_deployment = None
                                next_publish = time.monotonic() + 30
                            elif run is None and time.monotonic() - pending_deployment['requested_at'] >= 120:
                                logging.warning('Pages dispatch produced no run within 120 seconds, retrying')
                                pending_deployment = None
                                next_publish = time.monotonic() + 30
                        elif public_is_ready(api_url, origin):
                            baseline = publish_api_url(args.git, args.repository, api_url)
                            pending_deployment = {'url': api_url, 'baseline': baseline,
                                                  'requested_at': time.monotonic()}
                            logging.info('Updated API variable and requested Pages deployment')
                        else:
                            logging.info('Waiting for public API readiness and CORS')
                    status = {'repository': args.repository, 'api_url': api_url,
                              'backend_pid': backend.pid if backend else None, 'tunnel_pid': tunnel.pid,
                              'deployment_requested': bool(pending_deployment or (api_url and api_url == deployed_url)),
                              'deployment_completed': bool(api_url and api_url == deployed_url)}
                    temporary = STATE / 'status.tmp'
                    temporary.write_text(json.dumps(status, indent=2), encoding='utf-8')
                    temporary.replace(STATE / 'status.json')
                except Exception as error:
                    # Exception text and HTTP bodies can contain credential-provider details.
                    logging.warning('Runtime operation failed (%s, HTTP %s), retrying',
                                    type(error).__name__, getattr(error, 'code', 'none'))
                stopping.wait(5)
        finally:
            stop_child(tunnel)
            stop_child(backend)
            logging.info('Stopped owned runtime processes')


if __name__ == '__main__':
    main()
