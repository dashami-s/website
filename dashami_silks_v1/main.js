const MY_NUMBER = "918904528959"; 
let allProducts = []; 
let currentFilteredProducts = []; 
let activeCategory = 'all'; 
let loadedCount = 0; 

// CONFIGURATION & MOBILE OPTIMIZATION
const isMobile = window.innerWidth < 768;
const BATCH_SIZE = isMobile ? 20 : 50; 
const BUTTON_CLICK_LIMIT = 2; 

console.log(`Mobile Mode: ${isMobile}. Batch Size set to: ${BATCH_SIZE}`);

// State Variables
let loadMoreClicks = 0; 
let isInfiniteScrollEnabled = false;
let isLoading = false;
let renderTimeout = null; 

// Global Error Handler
window.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG') {
        const src = e.target.src;
        if(!src.includes('logo/logo.png')) {
             e.target.src = 'logo/logo.png';
             e.target.classList.add('opacity-50', 'p-4');
             if(e.target.parentElement.classList.contains('skeleton')) {
                e.target.parentElement.classList.remove('skeleton');
            }
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
        
        generateDynamicFilters(allProducts);
        
        setupHeroSlider(allProducts);
        setupLoadMoreButton(); 
        
        // This triggers the initial load automatically
        setupDualSlider(allProducts);

    } catch (error) {
        console.error("Critical Error:", error);
    }
}

// === HERO SLIDER ===
function setupHeroSlider(products) {
    const container = document.getElementById('hero-slides-container');
    const carouselEl = document.getElementById('heroCarousel');
    if(!container || !carouselEl) return;

    // 1. STRICT & SAFE FILTER
    const validProducts = products.filter(p => 
        p.visible && 
        !p.deleted && 
        ( (p.image && p.image.trim().length > 0) || (p.image_hd && p.image_hd.trim().length > 0) )
    );

    if (validProducts.length === 0) {
        container.innerHTML = '<div class="carousel-item active"><div class="d-flex align-items-center justify-content-center h-100 bg-dark text-white">No Featured Products</div></div>';
        return;
    }

    const shuffled = [...validProducts].sort(() => 0.5 - Math.random());
    const featured = shuffled.slice(0, 5);

    // Inject Animation CSS if not present
    if (!document.getElementById('hero-anim-styles')) {
        const style = document.createElement('style');
        style.id = 'hero-anim-styles';
        style.innerHTML = `
            @keyframes kbZoomIn { from { transform: scale(1); } to { transform: scale(1.15); } }
            @keyframes kbZoomOut { from { transform: scale(1.15); } to { transform: scale(1); } }
            @keyframes kbPanRight { from { transform: scale(1.15) translateX(-15px); } to { transform: scale(1.15) translateX(0); } }
            @keyframes kbPanLeft { from { transform: scale(1.15) translateX(0); } to { transform: scale(1.15) translateX(-15px); } }
            
            .hero-anim-img {
                width: 100%; height: 100%; object-fit: cover;
                transform-origin: center center;
            }
            .carousel-item.active .hero-anim-img {
                animation-duration: 6s;
                animation-timing-function: ease-in-out;
                animation-fill-mode: forwards;
            }
            .fx-zoom-in { animation-name: kbZoomIn; }
            .fx-zoom-out { animation-name: kbZoomOut; }
            .fx-pan-right { animation-name: kbPanRight; }
            .fx-pan-left { animation-name: kbPanLeft; }
            
            .carousel-indicators [data-bs-target] {
                width: 10px; height: 10px; border-radius: 50%;
                background-color: #fff; opacity: 0.7; margin: 0 5px; border: none;
                transition: all 0.3s;
            }
            .carousel-indicators .active { opacity: 1; background-color: var(--primary, #800000); transform: scale(1.2); }
        `;
        document.head.appendChild(style);
    }

    const effects = ['fx-zoom-in', 'fx-zoom-out', 'fx-pan-right', 'fx-pan-left'];

    let slidesHtml = '';
    featured.forEach((p, index) => {
        const activeClass = index === 0 ? 'active' : '';
        // Prioritize HD image
        const mainImg = (p.image_hd && p.image_hd.trim()) ? p.image_hd : p.image;
        const randomEffect = effects[Math.floor(Math.random() * effects.length)];

        slidesHtml += `
            <div class="carousel-item ${activeClass} h-100" onclick="window.open('product.html?id=${p.id}', '_blank')">
                <div style="overflow:hidden; width:100%; height:100%;">
                    <img src="${mainImg}" class="d-block w-100 hero-anim-img ${randomEffect}" alt="${p.name}">
                </div>
                <div class="carousel-caption d-none d-md-block">
                    <h5 class="hero-title">${p.name}</h5>
                    <p class="hero-price">₹${p.discount_price || p.price}</p>
                    <button class="btn btn-sm btn-outline-light mt-2 rounded-pill px-4">View Details</button>
                </div>
            </div>`;
    });
    container.innerHTML = slidesHtml;

    // Dots Generation
    const existingIndicators = carouselEl.querySelector('.carousel-indicators');
    if(existingIndicators) existingIndicators.remove();

    const indicatorsDiv = document.createElement('div');
    indicatorsDiv.className = 'carousel-indicators';
    
    let dotsHtml = '';
    featured.forEach((_, index) => {
        const activeState = index === 0 ? 'class="active" aria-current="true"' : '';
        dotsHtml += `<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="${index}" ${activeState} aria-label="Slide ${index + 1}"></button>`;
    });
    indicatorsDiv.innerHTML = dotsHtml;
    carouselEl.appendChild(indicatorsDiv);

    // === CRITICAL FIX: RE-INITIALIZE & SYNC DOTS ===
    try {
        if (window.bootstrap) {
            const carouselInstance = bootstrap.Carousel.getOrCreateInstance(carouselEl);
            carouselInstance.dispose(); 
            const myCarousel = new bootstrap.Carousel(carouselEl, {
                interval: 4000,
                ride: 'carousel',
                pause: 'hover'
            });

            // MANUALLY SYNC DOTS ON SLIDE CHANGE
            carouselEl.addEventListener('slide.bs.carousel', function (event) {
                const activeIndex = event.to;
                const dots = indicatorsDiv.querySelectorAll('button');
                dots.forEach((dot, index) => {
                    if (index === activeIndex) {
                        dot.classList.add('active');
                        dot.setAttribute('aria-current', 'true');
                    } else {
                        dot.classList.remove('active');
                        dot.removeAttribute('aria-current');
                    }
                });
            });
        }
    } catch(e) { console.log("Carousel re-init notice:", e); }
}

