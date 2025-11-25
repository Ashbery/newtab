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

// 搜索功能
document.getElementById('search-input').addEventListener('keypress', function (e) {
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

// 視頻控制變數
const video = document.getElementById('video-background');
const videoSelector = document.getElementById('video-selector');
const uploadContainer = document.getElementById('video-upload-container');
const settingsMenu = document.getElementById('settings-menu');
const settingsGear = document.getElementById('settings-gear');
const progressBar = document.getElementById('progress-bar');
const progress = document.getElementById('progress');
const uploadStatus = document.getElementById('upload-status');
const apiSetupContainer = document.getElementById('api-setup-container');
const googleLoginBtn = document.getElementById('google-login-btn');
const googleLoginMenu = document.getElementById('google-login-menu');

let selectedFile = null;
let selectedVideoUrl = '';
let cloudVideoUrl = '';
let googleUser = null;
let googleConfig = null;

// ==================== 簡單的應用程式選單功能 ====================
function setupGoogleApps() {
    console.log('🔄 開始設置應用程式選單...');
    
    const appsBtn = document.getElementById('google-apps-btn');
    const appsMenu = document.getElementById('google-apps-menu');
    
    // 檢查元素是否存在
    if (!appsBtn) {
        console.error('❌ 錯誤: 找不到 #google-apps-btn 元素');
        return;
    }
    
    if (!appsMenu) {
        console.error('❌ 錯誤: 找不到 #google-apps-menu 元素');
        return;
    }
    
    console.log('✅ 找到應用程式按鈕和選單元素');
    
    // 確保選單初始狀態是隱藏的
    appsMenu.style.display = 'none';
    
    // 應用程式按鈕點擊事件
    appsBtn.onclick = function(e) {
        e.stopPropagation();
        console.log('🎯 應用程式按鈕被點擊！');
        
        if (appsMenu.style.display === 'block') {
            appsMenu.style.display = 'none';
            console.log('⬆️ 隱藏選單');
        } else {
            appsMenu.style.display = 'block';
            console.log('⬇️ 顯示選單');
        }
    };
    
    // 點擊頁面其他區域關閉選單
    document.addEventListener('click', function() {
        appsMenu.style.display = 'none';
    });
    
    // 防止選單內部點擊時關閉
    appsMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    console.log('✅ 應用程式選單設置完成');
}

// ==================== 極速影片載入系統 ====================
class UltraFastVideoSystem {
    constructor() {
        this.video = video;
        this.init();
    }

    init() {
        this.optimizeVideoElement();
        this.startUltraFastLoad();
    }

    optimizeVideoElement() {
        if (this.video) {
            this.video.preload = 'auto';
            this.video.muted = true;
            this.video.playsInline = true;
        }
    }

    async startUltraFastLoad() {
        console.log('🚀 啟動極速影片載入...');

        const videoUrl = localStorage.getItem('videoUrl');
        if (videoUrl) {
            console.log('✅ 從 localStorage 載入網址影片');
            this.video.src = videoUrl;
            await this.playVideo();
            updateCurrentVideoInfo('自訂網址影片');
            return;
        }

        if (window.extensionHelper) {
            try {
                const result = await window.extensionHelper.loadVideoInstant();
                if (result.success) {
                    if (result.type === 'url') {
                        this.video.src = result.url;
                    } else if (result.type === 'base64') {
                        this.video.src = result.data;
                    }
                    await this.playVideo();
                    updateCurrentVideoInfo(result.name || '自訂影片');
                    console.log('✅ 擴充功能載入成功');
                    return;
                }
            } catch (error) {
                console.log('❌ 擴充功能載入失敗:', error);
            }
        }

        console.log('📹 使用預設影片');
        updateCurrentVideoInfo('預設影片');
        await this.playVideo();
    }

    async playVideo() {
        try {
            await this.video.play();
        } catch (error) {
            console.log('⏸️ 自動播放被阻止');
        }
    }
}

// ==================== 頁面初始化 ====================
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 頁面開始載入...');
    
    // 先初始化應用程式選單（最重要）
    setupGoogleApps();
    
    // 然後初始化其他功能
    googleConfig = new GoogleAPIConfig();
    new UltraFastVideoSystem();
    
    console.log('✅ 所有功能初始化完成');
    
    // 聚焦搜索框
    setTimeout(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.focus();
    }, 500);
});

// ==================== 其他功能（保持不變） ====================

// Google API 設定管理（簡化版本）
class GoogleAPIConfig {
    constructor() {
        this.clientId = localStorage.getItem('google_client_id');
        // ... 其他程式碼保持不變
    }
    // ... 其他方法保持不變
}

// 工具函數
function showUploadStatus(message, type = 'info') {
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status';
    uploadStatus.classList.add(type);
    uploadStatus.style.display = 'block';
    setTimeout(() => { uploadStatus.style.display = 'none'; }, 3000);
}

function updateCurrentVideoInfo(name) {
    const infoElement = document.getElementById('current-video-info');
    const nameElement = document.getElementById('current-video-name');
    if (infoElement && nameElement) {
        infoElement.style.display = 'block';
        nameElement.textContent = name;
    }
}

// 設定齒輪功能
settingsGear.addEventListener('click', function(e) {
    e.stopPropagation();
    settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
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

// 影片選擇按鈕
document.getElementById('video-select-btn').addEventListener('click', function() {
    videoSelector.style.display = 'flex';
    settingsMenu.style.display = 'none';
});

// 上傳影片按鈕
document.getElementById('upload-video-btn').addEventListener('click', function() {
    uploadContainer.style.display = 'flex';
    settingsMenu.style.display = 'none';
});

// 關閉按鈕
document.getElementById('close-upload').addEventListener('click', function() {
    uploadContainer.style.display = 'none';
});

document.getElementById('close-selector').addEventListener('click', function() {
    videoSelector.style.display = 'none';
});

// 影片錯誤處理
video.addEventListener('error', function() {
    console.error('❌ 影片載入失敗，使用預設影片');
    video.src = 'https://assets.mixkit.co/videos/preview/mixkit-white-clouds-passing-by-1152-large.mp4';
    video.play();
    updateCurrentVideoInfo('預設影片');
});

// 清理 blob URL
window.addEventListener('beforeunload', function() {
    if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
    }
});
