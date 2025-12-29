import os
import sys
import subprocess
import json
import shutil
import webbrowser
import threading
import re
import socket
import uuid
import time
from io import BytesIO

# --- 1. AUTO-INSTALLER ---
def install(package):
    print(f"[*] Installing missing library: {package}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
    from PIL import Image, ImageOps
except ImportError:
    try:
        install("flask")
        install("flask-cors")
        install("Pillow")
        os.execv(sys.executable, ['python'] + sys.argv)
    except Exception as e:
        input(f"Error: {e}")
        sys.exit(1)

# --- 2. CONFIGURATION ---
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024 # 1GB Limit

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
TRASH_FILE = os.path.join(BASE_DIR, 'trash.json')
UNFILLED_FILE = os.path.join(BASE_DIR, 'unfilled.json') # <--- NEW
DRAFT_FILE = os.path.join(BASE_DIR, 'draft.json')
BACKUP_FILE = os.path.join(BASE_DIR, 'data.json.bak')

IMAGE_DIR = os.path.join(BASE_DIR, 'images')
BUFFER_DIR = os.path.join(IMAGE_DIR, 'buffer')
TRASH_IMG_DIR = os.path.join(IMAGE_DIR, 'trash')

PORT = 8000

for d in [IMAGE_DIR, BUFFER_DIR, TRASH_IMG_DIR]:
    if not os.path.exists(d): os.makedirs(d)

for f in [DATA_FILE, TRASH_FILE, DRAFT_FILE, UNFILLED_FILE]:
    if not os.path.exists(f):
        with open(f, 'w') as file: json.dump([], file)

# --- 3. HELPER FUNCTIONS ---
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except: IP = '127.0.0.1'
    finally: s.close()
    return IP

def load_json(path, default_type=[]):
    if not os.path.exists(path): return default_type
    try:
        with open(path, 'r') as f: 
            content = f.read().strip()
            return json.loads(content) if content else default_type
    except: return default_type

def save_json(path, data):
    if path == DATA_FILE and os.path.exists(DATA_FILE):
        try: shutil.copyfile(DATA_FILE, BACKUP_FILE)
        except: pass
    with open(path, 'w') as f: json.dump(data, f, indent=4)

def finalize_filename(rel_path, new_base_name):
    # Only move if it is in buffer. If already in images/, keep it.
    if not rel_path or "buffer" not in rel_path: return rel_path
    
    filename = os.path.basename(rel_path)
    full_src = os.path.join(BUFFER_DIR, filename)
    if not os.path.exists(full_src): return rel_path
    
    ext = os.path.splitext(filename)[1]
    new_name = new_base_name + ext
    full_dest = os.path.join(IMAGE_DIR, new_name)
    
    if os.path.exists(full_dest): os.remove(full_dest)
    shutil.move(full_src, full_dest)
    return f"images/{new_name}"

def move_to_trash(rel_path):
    if not rel_path: return ""
    filename = os.path.basename(rel_path)
    if "buffer" in rel_path: full_src = os.path.join(BUFFER_DIR, filename)
    else: full_src = os.path.join(IMAGE_DIR, filename)
    
    if not os.path.exists(full_src): return rel_path
    full_dest = os.path.join(TRASH_IMG_DIR, filename)
    if os.path.exists(full_dest): os.remove(full_dest)
    shutil.move(full_src, full_dest)
    return f"images/trash/{filename}"

def move_from_trash(rel_path):
    if not rel_path: return ""
    filename = os.path.basename(rel_path)
    full_src = os.path.join(TRASH_IMG_DIR, filename)
    if not os.path.exists(full_src): return rel_path
    full_dest = os.path.join(IMAGE_DIR, filename)
    if os.path.exists(full_dest): os.remove(full_dest)
    shutil.move(full_src, full_dest)
    return f"images/{filename}"

# --- 4. API ROUTES ---

@app.route('/')
def serve_index(): return send_from_directory('.', 'main.html')

@app.route('/<path:path>')
def serve_static(path): return send_from_directory('.', path)

# --- DRAFT SYNC ---
@app.route('/api/draft', methods=['GET', 'POST', 'DELETE'])
def manage_draft():
    if request.method == 'GET': return jsonify(load_json(DRAFT_FILE, {})), 200
    if request.method == 'POST': save_json(DRAFT_FILE, request.json); return jsonify({"status": "saved"}), 200
    if request.method == 'DELETE':
        save_json(DRAFT_FILE, {})
        # Only clean buffer if explicitly requested, otherwise "Complete Later" might lose files if user clears draft locally
        return jsonify({"status": "cleared"}), 200

# --- UPLOAD ---
@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        file = request.files.get('file')
        if not file: return jsonify({"error": "No file"}), 400
        ext = os.path.splitext(file.filename)[1].lower() or '.jpg'
        temp_name = f"temp_{int(time.time())}_{uuid.uuid4().hex[:6]}{ext}"
        save_path = os.path.join(BUFFER_DIR, temp_name)
        if ext in ['.mp4', '.mov', '.avi']: file.save(save_path)
        else:
            img = Image.open(file.stream)
            img = ImageOps.exif_transpose(img)
            if img.mode != 'RGBA': img = img.convert('RGBA')
            save_path = save_path.replace(ext, '.png')
            img.save(save_path, 'PNG')
        return jsonify({"status": "success", "url": f"images/buffer/{os.path.basename(save_path)}"}), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

# --- SAVE TO UNFILLED (Complete Later) ---
@app.route('/api/save-incomplete', methods=['POST'])
def save_incomplete():
    try:
        data = request.json
        raw_id = data.get("id")
        safe_id = "".join([c for c in raw_id if c.isalnum() or c in ('-', '_')])
        
        # Move images to MAIN folder immediately so they are safe
        main_img = finalize_filename(data.get("mainImage"), f"{safe_id}_draft_main")
        gallery = [finalize_filename(p, f"{safe_id}_draft_{i+1}") for i, p in enumerate(data.get("gallery", []))]

        product = {
            "id": raw_id,
            "name": data.get("name"),
            "category": data.get("category"),
            "fabric": data.get("fabric"),
            "color": data.get("color"),
            "price": data.get("price"),
            "discount_price": data.get("discount_price"),
            "desc": data.get("desc"),
            "stars": int(data.get("stars", 5)),
            "stock": data.get("stock"),
            "stock_count": int(data.get("stock_count", 0)),
            "image": main_img,
            "gallery": gallery,
            "timestamp": int(time.time())
        }

        # Save to UNFILLED.json
        unfilled_data = load_json(UNFILLED_FILE, [])
        unfilled_data = [p for p in unfilled_data if p['id'] != raw_id]
        unfilled_data.append(product)
        save_json(UNFILLED_FILE, unfilled_data)
        
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

# --- SAVE TO LIVE (Add Product) ---
@app.route('/api/add-product', methods=['POST'])
def add_product():
    try:
        data = request.json
        raw_id = data.get("id")
        safe_id = "".join([c for c in raw_id if c.isalnum() or c in ('-', '_')])
        
        main_img = finalize_filename(data.get("mainImage"), f"{safe_id}_main")
        gallery = [finalize_filename(p, f"{safe_id}_{i+1}") for i, p in enumerate(data.get("gallery", []))]

        product = {
            "id": raw_id,
            "name": data.get("name"),
            "category": data.get("category"),
            "fabric": data.get("fabric"),
            "color": data.get("color"),
            "price": data.get("price"),
            "discount_price": data.get("discount_price"),
            "desc": data.get("desc"),
            "stars": int(data.get("stars", 5)),
            "stock": data.get("stock"),
            "stock_count": int(data.get("stock_count", 0)),
            "visible": True,
            "image": main_img,
            "gallery": gallery,
            "timestamp": int(time.time())
        }

        # Save to DATA.json
        current_data = load_json(DATA_FILE, [])
        current_data = [p for p in current_data if p['id'] != raw_id]
        current_data.append(product)
        save_json(DATA_FILE, current_data)
        
        # Remove from UNFILLED.json if it exists there
        unfilled_data = load_json(UNFILLED_FILE, [])
        unfilled_data = [p for p in unfilled_data if p['id'] != raw_id]
        save_json(UNFILLED_FILE, unfilled_data)

        # Clear global draft
        save_json(DRAFT_FILE, {}) 
        
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

# --- DELETE ---
@app.route('/api/delete-product', methods=['POST'])
def delete_product():
    try:
        pid = request.json.get('id')
        main_data = load_json(DATA_FILE, [])
        trash_data = load_json(TRASH_FILE, [])
        unfilled_data = load_json(UNFILLED_FILE, [])
        
        # Check Main
        item = next((p for p in main_data if p['id'] == pid), None)
        source_list = main_data
        source_file = DATA_FILE
        
        # Check Unfilled if not in Main
        if not item:
            item = next((p for p in unfilled_data if p['id'] == pid), None)
            source_list = unfilled_data
            source_file = UNFILLED_FILE

        if item:
            if item.get('image'): item['image'] = move_to_trash(item['image'])
            item['gallery'] = [move_to_trash(g) for g in item.get('gallery', [])]
            trash_data.append(item)
            save_json(TRASH_FILE, trash_data)
            
            source_list = [p for p in source_list if p['id'] != pid]
            save_json(source_file, source_list)
            return jsonify({"status": "success"}), 200
        return jsonify({"status": "error", "message": "Not found"}), 404
    except: return jsonify({"status": "error"}), 500

@app.route('/api/restore-product', methods=['POST'])
def restore_product():
    try:
        pid = request.json.get('id')
        main_data = load_json(DATA_FILE, [])
        trash_data = load_json(TRASH_FILE, [])
        item = next((p for p in trash_data if p['id'] == pid), None)
        if item:
            if item.get('image'): item['image'] = move_from_trash(item['image'])
            item['gallery'] = [move_from_trash(g) for g in item.get('gallery', [])]
            main_data.append(item)
            save_json(DATA_FILE, main_data)
            trash_data = [p for p in trash_data if p['id'] != pid]
            save_json(TRASH_FILE, trash_data)
            return jsonify({"status": "success"}), 200
        return jsonify({"status": "error"}), 404
    except: return jsonify({"status": "error"}), 500

@app.route('/api/perm-delete', methods=['POST'])
def perm_delete():
    try:
        pid = request.json.get('id')
        trash_data = load_json(TRASH_FILE, [])
        item = next((p for p in trash_data if p['id'] == pid), None)
        if item:
            if item.get('image'):
                full_path = os.path.join(BASE_DIR, item['image'])
                if os.path.exists(full_path): os.remove(full_path)
            for img_path in item.get('gallery', []):
                full_path = os.path.join(BASE_DIR, img_path)
                if os.path.exists(full_path): os.remove(full_path)
            trash_data = [p for p in trash_data if p['id'] != pid]
            save_json(TRASH_FILE, trash_data)
            return jsonify({"status": "success"}), 200
        return jsonify({"status": "error"}), 404
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/clear-buffer', methods=['POST'])
def clear_buffer():
    try:
        for f in os.listdir(BUFFER_DIR):
            try: os.remove(os.path.join(BUFFER_DIR, f))
            except: pass
        return jsonify({"status": "success"}), 200
    except: return jsonify({"status": "error"}), 500

@app.route('/api/products', methods=['GET'])
def get_products(): 
    source = request.args.get('source', 'main')
    if source == 'trash': return jsonify(load_json(TRASH_FILE, [])), 200
    if source == 'unfilled': return jsonify(load_json(UNFILLED_FILE, [])), 200 # <--- NEW SOURCE
    return jsonify(load_json(DATA_FILE, [])), 200

@app.route('/api/get-next-id', methods=['GET'])
def get_next_id():
    # Check ALL files to avoid collision
    data = load_json(DATA_FILE, []) + load_json(TRASH_FILE, []) + load_json(UNFILLED_FILE, [])
    max_num = 100
    for item in data:
        match = re.search(r'\d+', str(item.get('id', '')))
        if match:
            num = int(match.group())
            if num > max_num: max_num = num
    return jsonify({"next_id": f"DS-{max_num + 1}"}), 200

def open_browser():
    time.sleep(2)
    webbrowser.open(f"http://localhost:{PORT}/admin.html")

if __name__ == '__main__':
    local_ip = get_local_ip()
    print(f"\n{'='*60}")
    print(f" DASHAMI SERVER v25.0 (UNFILLED / COMPLETE LATER)")
    print(f" [PC]    http://localhost:{PORT}/admin.html")
    print(f" [PHONE] http://{local_ip}:{PORT}/admin.html")
    print("Waiting for 10 secounds...")
    time.sleep(10)
    print(f"{'='*60}\n")
    threading.Thread(target=open_browser).start()
    app.run(host='0.0.0.0', port=PORT, debug=True)