// ============================================================
// ФИШКА — Навигатор студента
// script.js — полная версия
// ============================================================

// ===== КОНСТАНТЫ =====
const UNI_COORDS = [55.718318, 37.795649];
const UNI_NAME = 'Финансовый университет';
const UNI_ADDRESS = '4-й Вешняковский проезд, 4к3';

// ===== SVG-ИКОНКИ =====
const ICONS = {
    star: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    clock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    pin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    rouble: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20V4h6a4 4 0 0 1 0 8H9M7 16h10"/></svg>`,
    route: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    heart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
};

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let allPlaces = [];
let filteredPlaces = [];
let myMap = null;
let currentSort = 'distance';
let searchQuery = '';
let previewTimeout = null;
let compareList = [];

// ===== ИЗБРАННОЕ (localStorage) =====
let favorites = [];
try { const saved = JSON.parse(localStorage.getItem('pitanie-favorites') || '[]'); if (Array.isArray(saved)) favorites = saved; } catch (_) {}

function isFavorite(id) {
    return favorites.includes(id);
}

function toggleFavorite(event, id) {
    event.stopPropagation();
    const index = favorites.indexOf(id);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(id);
    }
    try { localStorage.setItem('pitanie-favorites', JSON.stringify(favorites)); } catch (_) {}

    updateFavCount();

    document.querySelectorAll(`.favorite-btn[data-id="${id}"]`).forEach(btn => {
        btn.classList.toggle('active', isFavorite(id));
    });

    const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter;
    if (activeFilter === 'favorites') {
        applyFilter('favorites');
    }
}

function updateFavCount() {
    const el = document.getElementById('favCount');
    if (el) el.textContent = favorites.length;

    const sideEl = document.getElementById('sidebarFavCount');
    if (sideEl) sideEl.textContent = favorites.length;
}

// ===== ЗАГРУЗКА ДАННЫХ =====
async function loadData() {
    try {
        const data = window.PITANIE_DATA || await (await fetch('data.json')).json();
        allPlaces = data.places;
        filteredPlaces = [...allPlaces];
        sortPlaces();
        renderCampusPlaces();
        renderPlaces(filteredPlaces);
        renderTopRated();
        updateResultsCount();
        updateFavCount();
        updateLiveStatus();
        initMap();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        document.getElementById('placesList').innerHTML =
            '<div class="loading">Не удалось загрузить data.json.<br>Проверь, что файл существует и запущен через Live Server.</div>';
    }
}

// ===== КАРТА =====
let placeMarkers;
function baseMap(id) {
    const map = L.map(id, {scrollWheelZoom: false}).setView(UNI_COORDS, 16);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    let failed = false;
    tiles.on('tileerror', () => {
        if (failed) return; failed = true;
        const notice = document.createElement('div'); notice.className = 'map-network-notice';
        notice.textContent = 'Подложка карты недоступна. Точки заведений доступны; проверьте интернет.';
        document.getElementById(id).appendChild(notice);
    });
    L.circleMarker(UNI_COORDS, {radius: 12, color: '#fff', weight: 3, fillColor: '#233E76', fillOpacity: 1})
        .addTo(map).bindTooltip('Финансовый университет');
    setTimeout(() => map.invalidateSize(), 100);
    return map;
}
function initMap() {
    if (typeof L === 'undefined') {
        document.getElementById('map').textContent = 'Не найдены файлы карты. Распакуйте архив полностью.';
        return;
    }
    myMap = baseMap('map');
    placeMarkers = L.layerGroup().addTo(myMap);
    updateMapMarkers();
    if (allPlaces.length) myMap.fitBounds(L.latLngBounds([UNI_COORDS, ...allPlaces.map(p => p.coords)]).pad(0.15), {maxZoom: 16});
    myMap.on('click', closeMapPreview);
}
function addPlacemark(place) {
    // Совпадающие координаты остаются точными: список в popup позволяет выбрать любую точку.
    const same = filteredPlaces.filter(p => p.coords[0] === place.coords[0] && p.coords[1] === place.coords[1]);
    if (same[0] !== place) return;
    const marker = L.circleMarker(place.coords, {radius: 9, color: '#fff', weight: 2,
        fillColor: getColorByType(place.type), fillOpacity: 1}).addTo(placeMarkers);
    marker.bindTooltip(same.map(p => p.name).join(', '));
    const content = document.createElement('div');
    same.forEach(p => {
        const button = document.createElement('button'); button.className = 'map-place-button';
        button.textContent = p.name; button.onclick = () => { myMap.closePopup(); openModal(p.id); };
        content.appendChild(button);
    });
    marker.bindPopup(content);
}

function getColorByType(type) {
    const colors = {
        'Столовая': '#0198AF',
        'Кафе': '#0198AF',
        'Буфет': '#233E76',
        'Фуд-корт': '#ef4444',
        'Ресторан': '#275e9f',
        'Магазин': '#256569'
    };
    return colors[type] || '#6b7280';
}

