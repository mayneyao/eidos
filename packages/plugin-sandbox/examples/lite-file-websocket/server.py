"""Loopback-only demo echo server; Python standard library, no dependencies.

Supports the unfragmented text frames used by this plugin, plus ping/close.
Not a general-purpose or production WebSocket server.
"""
import base64
import hashlib
import struct
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Echo(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path != "/echo" or self.headers.get("Upgrade", "").lower() != "websocket":
            self.send_error(400, "Use WebSocket /echo")
            return
        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()
        ).digest()).decode()
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.close_connection = True
        print("CONNECTED", self.client_address, flush=True)
        self.connection.settimeout(600)
        try:
            while True:
                header = self.rfile.read(2)
                if len(header) != 2:
                    break
                opcode, size = header[0] & 15, header[1] & 127
                if not header[0] & 128 or not header[1] & 128 or opcode not in (1, 8, 9):
                    break
                if size == 126:
                    size = struct.unpack("!H", self.rfile.read(2))[0]
                elif size == 127:
                    size = struct.unpack("!Q", self.rfile.read(8))[0]
                if size > 1024 * 1024:
                    break
                mask = self.rfile.read(4)
                data = self.rfile.read(size)
                if len(mask) != 4 or len(data) != size:
                    break
                data = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
                reply_opcode = 10 if opcode == 9 else opcode
                prefix = bytes([128 | reply_opcode, size]) if size < 126 else bytes([128 | reply_opcode, 126]) + struct.pack("!H", size) if size < 65536 else bytes([128 | reply_opcode, 127]) + struct.pack("!Q", size)
                self.wfile.write(prefix + data)
                self.wfile.flush()
                print("ECHO", self.client_address, size, "bytes", flush=True)
                if opcode == 8:
                    break
        except (OSError, ValueError, struct.error):
            pass
        finally:
            print("DISCONNECTED", self.client_address, flush=True)


def server(port=8787):
    return ThreadingHTTPServer(("127.0.0.1", port), Echo)


if __name__ == "__main__":
    with server() as instance:
        print("Listening on ws://127.0.0.1:8787/echo", flush=True)
        try:
            instance.serve_forever()
        except KeyboardInterrupt:
            pass
