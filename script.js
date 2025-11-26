// 時鐘功能
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-TW');
    const date = now.toLocaleDateString('zh-TW', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    });
    
    document.getElementById('clock').textContent = time;
    document.getElementById('date').textContent = date;
}

updateClock();
setInterval(updateClock, 1000);

// 搜尋功能
const searchInput = document.getElementById('search-input');
const suggestionsContainer = document.getElementById('search-suggestions');

// 搜尋歷史和熱門搜尋
let searchHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
const popularSearches = [
    'YouTube', 'Gmail', 'Google Maps', '天氣', '新聞',
    'Facebook', 'Instagram', 'Twitter', 'Netflix', 'Spotify'
];

// 顯示搜尋建議
function showSuggestions(query) {
    suggestionsContainer.innerHTML = '';
    
    if (!query.trim()) {
        // 如果沒有輸入，顯示搜尋歷史和熱門搜尋
        showDefaultSuggestions();
        return;
    }
    
    // 模擬 Google 搜尋建議 API
    const mockSuggestions = generateMockSuggestions(query);
    
    mockSuggestions.forEach((suggestion, index) => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'suggestion-item';
        suggestionElement.innerHTML = `
            <div class="suggestion-icon">
                <i class="fas fa-search"></i>
            </div>
            <div class="suggestion-text">${suggestion}</div>
            ${index === 0 ? '<div class="suggestion-shortcut">Enter</div>' : ''}
        `;
        
        suggestionElement.addEventListener('click', () => {
            searchInput.value = suggestion;
            performSearch(suggestion);
        });
        
        suggestionsContainer.appendChild(suggestionElement);
    });
    
    suggestionsContainer.style.display = 'block';
}

// 顯示預設建議（搜尋歷史和熱門搜尋）
function showDefaultSuggestions() {
    // 顯示搜尋歷史（最多5個）
    if (searchHistory.length > 0) {
        const historyTitle = document.createElement('div');
        historyTitle.className = 'suggestion-item';
        historyTitle.innerHTML = `
            <div class="suggestion-icon">
                <i class="fas fa-history"></i>
            </div>
            <div class="suggestion-text" style="font-weight: 500; color: #5f6368;">搜尋記錄</div>
        `;
        suggestionsContainer.appendChild(historyTitle);
        
        searchHistory.slice(0, 5).forEach(item => {
            const suggestionElement = document.createElement('div');
            suggestionElement.className = 'suggestion-item';
            suggestionElement.innerHTML = `
                <div class="suggestion-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="suggestion-text">${item}</div>
            `;
            
            suggestionElement.addEventListener('click', () => {
                searchInput.value = item;
                performSearch(item);
            });
            
            suggestionsContainer.appendChild(suggestionElement);
        });
    }
    
    // 顯示熱門搜尋
    const popularTitle = document.createElement('div');
    popularTitle.className = 'suggestion-item';
    popularTitle.innerHTML = `
        <div class="suggestion-icon">
            <i class="fas fa-fire"></i>
        </div>
        <div class="suggestion-text" style="font-weight: 500; color: #5f6368;">熱門搜尋</div>
    `;
    suggestionsContainer.appendChild(popularTitle);
    
    popularSearches.forEach(item => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'suggestion-item';
        suggestionElement.innerHTML = `
            <div class="suggestion-icon">
                <i class="fas fa-search"></i>
            </div>
            <div class="suggestion-text">${item}</div>
        `;
        
        suggestionElement.addEventListener('click', () => {
            searchInput.value = item;
            performSearch(item);
        });
        
        suggestionsContainer.appendChild(suggestionElement);
    });
    
    suggestionsContainer.style.display = 'block';
}

// 生成模擬搜尋建議
function generateMockSuggestions(query) {
    const baseSuggestions = [
        `${query} 是什麼`,
        `${query} 教學`,
        `${query} 價格`,
        `${query} 評價`,
        `${query} 下載`,
        `${query} 線上`,
        `${query} 台灣`,
        `${query} 2024`
    ];
    
    // 根據查詢長度返回不同數量的建議
    const count = Math.min(8, Math.max(3, 10 - query.length));
    return baseSuggestions.slice(0, count);
}

