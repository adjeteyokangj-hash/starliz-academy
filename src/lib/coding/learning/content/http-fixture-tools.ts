// Each fixture binds only loopback inside the isolated student container.
export const httpFixtureModule = `import json, threading, time, urllib.request, urllib.error, urllib.parse, socket, http.client
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer

@contextmanager
def fixture_service(script):
    events = []
    lock = threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def respond(self):
            with lock:
                index = len(events)
                item = script[min(index, len(script) - 1)]
                events.append({'attempt': index + 1, 'method': self.command, 'path': self.path, 'accept': self.headers.get('Accept', '')})
            status = item.get('status', 200)
            body = item.get('body', {})
            if self.command != 'GET' or urllib.parse.urlsplit(self.path).path != '/observations':
                status, body = 404, {'error': 'Unknown controlled request contract'}
            time.sleep(item.get('delay_s', 0))
            encoded = json.dumps(body).encode('utf-8')
            try:
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError):
                pass
        do_GET = do_POST = respond
    if not script:
        raise ValueError('Supply at least one controlled response')
    # Main client plus one serial fixture worker fit the runner's nproc=2 limit.
    server = HTTPServer(('127.0.0.1', 0), Handler)
    worker = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.01), daemon=True)
    worker.start()
    try:
        yield 'http://127.0.0.1:' + str(server.server_port), events
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=0.5)

def read_json(base, path, timeout_s=0.3):
    request = urllib.request.Request(base + path, method='GET', headers={'Accept': 'application/json'})
    try:
        try:
            response = urllib.request.urlopen(request, timeout=timeout_s)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return {'status': response.status, 'body': json.loads(response.read(8192)), 'error': None}
    except (TimeoutError, socket.timeout):
        return {'status': None, 'body': None, 'error': 'timeout'}
    except urllib.error.URLError as error:
        return {'status': None, 'body': None, 'error': 'timeout' if isinstance(error.reason, (TimeoutError, socket.timeout)) else 'request-error'}
    except (http.client.HTTPException, OSError):
        return {'status': None, 'body': None, 'error': 'request-error'}
`;
