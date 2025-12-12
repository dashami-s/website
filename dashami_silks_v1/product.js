const MY_NUMBER = "918904528959"; 
let allProducts = []; 
let currentGallery = [];
let currentIndex = 0;

// Global Error Handler
window.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG') {
        const src = e.target.src;
        if(!src.includes('logo/logo.png') && !src.includes('product_images/logo_circle.png')) {
             e.target.src = 'logo/logo.png';
             e.target.classList.add('opacity-50', 'p-4');
             if(e.target.parentElement.classList.contains('skeleton')) {
                e.target.parentElement.classList.remove('skeleton');
            }
        } else if (src.includes('logo/logo.png')) {
            e.target.src = 'product_images/logo_circle.png';
        }
    }
}, true);

const yearSpan = document.getElementById('year');
if(yearSpan) yearSpan.textContent = new Date().getFullYear();

// Initialize Product Page
async function init() {
    try {
        loadFooter();

        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        try { allProducts = await response.json(); } catch (e) { throw new Error("Invalid JSON format."); }
        
        loadProductDetails();

    } catch (error) {
        console.error("Critical Error:", error);
    }
}

async function loadFooter() {
    const container = document.getElementById('footer-socials');
    if(!container) return;
    try {
        const response = await fetch('footer.json');
        const links = await response.json();
        let html = '';
        links.forEach(link => {
            const finalLink = `social_redirect.html?target=${encodeURIComponent(link.url)}&platform=${encodeURIComponent(link.platform)}`;
            html += `<a href="${finalLink}" target="_blank" title="${link.platform}"><i class="${link.icon}"></i></a>`;
        });
        container.innerHTML = html;
    } catch (error) { console.error("Footer Error:", error); }
}

function loadProductDetails() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const product = allProducts.find(p => p.id === productId);
    if (!product) { document.getElementById('pd-title').innerText = "Product Not Found"; return; }
    document.getElementById('pd-title').innerText = product.name;
    document.getElementById('pd-cat').innerText = product.category || 'Saree';
    document.getElementById('pd-desc').innerText = product.desc || 'No description available.';
    document.getElementById('pd-fabric').innerText = product.fabric || 'Silk';
    document.getElementById('pd-color').innerText = product.color || 'Multi';
    document.getElementById('pd-rating').innerText = "★".repeat(product.stars || 4);
    document.title = `${product.name} | Dashami Silks`;
    
    // Stock & Price Logic
    const stockEl = document.getElementById('pd-stock');
    stockEl.innerText = product.stock || 'In Stock';
    stockEl.className = product.stock === 'Sold Out' ? 'text-danger fw-bold' : 'text-success fw-bold';
    
    if(product.discount_price) {
        document.getElementById('pd-price').innerText = `₹${product.discount_price}`;
        document.getElementById('pd-old-price').innerText = `₹${product.price}`;
    } else {
        document.getElementById('pd-price').innerText = `₹${product.price}`;
        document.getElementById('pd-old-price').innerText = "";
    }
    
    // WhatsApp
    const pageUrl = window.location.href; 
    const msg = `Hello Dashami Silks, I want to buy:\n*${product.name}*\nID: ${product.id}\nLink: ${pageUrl}`;
    const rawLink = `whatsapp://send?phone=${MY_NUMBER}&text=${encodeURIComponent(msg)}`;
    document.getElementById('pd-whatsapp-btn').href = `social_redirect.html?target=${encodeURIComponent(rawLink)}&platform=WhatsApp`;
    
    // Gallery
    const mainImg = product.image || product.image_hd || 'logo/logo.png';
    const gallery = product.gallery || [];
    currentGallery = [mainImg, ...gallery];
    currentIndex = 0;
    const thumbContainer = document.getElementById('pd-thumbnails');
    let thumbHTML = '';
    currentGallery.forEach((img, idx) => { thumbHTML += `<img src="${img}" class="thumb-img" onclick="jumpToSlide(${idx})">`; });
    thumbContainer.innerHTML = thumbHTML;
    updateMainStage();
}

function changeSlide(direction) {
    if(currentGallery.length <= 1) return;
    currentIndex += direction;
    if (currentIndex >= currentGallery.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = currentGallery.length - 1;
    updateMainStage();
}

function jumpToSlide(index) { currentIndex = index; updateMainStage(); }

function updateMainStage() {
    const img = document.getElementById('pd-main-img');
    const fullImg = document.getElementById('fullscreen-img'); 
    const thumbs = document.querySelectorAll('.thumb-img');
    const counter = document.getElementById('image-counter');
    thumbs.forEach((t, i) => {
        if(i === currentIndex) { t.classList.add('active'); t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } 
        else t.classList.remove('active');
    });
    if (counter) counter.textContent = `${currentIndex + 1} / ${currentGallery.length}`;
    img.style.opacity = 0.5;
    setTimeout(() => { img.src = currentGallery[currentIndex]; img.style.opacity = 1; }, 150);
    
    // Sync zoom view
    if(fullImg) fullImg.src = currentGallery[currentIndex];
}

// Zoom Logic
function openFullscreen() {
    const viewer = document.getElementById('full-image-viewer');
    const fullImg = document.getElementById('fullscreen-img');
    fullImg.src = currentGallery[currentIndex];
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeFullscreen() {
    document.getElementById('full-image-viewer').style.display = 'none';
    document.body.style.overflow = 'auto';
}
document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") closeFullscreen();
});

init();