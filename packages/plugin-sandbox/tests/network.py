"""Local-only integration tests against the release binary and a real TCP server."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import unittest

BINARY = pathlib.Path(sys.argv.pop(1)).resolve()
spec = importlib.util.spec_from_file_location('fixture', pathlib.Path(__file__).parent.parent / 'examples/websocket-server.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class NetworkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = fixture.server(0)
        cls.other = fixture.server(0)
        for server in (cls.server, cls.other):
            threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.http = f'http://127.0.0.1:{cls.server.server_port}'
        cls.ws = cls.http.replace('http:', 'ws:')
        cls.target = f'http://127.0.0.1:{cls.other.server_port}'

    @classmethod
    def tearDownClass(cls):
        for server in (cls.server, cls.other):
            server.shutdown()
            server.server_close()

    def run_js(self, code, grant=True, private=True, extra=()):
        code = f'const HTTP={json.dumps(self.http)}, WS={json.dumps(self.ws)}, TARGET={json.dumps(self.target)};\n' + code
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'test.mjs'
            path.write_text(code)
            args = [str(BINARY), 'run', str(path)]
            if grant:
                args += ['--allow-net', self.http, '--allow-net', self.ws]
            if private:
                args += ['--allow-private-net']
            result = subprocess.run(args + list(extra), capture_output=True, text=True, timeout=6)
        self.assertEqual(result.returncode, 0, result.stderr)
        return [json.loads(line) for line in result.stdout.splitlines()]

    def test_fetch_default_deny_before_connect(self):
        before = len(self.server.hits)
        result = self.run_js('try { await fetch(HTTP); } catch(e) { postMessage([e.name,e.message]); }', grant=False)
        self.assertEqual(result[0][0], 'TypeError')
        self.assertIn('permission denied', result[0][1])
        self.assertEqual(len(self.server.hits), before)

    def test_private_requires_separate_grant(self):
        result = self.run_js('try { await fetch(HTTP); } catch(e) { postMessage(e.message); }', private=False)
        self.assertIn('Private/reserved', result[0])

    def test_fetch_json_headers_clone_and_consumption(self):
        result = self.run_js('const r=await fetch(HTTP+"/json"); const c=r.clone(); postMessage([r.status,r.ok,(await r.json()).hello,JSON.parse(await c.text()).hello,r.bodyUsed]); try {await r.text()} catch(e){postMessage(e.name)}; try {r.headers.set("x","y")}catch(e){postMessage(e.name)};')
        self.assertEqual(result, [[200, True, 'world', 'world', True], 'TypeError', 'TypeError'])

    def test_post_binary_request(self):
        result = self.run_js('const req=new Request(HTTP+"/echo",{method:"POST",body:new Uint8Array([0,255,42])}); const r=await fetch(req); postMessage([Array.from(new Uint8Array(await r.arrayBuffer())),req.bodyUsed]);')
        self.assertEqual(result, [[[0,255,42], True]])

    def test_http_error_is_response(self):
        self.assertEqual(self.run_js('const r=await fetch(HTTP+"/404");postMessage([r.status,r.ok]);await r.body.cancel();'), [[404, False]])

    def test_redirect_follow_and_manual(self):
        result = self.run_js('const r=await fetch(HTTP+"/redirect?to=/json");postMessage([r.status,r.redirected,r.url]); await r.body.cancel(); const m=await fetch(HTTP+"/redirect?to=/json",{redirect:"manual"});postMessage([m.status,m.type,m.body]);')
        self.assertEqual(result, [[200,True,self.http+'/json'],[0,'opaqueredirect',None]])

    def test_redirect_cannot_expand_permission(self):
        before = len(self.other.hits)
        result = self.run_js('try {await fetch(HTTP+"/redirect?to="+TARGET)}catch(e){postMessage(e.message)}')
        self.assertIn('permission denied', result[0])
        self.assertEqual(len(self.other.hits), before)

    def test_cross_origin_redirect_strips_authorization(self):
        result = self.run_js('const r=await fetch(HTTP+"/redirect?to="+TARGET,{headers:{Authorization:"secret"}});postMessage((await r.json()).headers);', extra=['--allow-net', self.target])
        self.assertNotIn('authorization', {key.lower():value for key,value in result[0].items()})

    def test_forbidden_host_header(self):
        result = self.run_js('const r=await fetch(HTTP,{headers:{Host:"evil.invalid",Cookie:"secret"}});postMessage((await r.json()).headers);')
        headers = {key.lower():value for key,value in result[0].items()}
        self.assertEqual(headers['host'], self.http.split('//')[1])
        self.assertNotIn('cookie', headers)

    def test_abort_and_timer_progress(self):
        result = self.run_js('const c=new AbortController();setTimeout(()=>c.abort(),20);try{await fetch(HTTP+"/slow",{signal:c.signal})}catch(e){postMessage(e.name)}')
        self.assertEqual(result, ['AbortError'])

    def test_preaborted_request_no_connection(self):
        before = len(self.server.hits)
        result = self.run_js('try{await fetch(HTTP,{signal:AbortSignal.abort("cancelled")})}catch(e){postMessage(e)}')
        self.assertEqual(result, ['cancelled'])
        self.assertEqual(len(self.server.hits), before)

    def test_large_response_stream(self):
        result = self.run_js('const r=await fetch(HTTP+"/large");let size=0;for await(const bytes of r.body)size+=bytes.length;postMessage(size)')
        self.assertEqual(result, [1024 * 1024 + 1])

    def test_shared_fetch_contract(self):
        source = (pathlib.Path(__file__).parent / 'fetch-contract.js').read_text()
        result = self.run_js('const FETCH_URL=HTTP;\n'+source)
        self.assertEqual(result, [['你好', 'sample.bin', [0,255,42], True, True, True], ['a b', '你好'], [[1,2,3],True], 'abc', 'TypeError', [[9,8],True], ['stop',True]])

    def test_abort_after_headers_errors_body(self):
        self.assertEqual(self.run_js('const c=new AbortController();const r=await fetch(HTTP,{signal:c.signal});c.abort();try{await r.text()}catch(e){postMessage(e.name)}'), ['AbortError'])

    def test_streaming_utf8_decode(self):
        self.assertEqual(self.run_js('const d=new TextDecoder();postMessage([d.decode(new Uint8Array([0xe4,0xbd]),{stream:true}),d.decode(new Uint8Array([0xa0]))]);'), [['', '你']])

    def test_sse_headers_arrive_before_body_and_decode_across_chunks(self):
        result = self.run_js('const r=await fetch(HTTP+"/stream");let tick=false;setTimeout(()=>{tick=true},20);let text="";for await(const chunk of r.body.pipeThrough(new TextDecoderStream())){if(!text)postMessage(tick);text+=chunk};postMessage(text)')
        self.assertEqual(result, [True, 'data: 你\n\ndata: done\n\n'])

    def test_websocket_denied_before_connect(self):
        before = len(self.server.hits)
        result = self.run_js('const s=new WebSocket(WS);s.onerror=()=>postMessage("error");s.onclose=e=>postMessage([e.code,e.wasClean,s.readyState]);', grant=False)
        self.assertEqual(result, ['error',[1006,False,3]])
        self.assertEqual(len(self.server.hits), before)

    def test_websocket_text_and_close(self):
        result = self.run_js('const s=new WebSocket(WS+"/echo","echo");s.onopen=()=>{postMessage([s.readyState,s.protocol]);s.send("你好")};s.onmessage=e=>{postMessage(e.data);s.close(1000,"done")};s.onclose=e=>postMessage([e.code,e.reason,e.wasClean,s.readyState]);')
        self.assertEqual(result, [[1,'echo'],'你好',[1000,'done',True,3]])

    def test_websocket_binary_arraybuffer(self):
        result = self.run_js('const s=new WebSocket(WS);s.binaryType="arraybuffer";s.onopen=()=>{s.send(new Uint8Array([0,255,42]));postMessage(s.bufferedAmount)};s.onmessage=e=>{postMessage(Array.from(new Uint8Array(e.data)));s.close()};')
        self.assertEqual(result, [3,[0,255,42]])

    def test_websocket_binary_blob(self):
        result = self.run_js('const s=new WebSocket(WS);s.onopen=()=>s.send(new Blob(["hello"]));s.onmessage=async e=>{postMessage([e.data instanceof Blob,await e.data.text()]);s.close()};')
        self.assertEqual(result, [[True,'hello']])

    def test_websocket_abrupt_disconnect(self):
        result = self.run_js('const s=new WebSocket(WS+"/abrupt");s.onerror=()=>postMessage("error");s.onclose=e=>postMessage([e.code,e.wasClean]);')
        self.assertEqual(result, ['error',[1006,False]])

    def test_websocket_validation(self):
        result = self.run_js('try{new WebSocket(WS+"#hash")}catch(e){postMessage(e.name)};const s=new WebSocket(WS);try{s.send("early")}catch(e){postMessage(e.name)};try{s.close(1006)}catch(e){postMessage(e.name)};s.onopen=()=>s.close();')
        self.assertEqual(result, ['SyntaxError','InvalidStateError','InvalidAccessError'])

    def test_close_cancels_network(self):
        self.assertEqual(self.run_js('new WebSocket(WS);setTimeout(()=>{postMessage("stopped");close()},20);'), ['stopped'])

    def test_websocket_close_while_connecting(self):
        result = self.run_js('const s=new WebSocket(WS);s.close();s.onclose=e=>postMessage([s.readyState,e.code]);')
        self.assertEqual(result[0][0], 3)


if __name__ == '__main__':
    unittest.main()