// ===== ПРЕВЬЮ-КАРТОЧКА НА КАРТЕ =====
function showMapPreview(place) {
    closeMapPreview();

    const isOpen = isOpenNow(place.hours);
    const statusText = isOpen ? 'Открыто по расписанию' : 'Закрыто по расписанию';
    const statusColor = isOpen ? '#0198AF' : '#ef4444';
    const routeUrl = `https://yandex.ru/maps/?rtext=${UNI_COORDS[0]},${UNI_COORDS[1]}~${place.coords[0]},${place.coords[1]}&rtt=pd`;

    const preview = document.createElement('div');
    preview.className = 'map-preview';
    preview.id = 'mapPreview';
    preview.innerHTML = `
        <div class="map-preview-header">
            <img src="${place.image || 'placeholder.svg'}"
                 alt="${place.name}"
                 onerror="this.onerror=null;this.src='placeholder.svg'">
            <span class="map-preview-badge" style="background: ${statusColor};">${statusText}</span>
            <button class="map-preview-close" onclick="closeMapPreview()" aria-label="Закрыть">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="map-preview-body">
            <h4>${place.name}</h4>
            <div class="map-preview-meta">
                <span class="rating-icon">${ICONS.star}</span>
                <strong>${place.rating}</strong>
                <span>· ${place.reviews_count || 0} отзывов</span>
                <span>·</span>
                <span class="map-preview-price">от ${place.avg_price} ₽</span>
                <span>·</span>
                <span>${place.distance}</span>
            </div>
            <div class="map-preview-actions">
                <button class="map-preview-btn primary" onclick="openModal(${place.id}); closeMapPreview();">
                    Подробнее
                </button>
                <a href="${routeUrl}" target="_blank" class="map-preview-btn secondary">
                    ${ICONS.route}
                    Маршрут
                </a>
            </div>
        </div>
    `;

    const mapContainer = document.getElementById('map');
    mapContainer.appendChild(preview);

    requestAnimationFrame(() => {
        preview.classList.add('active');
    });

    previewTimeout = setTimeout(closeMapPreview, 30000);
}

function closeMapPreview() {
    const preview = document.getElementById('mapPreview');
    if (preview) {
        preview.classList.remove('active');
        setTimeout(() => preview.remove(), 300);
    }
    if (previewTimeout) {
        clearTimeout(previewTimeout);
        previewTimeout = null;
    }
}

