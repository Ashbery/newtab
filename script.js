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

searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        if (query) {
            if (query.includes('.') || query.includes('://')) {
                window.location.href = query.includes('://') ? query : 'https://' + query;
            } else {
                window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }
        }
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
    }
});
