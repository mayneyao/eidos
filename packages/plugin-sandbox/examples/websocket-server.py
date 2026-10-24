"""Local HTTP + WebSocket echo fixture. Python standard library only; not a production server."""
import base64
import hashlib
import json
import struct
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.server.hits.append(self.path)
        if self.headers.get('Upgrade', '').lower() == 'websocket':
            return self.websocket()
        path = urlsplit(self.path)
        if path.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', parse_qs(path.query)['to'][0])
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path.path == '/slow':
            time.sleep(.3)
        if path.path == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Transfer-Encoding', 'chunked')
            self.end_headers()
            self.wfile.flush()
            try:
                for chunk in [b'data: \xe4\xbd', b'\xa0\n\n', b'data: done\n\n']:
                    time.sleep(.15)
                    self.wfile.write(f'{len(chunk):x}\r\n'.encode() + chunk + b'\r\n')
                    self.wfile.flush()
                self.wfile.write(b'0\r\n\r\n')
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if path.path == '/large':
            return self.respond(b'x' * (1024 * 1024 + 1))
        self.respond(json.dumps({'hello': 'world', 'headers': dict(self.headers)}).encode(),
                     404 if path.path == '/404' else 200)

    def do_POST(self):
        self.server.hits.append(self.path)
        self.respond(self.rfile.read(int(self.headers.get('Content-Length', 0))), content_type=self.headers.get('Content-Type', 'application/octet-stream'))

    def respond(self, data, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def websocket(self):
        key = self.headers['Sec-WebSocket-Key']
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept)
        if 'echo' in self.headers.get('Sec-WebSocket-Protocol', '').split(', '):
            self.send_header('Sec-WebSocket-Protocol', 'echo')
        self.end_headers()
        self.wfile.flush()
        self.close_connection = True
        if self.path == '/abrupt':
            return
        self.connection.settimeout(5)
        try:
            while True:
                prefix = self.rfile.read(2)
                if len(prefix) != 2:
                    return
                opcode = prefix[0] & 15
                length = prefix[1] & 127
                if length == 126:
                    length = struct.unpack('!H', self.rfile.read(2))[0]
                elif length == 127:
                    length = struct.unpack('!Q', self.rfile.read(8))[0]
                if length > 2 * 1024 * 1024:
                    return
                mask = self.rfile.read(4) if prefix[1] & 128 else b''
                data = self.rfile.read(length)
                if mask:
                    data = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
                if opcode not in (1, 2, 8, 9):
                    continue
                opcode = 10 if opcode == 9 else opcode
                size = len(data)
                header = bytes([128 | opcode, size]) if size < 126 else bytes([128 | opcode, 126]) + struct.pack('!H', size) if size < 65536 else bytes([128 | opcode, 127]) + struct.pack('!Q', size)
                self.wfile.write(header + data)
                self.wfile.flush()
                if opcode == 8:
                    return
        except (OSError, ValueError):
            pass


def server(port=8787):
    instance = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    instance.hits = []
    instance.daemon_threads = True
    return instance


if __name__ == '__main__':
    with server() as instance:
        print('HTTP: http://127.0.0.1:8787/json; WebSocket: ws://127.0.0.1:8787/echo', flush=True)
        try:
            instance.serve_forever()
        except KeyboardInterrupt:
            pass
