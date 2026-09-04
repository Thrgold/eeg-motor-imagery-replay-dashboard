"""Manual WebSocket client for a configured local replay backend."""
import argparse,asyncio,json,websockets
async def run(uri,session_dir):
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({'session_dir':session_dir,'rest_threshold':0.5,'speed_multiplier':2.0}))
        while True:
            try: print(await asyncio.wait_for(ws.recv(),timeout=15))
            except asyncio.TimeoutError: break
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('session_dir');p.add_argument('--uri',default='ws://localhost:8080/stream');a=p.parse_args();asyncio.run(run(a.uri,a.session_dir))
