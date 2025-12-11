import os
import json
import shutil
import random
from flask import Flask, request, redirect, url_for
from PIL import Image

app = Flask(__name__)

# --- CONFIGURATION ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FOLDER = os.path.join(CURRENT_DIR, 'raw_images')
PROCESSED_FOLDER = os.path.join(CURRENT_DIR, 'product_images')
TRASH_FOLDER = os.path.join(CURRENT_DIR, 'trash_bin')
DATA_FILE = os.path.join(CURRENT_DIR, 'data.json')
REVIEWS_POOL = os.path.join(CURRENT_DIR, 'reviews_pool.json')

# Create Folders
for f in [RAW_FOLDER, PROCESSED_FOLDER, TRASH_FOLDER]:
    os.makedirs(f, exist_ok=True)

# --- HELPER FUNCTIONS ---
def load_json(path):
    if not os.path.exists(path): return []
    with open(path, 'r') as f: return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f: json.dump(data, f, indent=4)

def generate_adaptive_images(filename):
    """Generates a 1200px HD version and a 400px Thumbnail"""
    try:
        img_path = os.path.join(RAW_FOLDER, filename)
        img = Image.open(img_path).convert('RGB')
        
        # 1. SQUARE CROP
        width, height = img.size
        new_size = min(width, height)
        left = (width - new_size)/2
        top = (height - new_size)/2
        right = (width + new_size)/2
        bottom = (height + new_size)/2
        img = img.crop((left, top, right, bottom))
        
        # 2. SAVE HD (1200x1200)
        hd_name = f"{os.path.splitext(filename)[0]}_hd.jpg"
        img_hd = img.resize((1200, 1200), Image.LANCZOS)
        img_hd.save(os.path.join(PROCESSED_FOLDER, hd_name), quality=85)

        # 3. SAVE THUMBNAIL (400x400) - For slow connections
        thumb_name = f"{os.path.splitext(filename)[0]}_thumb.jpg"
        img_thumb = img.resize((400, 400), Image.LANCZOS)
        img_thumb.save(os.path.join(PROCESSED_FOLDER, thumb_name), quality=80)
        
        return hd_name, thumb_name
    except Exception as e:
        print(f"Error processing image: {e}")
        return None, None

# --- ROUTES ---

@app.route('/')
def home():
    return f"""
    <div style="font-family:sans-serif; text-align:center; padding:50px; background:#FFF0E6; color:#800000;">
        <h1>Dashami Silks Admin Panel</h1> <a href='/add' style="background:#800000; color:white; padding:15px; text-decoration:none; margin:10px; display:inline-block;">1. Scan & Add New Products</a>
        <a href='/manage' style="background:#800000; color:white; padding:15px; text-decoration:none; margin:10px; display:inline-block;">2. Manage Inventory</a>
        <a href='/trash' style="background:#555; color:white; padding:15px; text-decoration:none; margin:10px; display:inline-block;">3. Recycle Bin</a>
    </div>
    """

