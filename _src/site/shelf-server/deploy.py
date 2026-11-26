# Deploys the 연구실 책장 server to the owner's Cloudflare account (run from the Claude session; the API token is added
# by the session's network proxy, never stored here). First run: creates the R2 bucket and the Worker with its secrets.
# Later runs: updates the Worker code and keeps the stored secrets. The PIN is never written anywhere: on the first run
# it is read from the environment variable SHELF_PIN for that one command only and only its peppered hash is uploaded.
import json, os, secrets, hashlib, sys, urllib.request, uuid

API = 'https://api.cloudflare.com/client/v4'
BUCKET = 'bookshelf'
SCRIPT = 'bookshelf'
ORIGINS = 'https://0128.kr,https://www.0128.kr'
HERE = os.path.dirname(os.path.abspath(__file__))

def call(method, path, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {'content-type': 'application/json'} if raw is None and body is not None else {}
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode())
        except Exception: return {'success': False, 'errors': [{'code': e.code, 'message': str(e)}]}

def account():
    d = call('GET', '/accounts?per_page=5')
    return d['result'][0]['id']

def main(first):
    acc = account()
    # 1. the bucket (Asia-Pacific): only made on the first run (an update needs no storage permission)
    b = call('GET', f'/accounts/{acc}/r2/buckets/{BUCKET}') if first else {'success': True}
    if not b.get('success'):
        c = call('POST', f'/accounts/{acc}/r2/buckets', {'name': BUCKET, 'locationHint': 'apac'})
        print('bucket:', c.get('success'), c.get('errors'))
        if not c.get('success'): sys.exit(1)
    else:
        print('bucket: exists')
    # 2. the worker
    meta = {
        'main_module': 'worker.js',
        'compatibility_date': '2025-09-01',
        'bindings': [
            {'type': 'r2_bucket', 'name': 'BUCKET', 'bucket_name': BUCKET},
            {'type': 'plain_text', 'name': 'ALLOWED_ORIGINS', 'text': ORIGINS},
            {'type': 'ai', 'name': 'AI'},   # Workers AI (the search by meaning)
        ],
    }
    if first:
        pin = os.environ.get('SHELF_PIN', '')
        if not (len(pin) == 6 and pin.isdigit()): sys.exit('SHELF_PIN must be the 6-digit PIN (only for this command)')
        pepper = secrets.token_hex(24)
        meta['bindings'] += [
            {'type': 'secret_text', 'name': 'PEPPER', 'text': pepper},
            {'type': 'secret_text', 'name': 'PIN_HASH', 'text': hashlib.sha256((pepper + ':' + pin).encode()).hexdigest()},
        ]
    else:
        meta['keep_bindings'] = ['secret_text', 'plain_text']   # keys the owner set in the dashboard (secret or text) stay
    code = open(os.path.join(HERE, 'worker.js'), 'rb').read()
    boundary = '----shelf' + uuid.uuid4().hex
    parts = []
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"; filename="metadata.json"\r\nContent-Type: application/json\r\n\r\n'.encode() + json.dumps(meta).encode() + b'\r\n')
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n'.encode() + code + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    up = call('PUT', f'/accounts/{acc}/workers/scripts/{SCRIPT}', raw=b''.join(parts), headers={'content-type': f'multipart/form-data; boundary={boundary}'})
    print('worker:', up.get('success'), up.get('errors'))
    if not up.get('success'): sys.exit(1)
    # 3. reachable at <script>.<subdomain>.workers.dev
    s = call('POST', f'/accounts/{acc}/workers/scripts/{SCRIPT}/subdomain', {'enabled': True, 'previews_enabled': False})
    print('workers.dev route:', s.get('success'), s.get('errors'))
    sub = (call('GET', f'/accounts/{acc}/workers/subdomain').get('result') or {}).get('subdomain')   # needs a permission an update token may lack
    if sub: print('url: https://%s.%s.workers.dev' % (SCRIPT, sub))

if __name__ == '__main__':
    main('--first' in sys.argv)
