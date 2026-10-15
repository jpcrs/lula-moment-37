"""Local-only native-animation artwork review; does not alter gameplay."""
import argparse
import http.server
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        route = self.path.split('?', 1)[0]
        fixed = {'/': 'web/characters/review.html', '/catalog.json': 'web/characters/native-animations.json',
                 '/reference.bin': 'outputs/character-audit/reference/sprites.bin',
                 '/custom.bin': 'web/dist/characters/suits.bin'}
        file = ROOT / fixed[route] if route in fixed else None
        if route.startswith('/reference/') and route[11:].startswith('sprites-') and route.endswith('.png') and '/' not in route[11:]:
            file = ROOT / 'outputs/character-audit/reference' / route[11:]
        if route.startswith('/custom/') and route[8:].startswith('suits-') and route.endswith('.png') and '/' not in route[8:]:
            file = ROOT / 'web/dist/characters' / route[8:]
        if file is None or not file.is_file():
            self.send_error(404)
            return
        data = file.read_bytes()
        kind = 'text/html; charset=utf-8' if file.suffix=='.html' else 'application/json' if file.suffix=='.json' else 'image/png' if file.suffix=='.png' else 'application/octet-stream'
        self.send_response(200);self.send_header('Content-Type', kind);self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store');self.end_headers();self.wfile.write(data)
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=3751);args=parser.parse_args()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Animation artwork review: http://localhost:{args.port}',flush=True)
    server.serve_forever()