// 執行搜尋
function performSearch(query) {
    if (!query.trim()) return;
    
    // 添加到搜尋歷史
    addToSearchHistory(query);
    
    // 隱藏建議
    suggestionsContainer.style.display = 'none';
    
    // 執行搜尋
    if (query.includes('.') || query.includes('://')) {
        window.location.href = query.includes('://') ? query : 'https://' + query;
    } else {
        window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
}

// 添加到搜尋歷史
function addToSearchHistory(query) {
    // 移除重複項目
    searchHistory = searchHistory.filter(item => item !== query);
    // 添加到開頭
    searchHistory.unshift(query);
    // 限制歷史記錄數量
    searchHistory = searchHistory.slice(0, 10);
    // 儲存到本地儲存
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

// 搜尋輸入事件監聽
let debounceTimer;
searchInput.addEventListener('input', function(e) {
    const query = this.value.trim();
    
    // 防抖處理
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        showSuggestions(query);
    }, 200);
});

// 搜尋按鍵事件
searchInput.addEventListener('keydown', function(e) {
    const suggestions = suggestionsContainer.querySelectorAll('.suggestion-item');
    const activeSuggestion = suggestionsContainer.querySelector('.suggestion-item.active');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!activeSuggestion) {
            suggestions[0]?.classList.add('active');
        } else {
            const nextIndex = Array.from(suggestions).indexOf(activeSuggestion) + 1;
            if (nextIndex < suggestions.length) {
                activeSuggestion.classList.remove('active');
                suggestions[nextIndex].classList.add('active');
                searchInput.value = suggestions[nextIndex].querySelector('.suggestion-text').textContent;
            }
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (activeSuggestion) {
            const prevIndex = Array.from(suggestions).indexOf(activeSuggestion) - 1;
            if (prevIndex >= 0) {
                activeSuggestion.classList.remove('active');
                suggestions[prevIndex].classList.add('active');
                searchInput.value = suggestions[prevIndex].querySelector('.suggestion-text').textContent;
            }
        }
    } else if (e.key === 'Enter') {
        const query = activeSuggestion ? 
            activeSuggestion.querySelector('.suggestion-text').textContent : 
            this.value.trim();
        if (query) {
            performSearch(query);
        }
    }
});

// 點擊頁面其他地方隱藏建議
document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
        suggestionsContainer.style.display = 'none';
    }
});

// Google應用圖標收合功能
document.addEventListener('DOMContentLoaded', function() {
    const appsToggle = document.querySelector('.google-apps-toggle');
    const appsGrid = document.querySelector('.google-apps-grid');
    
    if (appsToggle && appsGrid) {
        appsToggle.addEventListener('click', function() {
            appsGrid.classList.toggle('collapsed');
        });
    }
});

// 影片控制
const video = document.getElementById('video-background');
const uploadContainer = document.getElementById('video-upload-container');
const settingsMenu = document.getElementById('settings-menu');
const settingsGear = document.getElementById('settings-gear');
let selectedFile = null;
let selectedVideoUrl = '';

// 齒輪點擊事件
settingsGear.addEventListener('click', function() {
    settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
});

// 點擊頁面其他區域關閉選單
document.addEventListener('click', function(event) {
    if (!settingsGear.contains(event.target) && !settingsMenu.contains(event.target)) {
        settingsMenu.style.display = 'none';
    }
});

// 播放/暫停
document.getElementById('play-pause-btn').addEventListener('click', function() {
    if (video.paused) {
        video.play();
        this.innerHTML = '<i class="fas fa-pause"></i><span>暫停影片</span>';
    } else {
        video.pause();
        this.innerHTML = '<i class="fas fa-play"></i><span>播放影片</span>';
    }
    settingsMenu.style.display = 'none';
});

// 靜音/取消靜音
document.getElementById('mute-btn').addEventListener('click', function() {
    video.muted = !video.muted;
    this.innerHTML = video.muted ? 
        '<i class="fas fa-volume-mute"></i><span>取消靜音</span>' : 
        '<i class="fas fa-volume-up"></i><span>靜音影片</span>';
    settingsMenu.style.display = 'none';
});

// 上傳影片介面
document.getElementById('upload-video-btn').addEventListener('click', function() {
    uploadContainer.style.display = 'flex';
    settingsMenu.style.display = 'none';
});

