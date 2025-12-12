const MY_NUMBER = "918904528959"; 
let allProducts = []; 
let currentFilteredProducts = []; 
let activeCategory = 'all'; 
let loadedCount = 0; 
let batchSize = 20; 
let isLoading = false;

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

// Initialize Main Page
async function init() {
    try {
        loadFooter();

        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        try { allProducts = await response.json(); } catch (e) { throw new Error("Invalid JSON format."); }
        
        updateBatchSize();
        window.addEventListener('resize', updateBatchSize);
        
        generateDynamicFilters(allProducts);
        setupDualSlider(allProducts);
        setupHeroSlider(allProducts);
        applyAllFilters(); 
        
        window.addEventListener('scroll', handleScroll);

    } catch (error) {
        console.error("Critical Error:", error);
    }
}

function updateBatchSize() {
    batchSize = window.innerWidth >= 768 ? 50 : 20;
}

function handleScroll() {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
        if (!isLoading && loadedCount < currentFilteredProducts.length) {
            renderNextBatch();
        }
    }
}

function renderNextBatch() {
    isLoading = true;
    const loader = document.getElementById('infinite-loader');
    if(loader) loader.classList.remove('d-none');

    setTimeout(() => {
        const grid = document.getElementById('product-grid');
        const start = loadedCount;
        const end = Math.min(start + batchSize, currentFilteredProducts.length);
        const batch = currentFilteredProducts.slice(start, end);

        batch.forEach(p => {
            const card = createProductCard(p);
            grid.appendChild(card);
        });

        loadedCount = end;
        isLoading = false;
        
        if(loader) loader.classList.add('d-none');
        
        const countLabel = document.getElementById('resultCount');
        if (countLabel) countLabel.textContent = `Showing ${loadedCount} of ${currentFilteredProducts.length} products`;
    }, 600);
}

function createProductCard(p) {
    const card = document.createElement('div');
    card.className = 'card h-100'; 
    card.onclick = () => window.open(`product.html?id=${p.id}`, '_blank');

    const safeName = p.name || "Unknown Product";
    const safeCat = p.category || "Saree";
    const safeFab = p.fabric || "Silk";
    const safeImg = p.image || p.image_hd || 'logo/logo.png';
    const safeStock = p.stock || "Ready to Ship";
    const safeColor = p.color || "Multi";
    
    let snippet = '"Absolutely stunning quality. The zari work is real gold."';
    if(p.reviews && p.reviews.length > 0) {
        snippet = `"${p.reviews[0]}"`;
    } else if(p.desc) {
        snippet = `"${p.desc.split('.')[0]}."`; 
    }

    let priceHtml = `<span class="badge bg-secondary">Ask Price</span>`;
    if (p.price) {
        if(p.discount_price) {
            priceHtml = `<span class="original-price">₹${p.price}</span> <span class="final-price">₹${p.discount_price}</span>`;
        } else {
            priceHtml = `<span class="final-price">₹${p.price}</span>`;
        }
    }
    
    const productUrl = `${window.location.origin}/product.html?id=${p.id}`;
    const msg = `Hello Dashami Silks, I am interested in:\n*${safeName}*\nID: ${p.id}\nLink: ${productUrl}`;
    const rawWaLink = `whatsapp://send?phone=${MY_NUMBER}&text=${encodeURIComponent(msg)}`;
    const link = `social_redirect.html?target=${encodeURIComponent(rawWaLink)}&platform=WhatsApp`;

    card.innerHTML = `
        <div class="img-box skeleton">
            <div class="card-overlay"><span class="view-btn">View Details</span></div>
            <img class="product-img" 
                 onload="this.parentElement.classList.remove('skeleton')" 
                 src="${safeImg}" 
                 alt="${safeName}">
        </div>
        <div class="info">
            <div class="cat-fabric">${safeCat} | ${safeFab}</div>
            <h3 class="title">${safeName}</h3>
            <div class="meta-line">Color: ${safeColor} | <span style="color:#2E7D32;">${safeStock}</span></div>
            <div class="price-area">${priceHtml}</div>
            <div class="stars">${"★".repeat(p.stars || 5)}</div>
            <div class="review-snippet">${snippet}</div>
            <a href="${link}" target="_blank" class="btn-card-action" onclick="event.stopPropagation()">
                Buy on WhatsApp
            </a>
        </div>
    `;
    return card;
}