// ===== СЕКЦИЯ "ПИТАНИЕ В КАМПУСЕ" =====
function renderCampusPlaces() {
    const list = document.getElementById('campusList');
    const campusPlaces = allPlaces.filter(p => p.inCampus === true);

    if (campusPlaces.length === 0) {
        list.innerHTML = '';
        return;
    }

    const typeOrder = { 'Столовая': 1, 'Буфет': 2, 'Кафе': 3, 'Магазин': 4 };
    campusPlaces.sort((a, b) => (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99));

    list.innerHTML = campusPlaces.map(place => {
        const isOpen = isOpenNow(place.hours);
        const statusText = isOpen ? 'Открыто по расписанию' : 'Закрыто по расписанию';
        const statusClass = isOpen ? '' : 'closed';
        const fav = isFavorite(place.id);

        return `
            <div class="campus-card" onclick="openModal(${place.id})">
                <button class="favorite-btn ${fav ? 'active' : ''}"
                        data-id="${place.id}"
                        onclick="toggleFavorite(event, ${place.id})"
                        aria-label="В избранное">
                    ${ICONS.heart}
                </button>
                <button class="compare-checkbox ${compareList.includes(place.id) ? 'checked' : ''}"
                        data-id="${place.id}"
                        onclick="toggleCompare(event, ${place.id})"
                        aria-label="Сравнить"></button> 
                <img src="${place.image || 'placeholder.svg'}"
                     alt="${place.name}"
                     onerror="this.onerror=null;this.src='placeholder.svg'">
                <div class="campus-info">
                    <span class="campus-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>
                        </svg>
                        Внутри вуза
                    </span>
                    <h3>${place.name}</h3><div class="student-note">Скидка студентам: ${place.student_discount?.status === 'confirmed' ? 'подтверждена' : 'нет подтверждения'}</div>
                    <div class="place-rating">
                        <span class="rating-icon" style="color: #f59e0b;">${ICONS.star}</span>
                        <strong style="color: white;">${place.rating}</strong>
                        <span>· ${place.reviews_count} отзывов</span>
                    </div>
                    <div class="place-meta">
                        <span class="place-price">от ${place.avg_price} ₽</span>
                        <span class="meta-dot">·</span>
                        <span>${place.distance}</span>
                    </div>
                </div>
                <span class="campus-status ${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}

// ===== ТОП-3 ПО РЕЙТИНГУ =====
function renderTopRated() {
    const container = document.getElementById('topRated');
    if (!container) return;

    // Берём заведения вне кампуса, сортируем по рейтингу, берём топ-3
    const top = [...allPlaces]
        .filter(p => !p.inCampus)
        .sort((a, b) => {
            // Сначала по рейтингу (убывание)
            if (b.rating !== a.rating) return b.rating - a.rating;
            // Если равны — по количеству отзывов (больше = лучше)
            return (b.reviews_count || 0) - (a.reviews_count || 0);
        })
        .slice(0, 3);

    if (top.length === 0) {
        container.innerHTML = '';
        return;
    }

    const placeLabels = ['gold', 'silver', 'bronze'];

    container.innerHTML = top.map((place, index) => `
        <div class="top-rated-card" onclick="openModal(${place.id})">
            <div class="top-rated-image">
                <img src="${place.image || 'placeholder.svg'}"
                     alt="${place.name}"
                     onerror="this.onerror=null;this.src='placeholder.svg'">
                <span class="top-rated-place ${placeLabels[index]}">${index + 1}</span>
                <span class="top-rated-rating">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    ${place.rating}
                </span>
            </div>
            <div class="top-rated-info">
                <div class="top-rated-name">${place.name}</div>
                <div class="top-rated-category">${place.type} · ${place.distance}</div>
                <div class="top-rated-price">от ${place.avg_price} ₽</div>
            </div>
        </div>
    `).join('');
}

// ===== СПИСОК ЗАВЕДЕНИЙ С ГРУППИРОВКОЙ =====
function renderPlaces(places) {
    const list = document.getElementById('placesList');

    const visiblePlaces = places.filter(p => p.inCampus !== true);

    if (visiblePlaces.length === 0) {
        list.innerHTML = '<div class="loading">Подходящих мест пока нет.<br>Для фильтра скидок: подтверждённых предложений ещё нет.<br><button class="filter-btn" onclick="applyFilter(\'all\')">Показать все места</button></div>';
        updateResultsCount();
        return;
    }

    const categories = [
        { key: 'Кофейни',         label: 'Кофейни',         icon: ICONS.pin, cls: 'coffee' },
        { key: 'Быстрое питание', label: 'Быстрое питание', icon: ICONS.pin, cls: 'fastfood' },
        { key: 'Рестораны',       label: 'Рестораны',       icon: ICONS.pin,  cls: 'resto' },
        { key: 'Магазины',        label: 'Магазины',        icon: ICONS.pin, cls: 'shop' }
    ];

    let html = '';

    categories.forEach(cat => {
        const items = visiblePlaces.filter(p => p.category === cat.key);
        if (items.length === 0) return;

        html += `
            <div class="category-group">
                <div class="category-header">
                    <span class="category-icon ${cat.cls}">${cat.icon}</span>
                    <span>${cat.label}</span>
                    <span class="category-count">${items.length}</span>
                </div>
                <div class="places-list">
                    ${items.map(place => renderPlaceCard(place)).join('')}
                </div>
            </div>
        `;
    });

    const uncategorized = visiblePlaces.filter(p => !p.category);
    if (uncategorized.length > 0) {
        html += `
            <div class="category-group">
                <div class="category-header">
                    <span class="category-icon shop">${ICONS.pin}</span>
                    <span>Другое</span>
                    <span class="category-count">${uncategorized.length}</span>
                </div>
                <div class="places-list">
                    ${uncategorized.map(place => renderPlaceCard(place)).join('')}
                </div>
            </div>
        `;
    }

    list.innerHTML = html;
    updateResultsCount();
}

// ===== ОТРИСОВКА ОДНОЙ КАРТОЧКИ =====
function renderPlaceCard(place) {
    const isOpen = isOpenNow(place.hours);
    const statusText = isOpen ? 'Открыто по расписанию' : 'Закрыто по расписанию';
    const statusClass = isOpen ? '' : 'closed';
    const fav = isFavorite(place.id);
    const inCompare = compareList.includes(place.id);

    return `
        <div class="place-card" onclick="openModal(${place.id})">
            <button class="favorite-btn ${fav ? 'active' : ''}"
                    data-id="${place.id}"
                    onclick="toggleFavorite(event, ${place.id})"
                    aria-label="В избранное">
                ${ICONS.heart}
            </button>
            <button class="compare-checkbox ${inCompare ? 'checked' : ''}"
                    data-id="${place.id}"
                    onclick="toggleCompare(event, ${place.id})"
                    aria-label="Сравнить"></button>
            <img src="${place.image || 'placeholder.svg'}"
                 alt="${place.name}"
                 onerror="this.onerror=null;this.src='placeholder.svg'">
            <div class="place-info">
                <h3>${place.name}</h3><div class="student-note">Скидка студентам: ${place.student_discount?.status === 'confirmed' ? 'подтверждена' : 'нет подтверждения'}</div>
                <div class="place-rating">
                    <span class="rating-icon">${ICONS.star}</span>
                    <strong>${place.rating}</strong>
                    <span>· ${place.reviews_count || 0} отзывов</span>
                </div>
                <div class="place-meta">
                    <span class="place-price">от ${place.avg_price} ₽</span>
                    <span class="meta-dot">·</span>
                    <span>${place.distance}</span>
                </div>
            </div>
            <span class="place-status ${statusClass}">${statusText}</span>
        </div>
    `;
}

// ===== СЧЁТЧИК РЕЗУЛЬТАТОВ =====
function updateResultsCount() {
    const count = filteredPlaces.filter(p => p.inCampus !== true).length;
    const el = document.getElementById('resultsCount');
    if (el) {
        let word = 'мест';
        if (count % 10 === 1 && count % 100 !== 11) word = 'место';
        else if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) word = 'места';
        el.textContent = `${count} ${word}`;
    }
}

// ===== СОРТИРОВКА =====
function sortPlaces() {
    if (currentSort === 'distance') {
        filteredPlaces.sort((a, b) => a.walk_time - b.walk_time);
    } else if (currentSort === 'rating') {
        filteredPlaces.sort((a, b) => b.rating - a.rating);
    } else if (currentSort === 'price') {
        filteredPlaces.sort((a, b) => a.avg_price - b.avg_price);
    }
}

function toggleSort() {
    document.getElementById('sortMenu').classList.toggle('open');
}

document.querySelectorAll('.sort-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
        currentSort = btn.dataset.sort;
        document.querySelectorAll('.sort-menu button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('sortLabel').textContent = btn.textContent;
        document.getElementById('sortMenu').classList.remove('open');

        sortPlaces();
        renderPlaces(filteredPlaces);
        updateMapMarkers();
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.sort-dropdown')) {
        document.getElementById('sortMenu')?.classList.remove('open');
    }
});

// ===== ФИЛЬТРЫ =====
document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (!filter) return;
        applyFilter(filter);
    });
});

function applyFilter(filter) {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    document.querySelector(`.filter-btn[data-filter="${filter}"]`)?.classList.add('active');

    if (filter === 'all') {
        filteredPlaces = [...allPlaces];
    } else if (filter === 'cheap') {
        filteredPlaces = allPlaces.filter(p => p.avg_price <= 150);
    } else if (filter === 'walk') {
        filteredPlaces = allPlaces.filter(p => p.walk_time <= 5);
    } else if (filter === 'open') {
        filteredPlaces = allPlaces.filter(p => isOpenNow(p.hours));
    } else if (filter === 'student') {
        filteredPlaces = allPlaces.filter(p => p.student_discount?.status === 'confirmed');
    } else if (filter === 'favorites') {
        filteredPlaces = allPlaces.filter(p => isFavorite(p.id));
    }

    sortPlaces();
    renderPlaces(filteredPlaces);
    updateMapMarkers();
    updateFavCount();
}

// ===== УМНАЯ ПРОВЕРКА "ОТКРЫТО СЕЙЧАС" =====
function isOpenNow(hoursStr) {
    if (!hoursStr) return true;

    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Moscow'}));
    const day = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (hoursStr.toLowerCase().includes('круглосуточно')) return true;

    const regex = /(Пн|Вт|Ср|Чт|Пт|Сб|Вс)(?:-(Пн|Вт|Ср|Чт|Пт|Сб|Вс))?\s+(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/gi;
    const daysMap = { 'Пн': 1, 'Вт': 2, 'Ср': 3, 'Чт': 4, 'Пт': 5, 'Сб': 6, 'Вс': 0 };

    let match;
    while ((match = regex.exec(hoursStr)) !== null) {
        const startDay = daysMap[match[1]];
        const endDay = match[2] ? daysMap[match[2]] : startDay;
        const openMin = parseInt(match[3]) * 60 + parseInt(match[4]);
        const closeMin = parseInt(match[5]) * 60 + parseInt(match[6]);

        let dayMatches = false;
        if (startDay <= endDay) {
            dayMatches = day >= startDay && day <= endDay;
        } else {
            dayMatches = day >= startDay || day <= endDay;
        }

        if (dayMatches && currentMinutes >= openMin && currentMinutes <= closeMin) {
            return true;
        }
    }

    return false;
}

// ===== ОБНОВЛЕНИЕ МЕТОК НА КАРТЕ =====
function updateMapMarkers() {
    if (!myMap || !placeMarkers) return;
    placeMarkers.clearLayers();
    filteredPlaces.forEach(addPlacemark);
}

// ===== МОДАЛЬНОЕ ОКНО =====
function openModal(id) {
    const place = allPlaces.find(p => p.id === id);
    if (!place) return;

    const routeUrl = `https://yandex.ru/maps/?rtext=${UNI_COORDS[0]},${UNI_COORDS[1]}~${place.coords[0]},${place.coords[1]}&rtt=pd`;

    const menuHTML = place.menu && place.menu.length
        ? `
            <div class="modal-menu">
                <h3>Меню</h3>
                ${place.menu.map(item => `
                    <div class="menu-item">
                        <span>${item.name}</span>
                        <span class="menu-item-price">${item.price} ₽</span>
                    </div>
                `).join('')}
            </div>
        `
        : '';

    const featuresHTML = place.features && place.features.length
        ? `
            <div class="modal-features">
                ${place.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
            </div>
        `
        : '';

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-handle"></div>
        <img class="modal-hero-img"
             src="${place.image || 'placeholder.svg'}"
             alt="${place.name}"
             onerror="this.onerror=null;this.src='placeholder.svg'">

        <div class="modal-head">
            <h2>${place.name}</h2>
            <div class="modal-rating">
                <span class="rating-icon">${ICONS.star}</span>
                <strong>${place.rating}</strong>
                <span>/ 5 · ${place.reviews_count || 0} отзывов</span>
            </div>
            <div class="modal-address">
                ${ICONS.pin}
                <span>${place.address || place.distance + ' от вуза'}</span>
            </div>
        </div>

        <div class="modal-green">
            <div class="modal-green-item">
                <span class="modal-green-icon">${ICONS.clock}</span>
                <span>${place.hours || 'Часы не указаны'}</span>
            </div>
            <div class="modal-green-item">
                <span class="modal-green-icon">${ICONS.rouble}</span>
                <span>${place.avg_price} ₽</span>
            </div>
        </div>

        <div class="modal-body">
            <div class="modal-route-map" id="routeMap"></div>
            <section class="discount-details"><h3>Скидка студентам</h3><p>${place.student_discount?.status === 'confirmed' ? place.student_discount.details : 'Информация не подтверждена. Перед заказом уточните наличие скидки и необходимость студенческого билета.'}</p>${place.student_discount?.checked_at ? `<p>Проверено: ${place.student_discount.checked_at}</p>` : ''}</section><p class="data-note">Сведения из исходного каталога проекта. Цены, расписание, рейтинг и меню требуют уточнения у заведения.</p>${menuHTML}
            ${featuresHTML}

            <a href="${routeUrl}" target="_blank" class="route-btn">
                ${ICONS.route}
                Построить маршрут
            </a>
            <button class="close-btn" onclick="closeModal()">Закрыть</button>
        </div>
    `;

    document.getElementById('modal').classList.add('active');
    setTimeout(() => initRouteMap(place), 100);
}

function initRouteMap(place) {
    const el = document.getElementById('routeMap');
    if (!el || typeof L === 'undefined') return;
    const map = baseMap('routeMap');
    L.circleMarker(place.coords, {radius: 10, color: '#fff', weight: 2, fillColor: '#0198AF', fillOpacity: 1})
        .addTo(map).bindTooltip(place.name, {permanent: true});
    map.fitBounds(L.latLngBounds([UNI_COORDS, place.coords]).pad(0.35), {maxZoom: 17});
}

function closeModal(event) {
    if (event && event.target.id !== 'modal' && event.type === 'click') return;
    document.getElementById('modal').classList.remove('active');
}

// ===== ЖИВОЙ СТАТУС В ШАПКЕ =====
function updateLiveStatus() {
    const dot = document.getElementById('liveDot');
    const text = document.getElementById('liveText');
    if (!dot || !text) return;

    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Moscow'}));
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const openCount = allPlaces.filter(p => isOpenNow(p.hours)).length;
    const total = allPlaces.length;

    const ratio = openCount / total;
    let dotClass = '';
    if (ratio >= 0.5) {
        dotClass = '';
    } else if (ratio >= 0.25) {
        dotClass = 'warn';
    } else {
        dotClass = 'danger';
    }

    dot.className = 'live-dot ' + dotClass;
    text.textContent = `${timeStr} · открыто ${openCount} из ${total}`;
}

setInterval(updateLiveStatus, 60000);

// ===== ПОИСК =====
function toggleSearch() {
    const panel = document.getElementById('searchPanel');
    if (!panel) return;

    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        closeSearch();
    } else {
        openSearch();
    }
}

function openSearch() {
    const panel = document.getElementById('searchPanel');
    panel.classList.add('open');
    setTimeout(() => {
        document.getElementById('searchInput')?.focus();
    }, 300);

    showSuggestions();
}

function closeSearch() {
    const panel = document.getElementById('searchPanel');
    panel.classList.remove('open');
    clearSearch(true);
}

function clearSearch(keepClosed) {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';

    searchQuery = '';

    filteredPlaces = [...allPlaces];
    sortPlaces();
    renderPlaces(filteredPlaces);
    updateMapMarkers();

    if (!keepClosed) {
        showSuggestions();
        document.getElementById('searchInput')?.focus();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    if (!input) return;

    input.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        searchQuery = value;

        const clearBtn = document.getElementById('searchClear');
        if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';

        if (value.length === 0) {
            clearSearch(true);
            showSuggestions();
            return;
        }

        hideSuggestions();
        performSearch(value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearch();
        }
    });
});

function performSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) return;

    const results = allPlaces.filter(place => {
        const haystack = [
            place.name || '',
            place.type || '',
            place.category || '',
            place.address || ''
        ].join(' ').toLowerCase();

        return haystack.includes(q);
    });

    filteredPlaces = results;
    sortPlaces();
    renderPlaces(filteredPlaces);
    updateMapMarkers();
    updateResultsCount();

    const list = document.getElementById('placesList');
    if (results.length === 0 && list) {
        list.innerHTML = `
            <div class="search-empty">
                <div class="search-empty-icon"></div>
                <div class="search-empty-text">
                    Ничего не найдено по запросу<br>
                    <strong>«${escapeHTML(query)}»</strong>
                </div>
            </div>
        `;
    }
}

const SUGGESTIONS = [
    { label: ' Кофейни', query: 'кофейни' },
    { label: ' Быстрое питание', query: 'быстрое питание' },
    { label: ' Рестораны', query: 'рестораны' },
    { label: ' Магазины', query: 'магазины' },
    { label: ' До 150 ₽', query: '150' },
    { label: ' Вешняковский', query: 'вешняковский' },
    { label: ' Кампус', query: 'кампусе' }
];

function showSuggestions() {
    const placesList = document.getElementById('placesList');
    if (!placesList) return;

    hideSuggestions();

    const suggestions = document.createElement('div');
    suggestions.className = 'search-suggestions';
    suggestions.id = 'searchSuggestions';
    suggestions.innerHTML = SUGGESTIONS.map(s =>
        `<button class="search-suggestion" onclick="applySuggestion('${s.query}')">${s.label}</button>`
    ).join('');

    placesList.parentNode.insertBefore(suggestions, placesList);
}

function hideSuggestions() {
    document.getElementById('searchSuggestions')?.remove();
}

function applySuggestion(query) {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = query;
        input.dispatchEvent(new Event('input'));
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===== БОКОВОЕ МЕНЮ =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;

    const isOpen = sidebar.classList.contains('active');
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

function sidebarAction(action) {
    closeSidebar();

    setTimeout(() => {
        switch (action) {
            case 'map':
                document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                break;

            case 'catalog':
                document.getElementById('placesList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;

            case 'favorites':
                applyFilter('favorites');
                document.getElementById('placesList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                break;

            case 'export':
                exportCSV();
                break;
        }
    }, 300);
}

// ===== ЭКСПОРТ В CSV =====
function exportCSV() {
    if (filteredPlaces.length === 0) {
        alert('Нет данных для экспорта');
        return;
    }

    const headers = [
        'ID',
        'Название',
        'Тип',
        'Категория',
        'Адрес',
        'Часы работы',
        'Средний чек (₽)',
        'Рейтинг',
        'Отзывов',
        'Расстояние',
        'Пешком (мин)',
        'Широта',
        'Долгота',
        'В кампусе',
        'Особенности'
    ];

    const rows = filteredPlaces.map(p => [
        p.id,
        escapeCSV(p.name),
        p.type,
        p.category || '',
        escapeCSV(p.address || ''),
        escapeCSV(p.hours || ''),
        p.avg_price,
        p.rating,
        p.reviews_count || 0,
        p.distance || '',
        p.walk_time || '',
        p.coords[0],
        p.coords[1],
        p.inCampus ? 'да' : 'нет',
        escapeCSV((p.features || []).join('; '))
    ]);

    const csv = [
        headers.join(';'),
        ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `pitanie-ryadom_${date}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Экспортировано ${filteredPlaces.length} мест`);
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// ===== ТОСТ-УВЕДОМЛЕНИЕ =====
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: #233E76;
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 2000;
        animation: toastIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================================
// УВЕДОМЛЕНИЯ
// ============================================================

let notifications = JSON.parse(localStorage.getItem('pitanie-notif-read') || '[]');

function toggleNotifications(event) {
    event.stopPropagation();
    const panel = document.getElementById('notifPanel');
    if (!panel) return;

    if (panel.classList.contains('active')) {
        closeNotifications();
    } else {
        openNotifications();
    }
}

function openNotifications() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;

    // Заполняем уведомления
    buildNotifications();

    // Создаём backdrop на мобильном
    let backdrop = document.getElementById('notifBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'notif-backdrop';
        backdrop.id = 'notifBackdrop';
        backdrop.onclick = closeNotifications;
        document.body.appendChild(backdrop);
    }
    requestAnimationFrame(() => backdrop.classList.add('active'));

    panel.classList.add('active');

    // Скрываем оранжевую точку
    setTimeout(() => {
        document.getElementById('notifDot')?.classList.add('hidden');
        localStorage.setItem('pitanie-notif-read', JSON.stringify(['all']));
    }, 500);
}

function closeNotifications() {
    const panel = document.getElementById('notifPanel');
    const backdrop = document.getElementById('notifBackdrop');
    panel?.classList.remove('active');
    backdrop?.classList.remove('active');
}

// Клик вне панели — закрывает
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('notifBtn');
    if (!panel?.classList.contains('active')) return;

    if (!e.target.closest('#notifPanel') && !e.target.closest('#notifBtn')) {
        closeNotifications();
    }
});

// ===== ФОРМИРОВАНИЕ УВЕДОМЛЕНИЙ =====
function buildNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;

    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Moscow'}));
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const items = [];

    // 1. Живая сводка
    const openCount = allPlaces.filter(p => isOpenNow(p.hours)).length;
    const total = allPlaces.length;
    const ratio = openCount / total;

    let summaryIcon = 'green';
    let summaryTitle = `Сейчас открыто ${openCount} из ${total}`;
    if (ratio < 0.25) {
        summaryIcon = 'red';
        summaryTitle = `Почти всё закрыто: открыто ${openCount} из ${total}`;
    } else if (ratio < 0.5) {
        summaryIcon = 'orange';
        summaryTitle = `Открыто ${openCount} из ${total} заведений`;
    }

    items.push({
        icon: ICONS.pin,
        iconClass: summaryIcon,
        title: summaryTitle,
        text: `Текущее время: ${timeStr}`,
        time: 'только что'
    });

    // 2. Ближайшее открытое заведение
    const openPlaces = allPlaces
        .filter(p => isOpenNow(p.hours))
        .sort((a, b) => a.walk_time - b.walk_time);

    if (openPlaces.length > 0) {
        const nearest = openPlaces[0];
        items.push({
            icon: ICONS.pin,
            iconClass: 'blue',
            title: `Ближайшее открыто: ${nearest.name}`,
            text: `${nearest.distance} пешком · ${nearest.avg_price} ₽ · рейтинг ${nearest.rating}`,
            time: 'сейчас',
            onclick: `openModal(${nearest.id})`
        });
    }

    // 3. Что скоро закроется (в течение часа)
    const closingSoon = findClosingSoon();
    closingSoon.forEach(place => {
        items.push({
            icon: '⏰',
            iconClass: 'orange',
            title: `${place.name} закроется через ${place.minutesLeft} мин`,
            text: `Успей поесть · ${place.distance} пешком`,
            time: 'важно',
            onclick: `openModal(${place.id})`
        });
    });

    // 4. Что скоро откроется
    const openingSoon = findOpeningSoon();
    openingSoon.slice(0, 2).forEach(place => {
        items.push({
            icon: ICONS.pin,
            iconClass: 'green',
            title: `${place.name} откроется в ${place.opensAt}`,
            text: `Через ${place.minutesLeft} мин · ${place.distance} пешком`,
            time: 'скоро',
            onclick: `openModal(${place.id})`
        });
    });

    // 5. Столовая в кампусе
    const canteen = allPlaces.find(p => p.type === 'Столовая' && p.inCampus);
    if (canteen) {
        const isOpen = isOpenNow(canteen.hours);
        items.push({
            icon: ICONS.pin,
            iconClass: isOpen ? 'green' : 'gray',
            title: `Столовая Финуниверситета ${isOpen ? 'открыта' : 'закрыта'}`,
            text: isOpen
                ? `От ${canteen.avg_price} ₽ · 150 мест · 2 этаж`
                : `Откроется: ${canteen.hours}`,
            time: isOpen ? 'открыто' : 'закрыто',
            onclick: `openModal(${canteen.id})`
        });
    }

    // 6. Обновление датасета
    items.push({
        icon: ICONS.pin,
        iconClass: 'gray',
        title: 'Датасет обновлён',
        text: `Всего ${total} заведений · сентябрь 2026`,
        time: 'информация'
    });

    // Рендерим
    list.innerHTML = items.map(item => `
        <div class="notif-item ${item.iconClass === 'orange' ? 'warn-item' : ''} ${item.iconClass === 'red' ? 'danger-item' : ''}"
             ${item.onclick ? `onclick="${item.onclick}; closeNotifications();"` : ''}>
            <div class="notif-icon ${item.iconClass}">${item.icon}</div>
            <div class="notif-content">
                <div class="notif-title">${item.title}</div>
                <div class="notif-text">${item.text}</div>
                <div class="notif-time">${item.time}</div>
            </div>
        </div>
    `).join('');
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ УВЕДОМЛЕНИЙ =====

// Что закроется в течение часа
function findClosingSoon() {
    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Moscow'}));
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const result = [];

    allPlaces.forEach(place => {
        if (!place.hours) return;
        if (place.hours.toLowerCase().includes('круглосуточно')) return;

        const regex = /(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/g;
        let match;
        while ((match = regex.exec(place.hours)) !== null) {
            const closeMin = parseInt(match[3]) * 60 + parseInt(match[4]);
            const diff = closeMin - currentMinutes;

            // Открыто сейчас, закроется в течение 60 минут
            if (isOpenNow(place.hours) && diff > 0 && diff <= 60) {
                result.push({
                    ...place,
                    minutesLeft: diff
                });
                break;
            }
        }
    });

    return result.sort((a, b) => a.minutesLeft - b.minutesLeft);
}

// Что откроется в течение часа
function findOpeningSoon() {
    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Europe/Moscow'}));
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const result = [];

    allPlaces.forEach(place => {
        if (!place.hours) return;
        if (isOpenNow(place.hours)) return;
        if (place.hours.toLowerCase().includes('круглосуточно')) return;

        const regex = /(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})/g;
        let match;
        while ((match = regex.exec(place.hours)) !== null) {
            const openMin = parseInt(match[1]) * 60 + parseInt(match[2]);
            const diff = openMin - currentMinutes;

            if (diff > 0 && diff <= 120) {
                result.push({
                    ...place,
                    minutesLeft: diff,
                    opensAt: match[1] + ':' + match[2]
                });
                break;
            }
        }
    });

    return result.sort((a, b) => a.minutesLeft - b.minutesLeft);
}

// ============================================================
// СРАВНЕНИЕ ЗАВЕДЕНИЙ
// ============================================================

function toggleCompare(event, id) {
    event.stopPropagation();
    const index = compareList.indexOf(id);

    if (index > -1) {
        compareList.splice(index, 1);
    } else {
        if (compareList.length >= 3) {
            showToast('Можно сравнивать максимум 3 заведения');
            return;
        }
        compareList.push(id);
    }

    updateCompareUI();
}

function updateCompareUI() {
    // Обновляем все чекбоксы
    document.querySelectorAll('.compare-checkbox').forEach(btn => {
        const id = parseInt(btn.dataset.id);
        btn.classList.toggle('checked', compareList.includes(id));
    });

    // Обновляем счётчик
    const countEl = document.getElementById('compareCount');
    if (countEl) countEl.textContent = compareList.length;

    // Показываем/скрываем панель
    const bar = document.getElementById('compareBar');
    if (bar) {
        bar.classList.toggle('active', compareList.length > 0);
    }

    // Активируем кнопку "Сравнить" при 2+
    const goBtn = document.getElementById('compareGoBtn');
    if (goBtn) {
        goBtn.disabled = compareList.length < 2;
        goBtn.textContent = compareList.length < 2
            ? 'Выберите ещё'
            : 'Сравнить';
    }
}

function clearCompare() {
    compareList = [];
    updateCompareUI();
}

function showCompare() {
    if (compareList.length < 2) {
        showToast('Выберите минимум 2 заведения');
        return;
    }

    const places = compareList
        .map(id => allPlaces.find(p => p.id === id))
        .filter(Boolean);

    if (places.length < 2) return;

    // Находим лучшее по каждому критерию
    const bestRating = Math.max(...places.map(p => p.rating));
    const bestPrice = Math.min(...places.map(p => p.avg_price));
    const bestDistance = Math.min(...places.map(p => p.walk_time));
    const bestReviews = Math.max(...places.map(p => p.reviews_count || 0));

    const columnsHTML = places.map(p => {
        const isBestRating = p.rating === bestRating;
        const isBestPrice = p.avg_price === bestPrice;
        const isBestDistance = p.walk_time === bestDistance;
        const isBestReviews = (p.reviews_count || 0) === bestReviews;

        const hasBest = isBestRating || isBestPrice;

        return `
            <div class="compare-col ${hasBest ? 'best' : ''}">
                <div class="compare-col-header">
                    <img class="compare-col-img"
                         src="${p.image || 'placeholder.svg'}"
                         alt="${p.name}"
                         onerror="this.onerror=null;this.src='placeholder.svg'">
                    <div class="compare-col-name">${p.name}</div>
                    <div class="compare-col-type">${p.type}</div>
                </div>

                <div class="compare-row">
                    <span class="compare-row-label">Рейтинг</span>
                    <span class="compare-row-value ${isBestRating ? 'star' : ''}"> ${p.rating}</span>
                </div>

                <div class="compare-row">
                    <span class="compare-row-label">Средний чек</span>
                    <span class="compare-row-value ${isBestPrice ? 'green' : ''}">${p.avg_price} ₽</span>
                </div>

                <div class="compare-row">
                    <span class="compare-row-label">Пешком</span>
                    <span class="compare-row-value ${isBestDistance ? 'green' : ''}">${p.walk_time} мин</span>
                </div>

                <div class="compare-row">
                    <span class="compare-row-label">Отзывов</span>
                    <span class="compare-row-value ${isBestReviews ? 'green' : ''}">${p.reviews_count || 0}</span>
                </div>

                <div class="compare-row">
                    <span class="compare-row-label">Расстояние</span>
                    <span class="compare-row-value">${p.distance}</span>
                </div>

                <button class="compare-remove" onclick="removeFromCompare(${p.id})">
                    Убрать
                </button>
            </div>
        `;
    }).join('');

    document.getElementById('modalContent').innerHTML = `
        <div class="modal-handle"></div>
        <div class="compare-modal">
            <h2>Сравнение заведений</h2>
            <div class="compare-table">
                ${columnsHTML}
            </div>
            <button class="close-btn" onclick="closeModal()">Закрыть</button>
        </div>
    `;
    document.getElementById('modal').classList.add('active');
}

function removeFromCompare(id) {
    const index = compareList.indexOf(id);
    if (index > -1) {
        compareList.splice(index, 1);
    }

    if (compareList.length < 2) {
        closeModal();
        updateCompareUI();
        return;
    }

    updateCompareUI();
    showCompare();
}

// ===== ЗАПУСК =====
loadData();