function setupLoadMoreButton() {
    let btnContainer = document.getElementById('load-more-container');
    
    if (!btnContainer) {
        btnContainer = document.createElement('div');
        btnContainer.id = 'load-more-container';
        btnContainer.className = 'text-center my-4'; 
        
        const grid = document.getElementById('product-grid');
        if (grid) {
            grid.parentNode.insertBefore(btnContainer, grid.nextSibling);
        }

        btnContainer.innerHTML = `
            <button id="loadMoreBtn" class="btn btn-outline-danger rounded-pill px-5 py-2 shadow-sm" style="display:none;">
                Load More Products
            </button>
        `;

        const btn = document.getElementById('loadMoreBtn');
        if(btn) {
            btn.addEventListener('click', function() {
                loadMoreClicks++; 
                renderNextBatch();
            });
        }
    }
}

function handleScroll() {
    if (!isInfiniteScrollEnabled || isLoading) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        if (loadedCount < currentFilteredProducts.length) {
            renderNextBatch();
        }
    }
}

function renderNextBatch() {
    if (renderTimeout) clearTimeout(renderTimeout);

    isLoading = true;
    const loader = document.getElementById('infinite-loader');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const grid = document.getElementById('product-grid');

    if(loader) loader.classList.remove('d-none');
    if(loadMoreBtn) loadMoreBtn.style.display = 'none';

    renderTimeout = setTimeout(() => {
        const total = currentFilteredProducts.length;
        const start = loadedCount;
        
        // DYNAMIC BATCH SIZE
        const end = Math.min(start + BATCH_SIZE, total); 
        
        if (start >= total) {
             isLoading = false;
             if(loader) loader.classList.add('d-none');
             return;
        }

        const batch = currentFilteredProducts.slice(start, end);

        batch.forEach(p => {
            const card = createProductCard(p);
            grid.appendChild(card);
        });

        loadedCount = end;
        isLoading = false;
        
        if(loader) loader.classList.add('d-none');
        
        const countLabel = document.getElementById('resultCount');
        if (countLabel) countLabel.textContent = `Showing ${loadedCount} of ${total} products`;

        if (loadedCount < total) {
            if (loadMoreClicks >= BUTTON_CLICK_LIMIT) {
                // Infinite Scroll Mode
                if (!isInfiniteScrollEnabled) {
                    isInfiniteScrollEnabled = true;
                    window.addEventListener('scroll', handleScroll);
                }
                if(loadMoreBtn) loadMoreBtn.style.display = 'none';
            
            } else {
                // Button Mode
                if(loadMoreBtn) {
                    loadMoreBtn.style.display = 'inline-block';
                    const remaining = total - loadedCount;
                    loadMoreBtn.textContent = `Load More (${remaining} remaining)`;
                }
            }
        } else {
             if(loadMoreBtn) loadMoreBtn.style.display = 'none';
             window.removeEventListener('scroll', handleScroll);
        }

    }, 300);
}