function applyAllFilters() {
    const searchInput = document.getElementById('searchBar');
    const minPriceInput = document.getElementById('priceRangeMin');
    const maxPriceInput = document.getElementById('priceRangeMax');
    if(!searchInput) return;

    const query = searchInput.value.toLowerCase();
    const minPrice = parseInt(minPriceInput.value);
    const maxPrice = parseInt(maxPriceInput.value);
    const ratingEl = document.querySelector('input[name="ratingBtn"]:checked');
    const minRating = ratingEl ? parseInt(ratingEl.value) : 0;

    currentFilteredProducts = allProducts.filter(p => {
        if (!p.visible || p.deleted) return false;
        const matchesCategory = (activeCategory === 'all') || (p.category === activeCategory) || (p.fabric && p.fabric.includes(activeCategory));
        const searchStr = ((p.name||'') + (p.category||'') + (p.fabric||'') + (p.color||'')).toLowerCase();
        const price = parseInt(p.discount_price || p.price || 0);
        
        return matchesCategory && 
               searchStr.includes(query) && 
               (price >= minPrice && price <= maxPrice) && 
               ((p.stars || 0) >= minRating);
    });

    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    loadedCount = 0;

    if (currentFilteredProducts.length === 0) {
        grid.innerHTML = '<div class="text-center w-100 py-5 text-muted"><h4>No sarees match your filters</h4></div>';
        document.getElementById('resultCount').textContent = "0 products found";
    } else {
        renderNextBatch();
    }

    checkFilterAvailability(query, minPrice, maxPrice, activeCategory, minRating);
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

function selectCategory(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = cat;
    applyAllFilters();
}

function generateDynamicFilters(products) {
    const container = document.getElementById('dynamic-category-filters');
    if(!container) return;
    const categories = new Set();
    products.forEach(p => { if(p.visible && !p.deleted && p.category) categories.add(p.category); });
    let html = `<button class="btn btn-sm btn-outline-danger rounded-pill active filter-btn px-3" data-cat="all" onclick="selectCategory('all', this)">All</button>`;
    categories.forEach(cat => { html += `<button class="btn btn-sm btn-outline-danger rounded-pill filter-btn px-3" data-cat="${cat}" onclick="selectCategory('${cat}', this)">${cat}</button>`; });
    container.innerHTML = html;
}

function setupHeroSlider(products) {
    const container = document.getElementById('hero-slides-container');
    if(!container) return;
    const featured = products.filter(p => p.visible && !p.deleted).slice(0, 5);
    let html = '';
    featured.forEach((p, index) => {
        const activeClass = index === 0 ? 'active' : '';
        const mainImg = p.image || p.image_hd || 'logo/logo.png';
        html += `
            <div class="carousel-item ${activeClass} h-100" onclick="window.open('product.html?id=${p.id}', '_blank')">
                <img src="${mainImg}" class="d-block w-100 hero-img" alt="${p.name}">
                <div class="carousel-caption d-none d-md-block">
                    <h5 class="hero-title">${p.name}</h5>
                    <p class="hero-price">₹${p.discount_price || p.price}</p>
                    <button class="btn btn-sm btn-outline-light mt-2 rounded-pill px-4">View Details</button>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

function setupDualSlider(products) {
    let maxPrice = 0;
    products.forEach(p => { let price = parseInt(p.discount_price || p.price || 0); if(price > maxPrice) maxPrice = price; });
    if(maxPrice === 0) maxPrice = 10000;
    const rangeMin = document.getElementById('priceRangeMin');
    const rangeMax = document.getElementById('priceRangeMax');
    rangeMin.max = maxPrice + 500; rangeMax.max = maxPrice + 500;
    rangeMax.value = maxPrice + 500;
    updateDualSlider();
}

function updateDualSlider() {
    const rangeMin = document.getElementById('priceRangeMin');
    const rangeMax = document.getElementById('priceRangeMax');
    const displayMin = document.getElementById('priceMinDisplay');
    const displayMax = document.getElementById('priceMaxDisplay');
    const track = document.querySelector('.slider-track');
    let minVal = parseInt(rangeMin.value);
    let maxVal = parseInt(rangeMax.value);
    if (minVal > maxVal - 500) { rangeMin.value = maxVal - 500; minVal = maxVal - 500; }
    displayMin.textContent = minVal; displayMax.textContent = maxVal;
    const percentMin = (minVal / rangeMin.max) * 100;
    const percentMax = (maxVal / rangeMax.max) * 100;
    track.style.background = `linear-gradient(to right, #ddd ${percentMin}%, var(--primary) ${percentMin}%, var(--primary) ${percentMax}%, #ddd ${percentMax}%)`;
    applyAllFilters();
}

function checkFilterAvailability(currentQuery, minP, maxP, currentCat, currentRating) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const cat = btn.getAttribute('data-cat');
        const count = allProducts.filter(p => {
            if(!p.visible || p.deleted) return false;
            const searchStr = ((p.name||'') + (p.category||'') + (p.fabric||'') + (p.color||'')).toLowerCase();
            const price = parseInt(p.discount_price || p.price || 0);
            const matchS = searchStr.includes(currentQuery);
            const matchP = price >= minP && price <= maxP;
            const matchR = (p.stars || 0) >= currentRating;
            const matchC = (cat === 'all') || (p.category === cat) || (p.fabric && p.fabric.includes(cat));
            return matchS && matchP && matchR && matchC;
        }).length;
        if (count === 0) btn.classList.add('disabled'); else btn.classList.remove('disabled');
    });
}

document.addEventListener('click', function(event) {
    const filterPanel = document.getElementById('filterPanel');
    const filterBtn = document.getElementById('filterToggleBtn');
    if (filterPanel && filterPanel.classList.contains('show') && !filterPanel.contains(event.target) && !filterBtn.contains(event.target)) {
        new bootstrap.Collapse(filterPanel).hide();
    }
});

init();