"""Release binary + explicitly selected mock transport. Does not prove radio/device behavior."""
import json
import pathlib
import queue
import subprocess
import sys
import tempfile
import threading
import time
import unittest

BINARY = pathlib.Path(sys.argv.pop(1)).resolve()
ROOT = pathlib.Path(__file__).resolve().parent.parent
POLICY = ROOT / 'examples/bluetooth-policy.mock.json'
PREAMBLE = '''const [device] = await navigator.bluetooth.getDevices();
const server = await device.gatt.connect();
const service = await server.getPrimaryService('battery_service');
const characteristic = await service.getCharacteristic('battery_level');
'''


class BluetoothTests(unittest.TestCase):
    def run_js(self, source, grant=True, policy=None, extra=(), input=None, success=True):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'test.mjs'
            path.write_text(source)
            args = [str(BINARY), 'run', str(path), '--bluetooth-mock']
            if grant:
                target = POLICY
                if policy is not None:
                    target = pathlib.Path(directory) / 'policy.json'
                    target.write_text(json.dumps(policy))
                args += ['--bluetooth-policy', str(target)]
            if input is not None:
                args += ['--listen']
            result = subprocess.run(args + list(extra), input=input, text=True, capture_output=True, timeout=7)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
            return result
        return [json.loads(line) for line in result.stdout.splitlines()]

    def test_default_denial_and_no_picker(self):
        result = self.run_js('postMessage([await navigator.bluetooth.getDevices(),await navigator.bluetooth.getAvailability(),typeof __bluetooth]);try{await navigator.bluetooth.requestDevice({acceptAllDevices:true})}catch(e){postMessage(e.name)}', grant=False)
        self.assertEqual(result, [[[], False, 'undefined'], 'NotSupportedError'])

    def test_no_implicit_connection(self):
        result = self.run_js('const [d]=await navigator.bluetooth.getDevices();postMessage([d.id,d.gatt.connected,(await navigator.bluetooth.getDevices())[0]===d]);')
        self.assertEqual(result, [['mock-battery', False, True]])

    def test_gatt_read_and_dataview(self):
        result = self.run_js(PREAMBLE + 'const v=await characteristic.readValue();postMessage([server.connected, v instanceof DataView,v.getUint8(0),characteristic.properties.read,characteristic.properties.write]);device.gatt.disconnect();')
        self.assertEqual(result, [[True,True,85,True,False]])

    def test_disconnect_event(self):
        result = self.run_js(PREAMBLE + 'device.addEventListener("gattserverdisconnected",e=>postMessage([e.target===device,server.connected]));server.disconnect();postMessage(server.connected);')
        self.assertEqual(result, [False,[True,False]])

    def test_notifications_keep_worker_alive_without_timer(self):
        result = self.run_js(PREAMBLE + 'characteristic.oncharacteristicvaluechanged=e=>{postMessage(e.target.value.getUint8(0));server.disconnect()};await characteristic.startNotifications();')
        self.assertEqual(result, [85])

    def test_connected_without_subscription_keeps_alive(self):
        result = self.run_js(PREAMBLE, extra=['--max-duration-ms','200'], success=False)
        self.assertIn('Total duration limit', result.stderr)

    def test_denied_service(self):
        result = self.run_js(PREAMBLE + 'try{await server.getPrimaryService("heart_rate")}catch(e){postMessage(e.name)}server.disconnect();')
        self.assertEqual(result, ['SecurityError'])

    def test_denied_read_notify_write(self):
        policy = {'devices':[{'id':'mock-battery','services':[{'uuid':'battery_service'}]}]}
        result = self.run_js(PREAMBLE + 'for(const f of [()=>characteristic.readValue(),()=>characteristic.startNotifications(),()=>characteristic.writeValueWithResponse(new Uint8Array([1]))]){try{await f()}catch(e){postMessage(e.name)}}server.disconnect();', policy=policy)
        self.assertEqual(result, ['SecurityError'] * 3)

    def test_stale_characteristic_after_reconnect(self):
        result = self.run_js(PREAMBLE + 'const done=new Promise(r=>device.ongattserverdisconnected=r);server.disconnect();await done;await server.connect();try{await characteristic.readValue()}catch(e){postMessage(e.name)}server.disconnect();')
        self.assertEqual(result, ['InvalidStateError'])

    def test_write_read_binary(self):
        result = self.run_js('const [d]=await navigator.bluetooth.getDevices();const s=await d.gatt.connect();const c=await (await s.getPrimaryService("12345678-1234-5678-1234-56789abcdef0")).getCharacteristic("12345678-1234-5678-1234-56789abcdef1");await c.writeValueWithResponse(new Uint8Array([0,255,42]));postMessage(Array.from(new Uint8Array((await c.readValue()).buffer)));await c.writeValueWithoutResponse(new Uint8Array([7]));postMessage((await c.readValue()).getUint8(0));s.disconnect();')
        self.assertEqual(result, [[0,255,42],7])

    def test_write_size_limit(self):
        result = self.run_js(PREAMBLE + 'try{await characteristic.writeValueWithResponse(new Uint8Array(513))}catch(e){postMessage(e.name)}server.disconnect();')
        self.assertEqual(result, ['QuotaExceededError'])

    def test_policy_strict_unknown_and_duplicate(self):
        for policy in [{'devices':[], 'allowAll':True}, {'devices':[{'id':'x','services':[]},{'id':'x','services':[]}]}]:
            self.run_js('postMessage("bad")', policy=policy, success=False)

    def test_device_id_cannot_be_forged(self):
        result = self.run_js('const [d]=await navigator.bluetooth.getDevices();try{d.id="other"}catch(e){postMessage(e.name)}try{new BluetoothDevice()}catch(e){postMessage(e.name)}postMessage(d.id);')
        self.assertEqual(result, ['TypeError','TypeError','mock-battery'])

    def test_missing_device(self):
        policy = {'devices':[{'id':'unknown','services':[]}]}
        result = self.run_js('const [d]=await navigator.bluetooth.getDevices();try{await d.gatt.connect()}catch(e){postMessage(e.name)}postMessage(d.gatt.connected)', policy=policy)
        self.assertEqual(result, ['NotFoundError',False])

    def test_close_cleans_up(self):
        self.assertEqual(self.run_js(PREAMBLE+'close();'), [])

    def test_uuid_normalization(self):
        result = self.run_js('postMessage([BluetoothUUID.getService(0x180f),BluetoothUUID.getCharacteristic("battery_level")]);')
        self.assertEqual(result, [['0000180f-0000-1000-8000-00805f9b34fb','00002a19-0000-1000-8000-00805f9b34fb']])

    def test_cancel_connect(self):
        result = self.run_js('const [d]=await navigator.bluetooth.getDevices();const p=d.gatt.connect();d.gatt.disconnect();try{await p}catch(e){postMessage(e.name)}postMessage(d.gatt.connected);')
        self.assertEqual(result, ['AbortError',False])

    def test_stop_notifications(self):
        result = self.run_js(PREAMBLE+'await characteristic.startNotifications();await characteristic.stopNotifications();characteristic.oncharacteristicvaluechanged=()=>postMessage("unexpected");await new Promise(r=>setTimeout(r,650));server.disconnect();')
        self.assertEqual(result, [])

    def test_example_message_lifecycle(self):
        messages = [{'type':'list'},{'type':'connect','id':'mock-battery'},{'type':'status'},{'type':'read'},{'type':'disconnect'},{'type':'status'},{'type':'stop'}]
        result = self.run_js((ROOT/'examples/bluetooth.mjs').read_text(), input=''.join(json.dumps(m)+'\n' for m in messages))
        self.assertEqual([e['connected'] for e in result if e['type']=='status'], [True,False])
        self.assertIn('subscribed', [e['type'] for e in result])
        self.assertNotIn('error', [e['type'] for e in result])

    def test_interactive_example_waits_for_message_and_stays_connected(self):
        process = subprocess.Popen([str(BINARY), 'run', str(ROOT/'examples/bluetooth.mjs'), '--listen', '--bluetooth-mock', '--bluetooth-policy', str(POLICY), '--max-duration-ms', '0'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        events = queue.Queue()
        def collect():
            for line in process.stdout:
                events.put(json.loads(line))
        thread = threading.Thread(target=collect, daemon=True)
        thread.start()
        def receive(kind):
            end = time.monotonic()+4
            while time.monotonic() < end:
                event = events.get(timeout=max(.01,end-time.monotonic()))
                self.assertNotEqual(event['type'], 'error', event)
                if event['type'] == kind:
                    return event
            self.fail('Missing event '+kind)
        def send(message):
            process.stdin.write(json.dumps(message)+'\n')
            process.stdin.flush()
        try:
            receive('ready')
            send({'type':'status'})
            self.assertFalse(receive('status')['connected'])
            send({'type':'connect','id':'mock-battery'})
            receive('connected')
            receive('subscribed')
            self.assertEqual(receive('battery')['percent'],85)
            self.assertIsNone(process.poll())
            send({'type':'status'})
            self.assertTrue(receive('status')['connected'])
            send({'type':'stop'})
            receive('disconnected')
            self.assertEqual(process.wait(timeout=4),0)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdin.close()
            thread.join(timeout=1)
            process.stdout.close()
            process.stderr.close()


if __name__ == '__main__':
    unittest.main()