function createProductCard(p) {
    const card = document.createElement('div');
    card.className = 'card h-100'; 
    card.onclick = () => window.open(`product.html?id=${p.id}`, '_blank');

    const safeName = p.name || "Unknown Product";
    const safeCat = p.category || "Saree";
    const safeFab = p.fabric || "Silk";

    // Use HD image if available, else standard image, else logo fallback
    const safeImg = (p.image && p.image.trim()) ? p.image : 
                   (p.image_hd && p.image_hd.trim()) ? p.image_hd : 'logo/logo.png';
                   
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
    const msg = `Hello Dashami Silk, I am interested in:\n*${safeName}*\nID: ${p.id}\nLink: ${productUrl}`;
    const rawWaLink = `whatsapp://send?phone=${MY_NUMBER}&text=${encodeURIComponent(msg)}`;
    const link = `social_redirect.html?target=${encodeURIComponent(rawWaLink)}&platform=WhatsApp`;

    // loading="lazy" added for performance
    card.innerHTML = `
        <div class="img-box skeleton">
            <div class="card-overlay"><span class="view-btn">View Details</span></div>
            <img class="product-img" 
                 loading="lazy"
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
                <i class="fa-brands fa-whatsapp fa-xl me-2"></i> Buy / Inquire on WhatsApp
            </a>
            <p class="text-center text-muted extra-small mt-3 mb-0" style="font-size: 0.8rem;">
                    <i class="fa-solid fa-lock me-1"></i> Secure checkout via WhatsApp
            </p>
        </div>
    `;
    return card;
}

function applyAllFilters() {
    if (renderTimeout) clearTimeout(renderTimeout);

    // SCROLL TO TOP
    window.scrollTo({ top: 0, behavior: 'smooth' });

    loadMoreClicks = 0;
    isInfiniteScrollEnabled = false;
    window.removeEventListener('scroll', handleScroll);

    const searchInput = document.getElementById('searchBar');
    const minPriceInput = document.getElementById('priceRangeMin');
    const maxPriceInput = document.getElementById('priceRangeMax');
    if(!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    const minPrice = parseInt(minPriceInput.value);
    const maxPrice = parseInt(maxPriceInput.value);
    
    // Rating Logic (Strict Match)
    const ratingEl = document.querySelector('input[name="ratingBtn"]:checked');
    const targetRating = ratingEl ? parseInt(ratingEl.value) : 0;

    currentFilteredProducts = allProducts.filter(p => {
        if (!p.visible || p.deleted) return false;
        const matchesCategory = (activeCategory === 'all') || (p.category === activeCategory) || (p.fabric && p.fabric.includes(activeCategory));
        const searchStr = ((p.name||'') + (p.category||'') + (p.fabric||'') + (p.color||'') + (p.id||'')).toLowerCase();
        const price = parseInt(p.discount_price || p.price || 0);
        
        // Strict Rating: Exact match unless "All" (0) is selected
        const matchR = (targetRating === 0) || ((p.stars || 0) === targetRating);

        return matchesCategory && 
               searchStr.includes(query) && 
               (price >= minPrice && price <= maxPrice) && 
               matchR;
    });

    const grid = document.getElementById('product-grid');
    grid.innerHTML = '';
    loadedCount = 0; 

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if(loadMoreBtn) loadMoreBtn.style.display = 'none';

    if (currentFilteredProducts.length === 0) {
        grid.innerHTML = '<div class="text-center w-100 py-5 text-muted"><h4>No sarees match your filters</h4></div>';
        document.getElementById('resultCount').textContent = "0 products found";
    } else {
        renderNextBatch(); 
    }

    checkFilterAvailability(query, minPrice, maxPrice, activeCategory, targetRating);
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
            const searchStr = ((p.name||'') + (p.category||'') + (p.fabric||'') + (p.color||'') + (p.id||'')).toLowerCase();
            const price = parseInt(p.discount_price || p.price || 0);
            const matchS = searchStr.includes(currentQuery);
            const matchP = price >= minP && price <= maxP;
            
            // STRICT CHECK FOR BUTTON DISABLING
            const matchR = (currentRating === 0) || ((p.stars || 0) === currentRating);
            
            const matchC = (cat === 'all') || (p.category === cat) || (p.fabric && p.fabric.includes(cat));
            return matchS && matchP && matchR && matchC;
        }).length;
        if (count === 0) btn.classList.add('disabled'); else btn.classList.remove('disabled');
    });
}

// Close Filter Panel when clicking outside
document.addEventListener('click', function(event) {
    const filterPanel = document.getElementById('filterPanel');
    const filterBtn = document.getElementById('filterToggleBtn');
    
    if (!filterPanel || !filterBtn) return;

    const isVisible = filterPanel.classList.contains('show');
    const isClickInside = filterPanel.contains(event.target);
    const isClickOnButton = filterBtn.contains(event.target);

    if (isVisible && !isClickInside && !isClickOnButton) {
        const bsCollapse = bootstrap.Collapse.getOrCreateInstance(filterPanel, { toggle: false });
        bsCollapse.hide();
    }
});

init();