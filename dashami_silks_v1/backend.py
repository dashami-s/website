import os
import sys
import subprocess
import json
import base64
import time
import shutil
import webbrowser
import threading
import re
from io import BytesIO

# --- 1. AUTO-INSTALLER ---
def install(package):
    print(f"[*] Installing missing library: {package}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

try:
    from flask import Flask, request, jsonify, make_response
    from flask_cors import CORS
    from PIL import Image, ImageOps
except ImportError:
    print("[-] Libraries missing. Installing Flask, CORS & Pillow...")
    try:
        install("flask")
        install("flask-cors")
        install("Pillow")
        print("[+] Installed! Restarting script...")
        os.execv(sys.executable, ['python'] + sys.argv)
    except Exception as e:
        print(f"[!] Critical Error: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

# --- 2. CONFIGURATION ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024 # 1GB Limit

# PATHS
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
BACKUP_FILE = os.path.join(BASE_DIR, 'data.json.bak')
IMAGE_DIR = os.path.join(BASE_DIR, 'images')

PORT = 8000
FIXED_SIZE = (1000, 1000)

if not os.path.exists(IMAGE_DIR): os.makedirs(IMAGE_DIR)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f: json.dump([], f)

# --- 3. IMAGE PROCESSING ---
def process_file(base64_string, file_type, custom_filename, rotation=0):
    try:
        if ',' in base64_string: base64_string = base64_string.split(',')[1]
        file_data = base64.b64decode(base64_string)
        
        if file_type == 'video':
            filename = f"{custom_filename}.mp4"
            path = os.path.join(IMAGE_DIR, filename)
            with open(path, 'wb') as f: f.write(file_data)
        else:
            filename = f"{custom_filename}.png"
            path = os.path.join(IMAGE_DIR, filename)
            
            img = Image.open(BytesIO(file_data))
            img = ImageOps.exif_transpose(img) # Auto-fix phone rotation
            if img.mode != 'RGBA': img = img.convert('RGBA')

            # Manual Rotation
            if rotation and rotation != 0:
                img = img.rotate(-int(rotation), expand=True)

            # Resize (Contain)
            img.thumbnail(FIXED_SIZE, Image.Resampling.LANCZOS)
            
            # White Background
            bg = Image.new('RGBA', FIXED_SIZE, (255, 255, 255, 255))
            offset = ((FIXED_SIZE[0] - img.width) // 2, (FIXED_SIZE[1] - img.height) // 2)
            bg.paste(img, offset, img if img.mode == 'RGBA' else None)
            bg.save(path, 'PNG')

        return f"images/{filename}"
    except Exception as e:
        print(f"[!] Error: {e}")
        return None

# --- 4. ROUTES ---
@app.route('/', methods=['GET'])
def health(): return jsonify({"status": "online"}), 200

@app.route('/api/get-next-id', methods=['GET'])
def get_next_id():
    try:
        if not os.path.exists(DATA_FILE): return jsonify({"next_id": "DS-101"}), 200
        with open(DATA_FILE, 'r') as f:
            content = f.read().strip()
            data = json.loads(content) if content else []
        
        max_num = 100
        for item in data:
            match = re.search(r'\d+', str(item.get('id', '')))
            if match:
                num = int(match.group())
                if num > max_num: max_num = num
        return jsonify({"next_id": f"DS-{max_num + 1}"}), 200
    except: return jsonify({"next_id": "DS-101"}), 200

@app.route('/api/add-product', methods=['POST', 'OPTIONS'])
def add_product():
    if request.method == 'OPTIONS':
        resp = make_response()
        resp.headers.add("Access-Control-Allow-Origin", "*")
        resp.headers.add("Access-Control-Allow-Headers", "*")
        resp.headers.add("Access-Control-Allow-Methods", "*")
        return resp

    try:
        data = request.json
        if not data: return jsonify({"status": "error", "message": "No Data"}), 400

        raw_id = data.get("id", "unknown")
        safe_id = "".join([c for c in raw_id if c.isalnum() or c in ('-', '_')])
        
        print(f"\n[*] Saving Product: {safe_id}")

        # 1. PROCESS MAIN IMAGE (Mandatory)
        main_img_data = data.get('mainImage')
        if not main_img_data:
            return jsonify({"status": "error", "message": "Main Image is missing"}), 400
        
        main_image_path = process_file(
            main_img_data['base64'], 
            'image', 
            f"{safe_id}_main", 
            main_img_data.get('rotation', 0)
        )

        # 2. PROCESS GALLERY (Optional)
        gallery_paths = []
        gallery_data = data.get('mediaGallery', [])
        
        for index, item in enumerate(gallery_data):
            seq_filename = f"{safe_id}_{index + 1}"
            path = process_file(item['base64'], item['type'], seq_filename, item.get('rotation', 0))
            if path: gallery_paths.append(path)

        # 3. BUILD OBJECT
        new_product = {
            "id": raw_id,
            "name": data.get("name").strip(),
            "category": data.get("category"),
            "fabric": data.get("fabric"),
            "color": data.get("color"),
            "price": data.get("price"),
            "discount_price": data.get("discount_price"),
            "desc": data.get("desc"),
            "stars": int(data.get("stars", 5)),
            "stock": data.get("stock", "in_stock"),
            "visible": True,
            "image": main_image_path,  # The ID_main.png
            "gallery": gallery_paths,  # The ID_1.png, ID_2.png (No duplicates)
            "timestamp": int(time.time())
        }

        # 4. SAVE
        current_data = []
        if os.path.exists(DATA_FILE):
            try:
                shutil.copyfile(DATA_FILE, BACKUP_FILE)
                with open(DATA_FILE, 'r') as f:
                    content = f.read().strip()
                    if content: current_data = json.loads(content)
            except: current_data = []

        current_data = [p for p in current_data if p['id'] != raw_id]
        current_data.append(new_product)

        with open(DATA_FILE, 'w') as f:
            json.dump(current_data, f, indent=4)
        
        return jsonify({"status": "success"}), 200

    except Exception as e:
        print(f"[!] Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

def open_browser():
    time.sleep(2)
    path = os.path.join(BASE_DIR, "admin.html")
    webbrowser.open(f"file:///{path}")

if __name__ == '__main__':
    print(f"\n{'='*50}")
    print(f" DASHAMI BACKEND v9.0")
    print(f" - Separate Main vs Gallery Processing")
    print(f"{'='*50}\n")
    threading.Thread(target=open_browser).start()
    app.run(host='0.0.0.0', port=PORT, debug=True)