@app.route('/add', methods=['GET', 'POST'])
def add_new():
    raw_files = [f for f in os.listdir(RAW_FOLDER) if f.lower().endswith(('jpg','jpeg','png'))]
    data = load_json(DATA_FILE)
    
    # Filter out images already processed (by checking if HD version exists in DB)
    existing_bases = [p['image_hd'].replace('_hd.jpg', '') for p in data if 'image_hd' in p]
    new_img = next((f for f in raw_files if os.path.splitext(f)[0] not in existing_bases), None)
    
    if not new_img:
        return "<h3>No new images in raw_images folder.</h3><a href='/'>Home</a>"

    if request.method == 'POST':
        # 1. Process Images
        hd_name, thumb_name = generate_adaptive_images(new_img)
        
        # 2. Get Random Reviews
        pool = load_json(REVIEWS_POOL)
        selected_reviews = random.sample(pool, 2) if len(pool) >= 2 else pool

        new_product = {
            "id": request.form['id'],
            "name": request.form['name'],
            "category": request.form['category'],
            "fabric": request.form['fabric'],
            "color": request.form['color'],
            "price": request.form['price'],
            "discount_price": request.form.get('discount_price', ''),
            "stars": int(request.form['stars']),
            "stock": request.form['stock'],
            "desc": request.form['desc'],
            "image_hd": hd_name,
            "image_thumb": thumb_name,
            "reviews": selected_reviews,
            "visible": True,
            "deleted": False
        }
        data.append(new_product)
        save_json(DATA_FILE, data)
        return redirect('/add')

    # THE FORM
    return f"""
    <div style="background:#FFF0E6; padding:20px; font-family:sans-serif;">
        <h2 style="color:#800000">Adding: {new_img}</h2>
        <form method="POST">
            <b>Product ID:</b> <input name="id" required placeholder="e.g. SILK01"><br><br>
            <b>Name:</b> <input name="name" required style="width:300px"><br><br>
            
            <b>Category:</b> 
            <select name="category">
                <option value="Silk">Silk</option>
                <option value="Cotton">Cotton</option>
                <option value="Georgette">Georgette</option>
                <option value="Banarasi">Banarasi</option>
                <option value="Designer">Designer</option>
            </select><br><br>

            <b>Fabric:</b> <input name="fabric" placeholder="e.g. Pure Silk"><br><br>
            <b>Color:</b> <input name="color" placeholder="e.g. Maroon & Gold"><br><br>
            
            <b>Price (₹):</b> <input name="price" type="number" required> 
            <b>Discount Price (₹):</b> <input name="discount_price" type="number" placeholder="Optional"><br><br>
            
            <b>Stars:</b> 
            <select name="stars">
                <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                <option value="4">⭐⭐⭐⭐ (4)</option>
                <option value="3">⭐⭐⭐ (3)</option>
            </select><br><br>

            <b>Stock Status:</b>
            <select name="stock">
                <option value="Ready to Ship">Ready to Ship</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Sold Out">Sold Out</option>
            </select><br><br>

            <b>Description:</b><br>
            <textarea name="desc" rows="4" cols="50" required></textarea><br><br>
            
            <button type="submit" style="background:#800000; color:white; padding:10px 20px; border:none; cursor:pointer;">SAVE PRODUCT</button>
        </form>
    </div>
    """

# (Manage and Trash routes logic remains similar but updated for new fields - abridged for length)
@app.route('/manage', methods=['GET', 'POST'])
def manage():
    data = load_json(DATA_FILE)
    if request.method == 'POST':
        # Simple toggle visibility logic
        pid = request.form.get('pid')
        for p in data:
            if p['id'] == pid:
                if 'delete' in request.form:
                    p['deleted'] = True
                    p['visible'] = False
                    # Move files
                    if os.path.exists(os.path.join(PROCESSED_FOLDER, p['image_hd'])):
                        shutil.move(os.path.join(PROCESSED_FOLDER, p['image_hd']), os.path.join(TRASH_FOLDER, p['image_hd']))
                    if os.path.exists(os.path.join(PROCESSED_FOLDER, p['image_thumb'])):
                         shutil.move(os.path.join(PROCESSED_FOLDER, p['image_thumb']), os.path.join(TRASH_FOLDER, p['image_thumb']))
                else:
                    p['visible'] = not p['visible']
                break
        save_json(DATA_FILE, data)
        return redirect('/manage')

    html = "<body style='background:#FFF0E6; font-family:sans-serif'><h1>Inventory</h1>"
    for p in data:
        if p.get('deleted'): continue
        html += f"<div style='background:white; margin:10px; padding:10px; border:1px solid #800000'>"
        html += f"<b>{p['name']}</b> ({p['id']}) - {'VISIBLE' if p['visible'] else 'HIDDEN'}<br>"
        html += f"<form method='POST'><input type='hidden' name='pid' value='{p['id']}'>"
        html += f"<button type='submit'>Toggle Visible</button> <button type='submit' name='delete' style='background:red; color:white'>Delete</button></form></div>"
    return html

@app.route('/trash')
def trash(): return "<h1>Trash Bin Logic (Files are in trash_bin folder)</h1><a href='/'>Back</a>"

if __name__ == '__main__':
    app.run(debug=True, port=5000)