document.getElementById('close-upload').addEventListener('click', function() {
    uploadContainer.style.display = 'none';
});

// 檔案選擇
document.getElementById('video-file').addEventListener('change', function(e) {
    selectedFile = e.target.files[0];
    selectedVideoUrl = '';
    document.getElementById('video-url').value = '';
    
    if (selectedFile && selectedFile.type === 'video/mp4') {
        document.getElementById('confirm-upload').disabled = false;
    } else {
        document.getElementById('confirm-upload').disabled = true;
        alert('請選擇 MP4 格式的影片檔案');
    }
});

// 網址載入
document.getElementById('load-url-btn').addEventListener('click', function() {
    const url = document.getElementById('video-url').value.trim();
    if (url) {
        selectedVideoUrl = url;
        selectedFile = null;
        document.getElementById('video-file').value = '';
        document.getElementById('confirm-upload').disabled = false;
    } else {
        alert('請輸入影片網址');
    }
});

// 確認設定
document.getElementById('confirm-upload').addEventListener('click', function() {
    if (selectedFile) {
        // 上傳本地檔案
        const videoURL = URL.createObjectURL(selectedFile);
        video.src = videoURL;
        video.play();
        
        // 儲存到本地儲存
        localStorage.setItem('customVideo', videoURL);
        localStorage.setItem('videoSource', 'file');
        localStorage.setItem('videoName', selectedFile.name);
        
        updateCurrentVideoInfo(selectedFile.name);
        
    } else if (selectedVideoUrl) {
        // 使用網址影片
        video.src = selectedVideoUrl;
        video.play();
        
        // 儲存到本地儲存
        localStorage.setItem('customVideo', selectedVideoUrl);
        localStorage.setItem('videoSource', 'url');
        localStorage.setItem('videoName', '自訂網址影片');
        
        updateCurrentVideoInfo('自訂網址影片');
    }
    
    uploadContainer.style.display = 'none';
    // 重置表單
    document.getElementById('video-file').value = '';
    document.getElementById('video-url').value = '';
    document.getElementById('confirm-upload').disabled = true;
    selectedFile = null;
    selectedVideoUrl = '';
});

function updateCurrentVideoInfo(name) {
    document.getElementById('current-video-info').style.display = 'block';
    document.getElementById('current-video-name').textContent = name;
}

// 載入儲存的影片
window.addEventListener('DOMContentLoaded', function() {
    const savedVideo = localStorage.getItem('customVideo');
    const videoSource = localStorage.getItem('videoSource');
    const videoName = localStorage.getItem('videoName');
    
    if (savedVideo) {
        video.src = savedVideo;
        updateCurrentVideoInfo(videoName || '自訂影片');
    }
    
    video.play();
    
    // 聚焦搜尋框
    searchInput.focus();
});

// Google應用圖標拖曳功能
let isDragging = false;
let dragOffsetX, dragOffsetY;

document.addEventListener('DOMContentLoaded', function() {
    const appsGrid = document.querySelector('.google-apps-grid');
    const appsHeader = document.querySelector('.google-apps-header');
    
    if (appsGrid && appsHeader) {
        appsHeader.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }
});

function startDrag(e) {
    isDragging = true;
    const appsGrid = document.querySelector('.google-apps-grid');
    const rect = appsGrid.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    appsGrid.style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;
    
    const appsGrid = document.querySelector('.google-apps-grid');
    appsGrid.style.left = (e.clientX - dragOffsetX) + 'px';
    appsGrid.style.top = (e.clientY - dragOffsetY) + 'px';
    appsGrid.style.right = 'auto';
}

function stopDrag() {
    isDragging = false;
    const appsGrid = document.querySelector('.google-apps-grid');
    if (appsGrid) {
        appsGrid.style.cursor = 'move';
    }
}

// 鍵盤快捷鍵
document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+G 切換Google應用圖標顯示
    if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        const appsGrid = document.querySelector('.google-apps-grid');
        if (appsGrid) {
            appsGrid.style.display = appsGrid.style.display === 'none' ? 'block' : 'none';
        }
    }
    
    // ESC 關閉所有彈出視窗
    if (e.key === 'Escape') {
        settingsMenu.style.display = 'none';
        uploadContainer.style.display = 'none';
        suggestionsContainer.style.display = 'none';
    }
});
