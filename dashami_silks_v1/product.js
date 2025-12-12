const MY_NUMBER = "918904528959"; 
let allProducts = []; 
let currentGallery = [];
let currentIndex = 0;

// ZOOM VARIABLES
let zoomLevel = 1;
let isDragging = false;
let startX = 0, startY = 0;
let currentTranslateX = 0, currentTranslateY = 0;

// Global Error Handler
window.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG') {
        const src = e.target.src;
        // If image fails, switch to logo
        if(!src.includes('logo/logo.png') && !src.includes('logo/logo.png')) {
             e.target.src = 'logo/logo.png';
             
             // ADDED BACK: Make the fallback logo dull (50% opacity) and padded
             e.target.classList.add('opacity-50', 'p-4');
             
             if(e.target.parentElement.classList.contains('skeleton')) {
                e.target.parentElement.classList.remove('skeleton');
            }
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
        setupZoomHandlers(); 
        setupMainGallerySwipe(); 

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
    document.title = `${product.name} | Dashami Silk`;
    
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
    const msg = `Hello Dashami Silk, I want to buy:\n*${product.name}*\nID: ${product.id}\nLink: ${pageUrl}`;
    const rawLink = `whatsapp://send?phone=${MY_NUMBER}&text=${encodeURIComponent(msg)}`;
    document.getElementById('pd-whatsapp-btn').href = `social_redirect.html?target=${encodeURIComponent(rawLink)}&platform=WhatsApp`;
    
    // Gallery
    const mainImg = (product.image_hd && product.image_hd.trim()) ? product.image_hd : 
                    (product.image && product.image.trim()) ? product.image : 'logo/logo.png';
                    
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
    
    // CLEANUP: Remove error classes (dullness) before showing new image
    img.classList.remove('opacity-50', 'p-4');
    
    img.style.opacity = 0.5; // Fade out slightly for transition
    setTimeout(() => { 
        img.src = currentGallery[currentIndex]; 
        img.style.opacity = 1; // Fade in bright
    }, 150);
    
    if(fullImg) {
        fullImg.src = currentGallery[currentIndex];
        resetZoom(); 
    }
}

function setupMainGallerySwipe() {
    const stage = document.querySelector('.pd-main-stage');
    if(!stage) return;

    let touchStartX = 0;
    let touchEndX = 0;

    stage.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, {passive: true});

    stage.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleGesture();
    }, {passive: true});

    function handleGesture() {
        if (touchStartX - touchEndX > 50) changeSlide(1); 
        if (touchEndX - touchStartX > 50) changeSlide(-1);
    }
}

// === ZOOM, PAN & FULLSCREEN SWIPE ===

function setupZoomHandlers() {
    const img = document.getElementById('fullscreen-img');
    const viewer = document.getElementById('full-image-viewer');
    if (!img || !viewer) return;

    viewer.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -0.2;
        let newZoom = zoomLevel + delta;
        if (newZoom < 1) newZoom = 1;
        if (newZoom > 5) newZoom = 5;
        zoomLevel = newZoom;
        applyTransform();
    });

    img.addEventListener('mousedown', function(e) {
        if (zoomLevel > 1) {
            isDragging = true;
            startX = e.clientX - currentTranslateX;
            startY = e.clientY - currentTranslateY;
            img.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', function(e) {
        if (isDragging && zoomLevel > 1) {
            e.preventDefault();
            currentTranslateX = e.clientX - startX;
            currentTranslateY = e.clientY - startY;
            applyTransform();
        }
    });

    window.addEventListener('mouseup', function() {
        isDragging = false;
        img.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
    });

    img.addEventListener('dblclick', function(e) {
        if (zoomLevel === 1) {
            zoomLevel = 2.5;
            img.style.cursor = 'grab';
        } else {
            resetZoom();
        }
        applyTransform();
    });

    let initialPinchDist = 0;
    let initialZoom = 1;
    let lastTap = 0;
    let swipeStartX = null;

    img.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                if (zoomLevel === 1) {
                    zoomLevel = 2.5;
                } else {
                    resetZoom();
                }
                applyTransform();
            } else {
                if (zoomLevel > 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX - currentTranslateX;
                    startY = e.touches[0].clientY - currentTranslateY;
                } else {
                    swipeStartX = e.touches[0].clientX;
                }
            }
            lastTap = currentTime;
        } 
        else if (e.touches.length === 2) {
            isDragging = false;
            initialPinchDist = getPinchDistance(e);
            initialZoom = zoomLevel;
        }
    }, { passive: false });

    img.addEventListener('touchmove', function(e) {
        if (e.touches.length === 1) {
            if (zoomLevel > 1 && isDragging) {
                e.preventDefault(); 
                currentTranslateX = e.touches[0].clientX - startX;
                currentTranslateY = e.touches[0].clientY - startY;
                applyTransform();
            }
        }
        else if (e.touches.length === 2) {
            e.preventDefault(); 
            const currentDist = getPinchDistance(e);
            if (initialPinchDist > 0) {
                const scale = currentDist / initialPinchDist;
                let newZoom = initialZoom * scale;
                if (newZoom < 1) newZoom = 1;
                if (newZoom > 5) newZoom = 5;
                zoomLevel = newZoom;
                applyTransform();
            }
        }
    }, { passive: false });

    img.addEventListener('touchend', function(e) {
        isDragging = false;
        if (zoomLevel === 1 && swipeStartX !== null && e.changedTouches.length > 0) {
            let swipeEndX = e.changedTouches[0].clientX;
            let diff = swipeStartX - swipeEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) changeSlide(1); 
                else changeSlide(-1); 
            }
            swipeStartX = null;
        }
        if (e.touches.length < 2) {
            initialPinchDist = 0;
        }
    });
}

function getPinchDistance(e) {
    return Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
    );
}

function resetZoom() {
    zoomLevel = 1;
    currentTranslateX = 0;
    currentTranslateY = 0;
    isDragging = false;
    applyTransform();
    const img = document.getElementById('fullscreen-img');
    if(img) img.style.cursor = 'default';
}

function applyTransform() {
    const img = document.getElementById('fullscreen-img');
    if (img) {
        if (zoomLevel === 1) {
            currentTranslateX = 0;
            currentTranslateY = 0;
        }
        img.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${zoomLevel})`;
    }
}

function openFullscreen() {
    const viewer = document.getElementById('full-image-viewer');
    const fullImg = document.getElementById('fullscreen-img');
    fullImg.src = currentGallery[currentIndex];
    resetZoom(); 
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

function closeFullscreen() {
    document.getElementById('full-image-viewer').style.display = 'none';
    document.body.style.overflow = 'auto'; 
    resetZoom();
}

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") closeFullscreen();
    if (event.key === "ArrowLeft") changeSlide(-1);
    if (event.key === "ArrowRight") changeSlide(1);
});

init();