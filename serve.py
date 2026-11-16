"""Servidor local só do site. Uso: python serve.py [porta]. Bloqueia .claude, tools e arquivos de config."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

LIBERADO = ("/index.html", "/css/", "/js/", "/data/")

class H(SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.path.split("?")[0].split("#")[0]
        if p == "/" or p.startswith(LIBERADO):
            return super().do_GET()
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    do_HEAD = do_GET

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8000), H).serve_forever()
