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
let suggestionsContainer = null;
let isSuggestionsVisible = false;

// 創建建議容器
function createSuggestionsContainer() {
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'search-suggestions';
        searchInput.parentNode.appendChild(suggestionsContainer);
        
        // 點擊建議項目的處理
        suggestionsContainer.addEventListener('click', function(e) {
            if (e.target.classList.contains('suggestion-item')) {
                searchInput.value = e.target.textContent;
                hideSuggestions();
            }
        });
    }
}

// 顯示搜尋建議 - 改進版本
function showSuggestions(query) {
    if (!suggestionsContainer) {
        createSuggestionsContainer();
    }
    
    if (!query) {
        hideSuggestions();
        return;
    }
    
    // 模擬搜尋建議（實際應用中應該從API獲取）
    const suggestions = getSearchSuggestions(query);
    
    if (suggestions.length > 0) {
        suggestionsContainer.innerHTML = '';
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = suggestion;
            suggestionsContainer.appendChild(item);
        });
        
        // 使用平滑顯示效果，避免閃爍
        if (!isSuggestionsVisible) {
            suggestionsContainer.style.display = 'block';
            // 使用requestAnimationFrame確保DOM更新後再添加動畫類
            requestAnimationFrame(() => {
                suggestionsContainer.classList.add('visible');
                isSuggestionsVisible = true;
            });
        }
    } else {
        hideSuggestions();
    }
}

// 隱藏建議列表 - 改進版本
function hideSuggestions() {
    if (suggestionsContainer && isSuggestionsVisible) {
        suggestionsContainer.classList.remove('visible');
        // 等待動畫完成後再隱藏
        setTimeout(() => {
            suggestionsContainer.style.display = 'none';
            isSuggestionsVisible = false;
        }, 200);
    }
}

// 模擬獲取搜尋建議
function getSearchSuggestions(query) {
    // 這裡可以替換為實際的搜尋建議API
    const sampleSuggestions = [
        `${query} 教學`,
        `${query} 下載`,
        `${query} 是什麼`,
        `${query} 價格`,
        `${query} 台灣`,
        `${query} 2024`,
        `${query} 使用方法`,
        `${query} 推薦`
    ];
    
    return sampleSuggestions.slice(0, 5); // 只顯示前5個建議
}

// 改進的輸入事件處理 - 修復閃爍問題
let inputTimeout;
searchInput.addEventListener('input', function(e) {
    const query = this.value.trim();
    
    // 清除之前的定時器
    clearTimeout(inputTimeout);
    
    // 立即顯示建議列表，避免延遲
    if (query && !isSuggestionsVisible) {
        showSuggestions(query);
    }
    
    // 設定新的定時器，避免過於頻繁的更新
    inputTimeout = setTimeout(() => {
        showSuggestions(query);
    }, 50); // 減少延遲時間
});

// 焦點事件
searchInput.addEventListener('focus', function() {
    const query = this.value.trim();
    if (query) {
        showSuggestions(query);
    }
});

// 點擊頁面其他地方時隱藏建議
document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && suggestionsContainer && !suggestionsContainer.contains(e.target)) {
        hideSuggestions();
    }
});

// 鍵盤導航
searchInput.addEventListener('keydown', function(e) {
    if (!suggestionsContainer || !isSuggestionsVisible) {
        return;
    }
    
    const items = suggestionsContainer.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;
    
    let currentIndex = -1;
    items.forEach((item, index) => {
        if (item.classList.contains('selected')) {
            currentIndex = index;
            item.classList.remove('selected');
        }
    });
    
    switch(e.key) {
        case 'ArrowDown':
            e.preventDefault();
            currentIndex = (currentIndex + 1) % items.length;
            items[currentIndex].classList.add('selected');
            break;
        case 'ArrowUp':
            e.preventDefault();
            currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
            items[currentIndex].classList.add('selected');
            break;
        case 'Enter':
            if (currentIndex >= 0) {
                e.preventDefault();
                searchInput.value = items[currentIndex].textContent;
                hideSuggestions();
            }
            break;
        case 'Escape':
            hideSuggestions();
            break;
    }
});

// 修改現有的搜尋功能
function performSearch(query) {
    if (query) {
        if (query.includes('.') || query.includes('://')) {
            window.location.href = query.includes('://') ? query : 'https://' + query;
        } else {
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    }
}

searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        hideSuggestions();
        performSearch(query);
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
        if (suggestionsContainer) {
            hideSuggestions();
        }
    }
});
