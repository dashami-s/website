const MY_NUMBER = "918904528959"; 
let allProducts = []; 
document.getElementById('year').textContent = new Date().getFullYear();

// --- MAIN LOADER ---
async function loadShop() {
    try {
        const response = await fetch('data.json');
        allProducts = await response.json();
        renderProducts(allProducts);
    } catch (error) {
        console.error("Could not load products:", error);
        document.getElementById('product-grid').innerHTML = "<p>Loading failed.</p>";
    }
}

// --- RENDER FUNCTION ---
function renderProducts(products) {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = ''; 

    if(products.length === 0) {
        grid.innerHTML = '<p class="text-center w-100">No products found matching your search.</p>';
        return;
    }

    products.forEach(p => {
        if (!p.visible || p.deleted) return;

        const card = document.createElement('div');
        card.className = 'card';

        let priceHtml = `<span class="final-price">₹${p.price}</span>`;
        if(p.discount_price) {
            priceHtml = `<span class="original-price">₹${p.price}</span> <span class="final-price">₹${p.discount_price}</span>`;
        }

        const stockClass = p.stock === 'Sold Out' ? 'stock-out' : 'stock-badge';
        const reviewHtml = p.reviews && p.reviews.length > 0 ? `<div class="reviews">"${p.reviews[0]}"</div>` : '';

        const msg = `Hello Dashami Silks, I am interested in:\n*${p.name}*\nID: ${p.id}\nPrice: ₹${p.discount_price || p.price}`;
        const link = `https://wa.me/${MY_NUMBER}?text=${encodeURIComponent(msg)}`;

        card.innerHTML = `
            <div class="img-box skeleton" onclick="openLightbox('product_images/${p.image_hd}')">
                <img class="product-img" 
                     onload="this.classList.add('loaded'); this.parentElement.classList.remove('skeleton')"
                     src="product_images/${p.image_hd}" 
                     srcset="product_images/${p.image_thumb} 400w, product_images/${p.image_hd} 1200w"
                     sizes="(max-width: 600px) 400px, 1200px"
                     alt="${p.name}">
            </div>
            <div class="info">
                <span class="cat">${p.category} | ${p.fabric}</span>
                <h3 class="title">${p.name}</h3>
                <div class="meta">Color: ${p.color} | <span class="${stockClass}">${p.stock}</span></div>
                <div class="price-area">${priceHtml}</div>
                <div style="color:gold; margin-bottom:8px;">${"★".repeat(p.stars)}</div>
                ${reviewHtml}
                <a href="${link}" class="btn-wa">Buy on WhatsApp</a>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- FILTER & SEARCH ---
function filterProducts() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const filtered = allProducts.filter(p => {
        if (!p.visible || p.deleted) return false;
        return (p.name.toLowerCase().includes(query) || 
                p.category.toLowerCase().includes(query) ||
                p.fabric.toLowerCase().includes(query) ||
                p.color.toLowerCase().includes(query));
    });
    renderProducts(filtered);
}

function filterCategory(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    if(cat === 'all') {
        renderProducts(allProducts);
    } else {
        const filtered = allProducts.filter(p => p.category === cat || p.fabric.includes(cat));
        renderProducts(filtered);
    }
}

// --- LIGHTBOX ---
function openLightbox(imgSrc) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = imgSrc;
    lb.style.display = 'flex';
}
function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
}

loadShop();