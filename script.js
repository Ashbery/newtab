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

// 視頻控制
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

// ==================== 極速影片載入系統 ====================
class UltraFastVideoSystem {
    constructor() {
        this.video = video;
        this.performance = new PerformanceTracker();
        this.init();
    }

    init() {
        this.optimizeVideoElement();
        this.startInstantLoad();
    }

    optimizeVideoElement() {
        if (this.video) {
            this.video.preload = 'auto';
            this.video.muted = true;
            this.video.playsInline = true;
            this.video.setAttribute('webkit-playsinline', 'true');
            this.video.setAttribute('playsinline', 'true');
        }
    }

    async startInstantLoad() {
        const startTime = performance.now();
        console.log('🚀 啟動極速影片載入...');

        // 並行嘗試所有載入方式
        const loadPromises = [
            this.tryLocalStorageUrl(),
            this.tryExtensionCache(),
            this.loadDefaultVideo()
        ];

        try {
            const result = await Promise.race(loadPromises.map(p => 
                p.then(value => ({ success: true, value }))
                   .catch(error => ({ success: false, error }))
            ));

            const loadTime = performance.now() - startTime;

            if (result.success) {
                console.log(`✅ 極速載入成功: ${loadTime.toFixed(2)}ms - ${result.value}`);
                this.performance.recordEvent('load_success', { 
                    source: result.value, 
                    loadTime: loadTime 
                });
            } else {
                console.log(`⚠️ 載入完成: ${loadTime.toFixed(2)}ms`);
                this.performance.recordEvent('load_complete', { loadTime });
            }
        } catch (error) {
            console.error('❌ 載入錯誤:', error);
        }
    }

    async tryLocalStorageUrl() {
        const videoUrl = localStorage.getItem('videoUrl');
        if (videoUrl) {
            this.video.src = videoUrl;
            await this.playVideo();
            updateCurrentVideoInfo('自訂網址影片');
            return 'localStorage';
        }
        throw new Error('No localStorage video');
    }

    async tryExtensionCache() {
        if (!window.extensionHelper) {
            throw new Error('No extension helper');
        }

        const result = await window.extensionHelper.loadVideoInstant();
        if (result.success) {
            if (result.type === 'url') {
                this.video.src = result.url;
            } else if (result.type === 'base64') {
                this.video.src = result.data;
            } else if (result.type === 'cloud') {
                console.log('☁️ 雲端影片需進一步處理');
                // 保持原有雲端影片處理邏輯
            }
            
            updateCurrentVideoInfo(result.name || '自訂影片');
            await this.playVideo();
            return `extension_${result.source}`;
        }
        throw new Error('Extension load failed');
    }

    async loadDefaultVideo() {
        await new Promise(resolve => setTimeout(resolve, 100));
        updateCurrentVideoInfo('預設影片');
        await this.playVideo();
        return 'default';
    }

    async playVideo() {
        try {
            await this.video.play();
        } catch (error) {
            console.log('⏸️ 自動播放被阻止，但影片已載入');
        }
    }
}

class PerformanceTracker {
    constructor() {
        this.events = [];
    }

    recordEvent(name, data = {}) {
        const event = {
            name,
            timestamp: performance.now(),
            data
        };
        this.events.push(event);
    }
}

// ==================== 原有功能保持不變 ====================

// Google API 設定管理
class GoogleAPIConfig {
    constructor() {
        this.clientId = localStorage.getItem('google_client_id');
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        
        const savedAuth = localStorage.getItem('google_auth');
        if (savedAuth) {
            try {
                googleUser = JSON.parse(savedAuth);
                console.log('載入已保存的登入狀態');
            } catch (e) {
                console.error('載入登入狀態失敗:', e);
                localStorage.removeItem('google_auth');
            }
        }
        
        if (this.clientId) {
            this.initGoogleAPI();
        }
    }

    isConfigured() {
        return !!this.clientId;
    }

    saveClientId(clientId) {
        if (clientId && clientId.includes('.apps.googleusercontent.com')) {
            this.clientId = clientId;
            localStorage.setItem('google_client_id', clientId);
            this.initGoogleAPI();
            return true;
        }
        return false;
    }

    getClientId() {
        return this.clientId;
    }

    async initGoogleAPI() {
        if (!this.clientId) return;

        await new Promise((resolve) => {
            gapi.load('client:picker', () => {
                this.gapiInited = true;
                console.log('GAPI 載入完成');
                this.initTokenClient();
                resolve();
            });
        });
    }

    initTokenClient() {
        if (!this.clientId) return;

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            callback: (response) => {
                if (response.error !== undefined) {
                    showUploadStatus('Google 授權失敗: ' + response.error, 'error');
                    return;
                }
                this.handleAuthSuccess(response.access_token);
            },
        });

        this.gisInited = true;
        this.updateUI();
    }

    handleAuthSuccess(accessToken) {
        const authData = {
            accessToken: accessToken,
            timestamp: Date.now()
        };
        googleUser = authData;
        
        localStorage.setItem('google_auth', JSON.stringify(authData));
        
        this.updateUI();
        this.initializePicker();
        showUploadStatus('Google 帳號登入成功！', 'success');
    }

    isTokenExpired() {
        if (!googleUser || !googleUser.timestamp) return true;
        const oneHour = 60 * 60 * 1000;
        return (Date.now() - googleUser.timestamp) > oneHour;
    }

    updateUI() {
        const isConfigured = this.isConfigured();
        const isAuthenticated = !!googleUser && !this.isTokenExpired();

        if (googleUser && this.isTokenExpired()) {
            console.log('Token 已過期，自動登出');
            this.logout();
            return;
        }

        if (isAuthenticated) {
            googleLoginBtn.classList.add('authenticated');
            googleLoginBtn.innerHTML = '<img src="favicon.ico" class="google-icon" alt="Google"><span>已連線</span>';
        } else {
            googleLoginBtn.classList.remove('authenticated');
            googleLoginBtn.innerHTML = '<img src="favicon.ico" class="google-icon" alt="Google"><span>Google</span>';
        }

        document.getElementById('google-drive-picker-btn').style.display = isAuthenticated ? 'flex' : 'none';
        document.getElementById('google-logout-btn').style.display = isAuthenticated ? 'flex' : 'none';

        const driveBtn = document.getElementById('google-drive-btn');
        const statusText = document.getElementById('google-drive-status');
        
        if (isAuthenticated) {
            driveBtn.disabled = false;
            statusText.textContent = '✓ Google Drive 已連線';
            statusText.className = 'google-status connected';
        } else if (isConfigured) {
            driveBtn.disabled = true;
            statusText.textContent = '請點擊右上角 Google 按鈕登入';
            statusText.className = 'google-status';
        } else {
            driveBtn.disabled = true;
            statusText.textContent = '請先設定 Google API';
            statusText.className = 'google-status';
        }
    }

    async initializePicker() {
        if (!this.gapiInited) return;
        
        try {
            await gapi.client.init({});
            console.log('Google Picker 初始化完成');
        } catch (error) {
            console.error('Picker 初始化失敗:', error);
        }
    }

    async openGoogleDrivePicker() {
        if (!googleUser || !googleUser.accessToken) {
            throw new Error('請先登入 Google 帳號');
        }

        if (!this.gapiInited) {
            throw new Error('Google API 尚未初始化完成');
        }

        return new Promise((resolve, reject) => {
            const view = new google.picker.View(google.picker.ViewId.DOCS);
            view.setMimeTypes('video/mp4');
            
            const picker = new google.picker.PickerBuilder()
                .setAppId(this.clientId)
                .setOAuthToken(googleUser.accessToken)
                .addView(view)
                .setCallback((data) => {
                    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                        const doc = data[google.picker.Response.DOCUMENTS][0];
                        const fileId = doc[google.picker.Document.ID];
                        
                        console.log('選擇的檔案:', doc);
                        
                        const videoUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                        
                        console.log('生成的影片 URL:', videoUrl);
                        
                        resolve({
                            url: videoUrl,
                            name: doc.name,
                            id: fileId,
                            accessToken: googleUser.accessToken
                        });
                    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                        reject(new Error('用戶取消選擇'));
                    }
                })
                .build();
            
            picker.setVisible(true);
        });
    }

    requestAuth() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken();
        } else {
            showUploadStatus('Google API 尚未準備好', 'error');
        }
    }

    logout() {
        if (googleUser && googleUser.accessToken) {
            google.accounts.oauth2.revoke(googleUser.accessToken, () => {
                console.log('Access token 已撤銷');
            });
        }
        
        googleUser = null;
        localStorage.removeItem('google_auth');
        this.updateUI();
        showUploadStatus('已登出 Google 帳號', 'info');
    }
}

// 顯示上傳狀態
function showUploadStatus(message, type = 'info') {
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status';
    uploadStatus.classList.add(type);
    uploadStatus.style.display = 'block';
    
    setTimeout(() => {
        uploadStatus.style.display = 'none';
    }, 3000);
}

// 更新進度條
function updateProgress(percent) {
    progressBar.style.display = 'block';
    progress.style.width = percent + '%';
}

// 隱藏進度條
function hideProgress() {
    progressBar.style.display = 'none';
    progress.style.width = '0%';
}

function updateCurrentVideoInfo(name) {
    document.getElementById('current-video-info').style.display = 'block';
    document.getElementById('current-video-name').textContent = name;
}

// Google 登入按鈕點擊
googleLoginBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (googleConfig && googleConfig.isConfigured()) {
        if (googleUser && !googleConfig.isTokenExpired()) {
            googleLoginMenu.style.display = googleLoginMenu.style.display === 'block' ? 'none' : 'block';
        } else {
            googleConfig.requestAuth();
        }
    } else {
        showAPISetupPrompt();
    }
});

// 點擊頁面其他區域關閉選單
document.addEventListener('click', function(e) {
    if (!googleLoginBtn.contains(e.target) && !googleLoginMenu.contains(e.target)) {
        googleLoginMenu.style.display = 'none';
    }
    if (!settingsGear.contains(e.target) && !settingsMenu.contains(e.target)) {
        settingsMenu.style.display = 'none';
    }
});

// Google API 設定按鈕
document.getElementById('setup-google-api-btn').addEventListener('click', function() {
    showAPISetupPrompt();
    googleLoginMenu.style.display = 'none';
});

// Google Drive 選擇器按鈕
document.getElementById('google-drive-picker-btn').addEventListener('click', async function() {
    await openGoogleDrivePicker();
    googleLoginMenu.style.display = 'none';
});

// Google 登出按鈕
document.getElementById('google-logout-btn').addEventListener('click', function() {
    googleConfig.logout();
    googleLoginMenu.style.display = 'none';
});

// 顯示 API 設定提示
function showAPISetupPrompt() {
    apiSetupContainer.style.display = 'flex';
    if (googleConfig) {
        const savedClientId = googleConfig.getClientId();
        if (savedClientId) {
            document.getElementById('google-client-id').value = savedClientId;
        }
    }
}

// 關閉 API 設定
document.getElementById('close-api-setup').addEventListener('click', function() {
    apiSetupContainer.style.display = 'none';
});

document.getElementById('cancel-api-config').addEventListener('click', function() {
    apiSetupContainer.style.display = 'none';
});

// 儲存 API 設定
document.getElementById('save-api-config').addEventListener('click', function() {
    const clientId = document.getElementById('google-client-id').value.trim();
    if (googleConfig.saveClientId(clientId)) {
        showUploadStatus('Google API 設定成功！', 'success');
        apiSetupContainer.style.display = 'none';
    } else {
        showUploadStatus('請輸入有效的 Google OAuth 用戶端 ID', 'error');
    }
});

// Google Drive 選擇器 - 外部函數
async function openGoogleDrivePicker() {
    const btn = document.getElementById('google-drive-btn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 載入中...';

    try {
        const driveFile = await googleConfig.openGoogleDrivePicker();
        cloudVideoUrl = driveFile.url;
        selectedFile = null;
        selectedVideoUrl = '';
        
        document.getElementById('confirm-upload').disabled = false;
        document.getElementById('file-info').textContent = `已選擇: ${driveFile.name}`;
        showUploadStatus('Google Drive 影片選擇成功！', 'success');
    } catch (error) {
        console.error('Google Drive 選擇失敗:', error);
        showUploadStatus(`Google Drive 選擇失敗: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fab fa-google-drive"></i> Google Drive';
    }
}

// 齒輪點擊事件
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

// 上傳影片介面
document.getElementById('upload-video-btn').addEventListener('click', function() {
    uploadContainer.style.display = 'flex';
    settingsMenu.style.display = 'none';
    resetUploadForm();
});

document.getElementById('close-upload').addEventListener('click', function() {
    uploadContainer.style.display = 'none';
    resetUploadForm();
});

// Google Drive 按鈕 (上傳視窗內)
document.getElementById('google-drive-btn').addEventListener('click', openGoogleDrivePicker);

// 檔案選擇
document.getElementById('video-file').addEventListener('change', function(e) {
    selectedFile = e.target.files[0];
    cloudVideoUrl = '';
    selectedVideoUrl = '';
    document.getElementById('video-url').value = '';
    
    if (selectedFile) {
        if (selectedFile.type !== 'video/mp4') {
            showUploadStatus('請選擇 MP4 格式的影片檔案', 'error');
            resetUploadForm();
            return;
        }
        
        if (selectedFile.size > 50 * 1024 * 1024) {
            showUploadStatus('檔案太大！請選擇小於 50MB 的影片', 'error');
            resetUploadForm();
            return;
        }
        
        document.getElementById('confirm-upload').disabled = false;
        document.getElementById('file-info').textContent = 
            `已選擇: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`;
    } else {
        document.getElementById('confirm-upload').disabled = true;
    }
});

// 網址載入
document.getElementById('load-url-btn').addEventListener('click', function() {
    const url = document.getElementById('video-url').value.trim();
    if (url) {
        selectedVideoUrl = url;
        cloudVideoUrl = '';
        selectedFile = null;
        document.getElementById('video-file').value = '';
        document.getElementById('confirm-upload').disabled = false;
        document.getElementById('file-info').textContent = '已輸入網址影片';
        showUploadStatus('網址影片設定成功！', 'success');
    } else {
        showUploadStatus('請輸入影片網址', 'error');
    }
});

// 重置上傳表單
function resetUploadForm() {
    selectedFile = null;
    selectedVideoUrl = '';
    cloudVideoUrl = '';
    document.getElementById('video-file').value = '';
    document.getElementById('video-url').value = '';
    document.getElementById('confirm-upload').disabled = true;
    hideProgress();
    document.getElementById('file-info').textContent = '支援 MP4 格式，最大 50MB';
    
    const confirmBtn = document.getElementById('confirm-upload');
    confirmBtn.innerHTML = '確認設定';
    confirmBtn.disabled = true;
}

// 確認設定
document.getElementById('confirm-upload').addEventListener('click', async function() {
    const confirmBtn = this;
    confirmBtn.disabled = true;
    const originalText = confirmBtn.innerHTML;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 設定中...';

    try {
        let videoUrl;
        let videoName;

        if (selectedVideoUrl) {
            // 網址影片
            videoUrl = selectedVideoUrl;
            videoName = '自訂網址影片';
            localStorage.setItem('videoUrl', selectedVideoUrl);
            console.log('✅ 使用網址影片');
            
        } else if (selectedFile) {
            // 本地檔案 - 建立 Blob URL
            videoUrl = URL.createObjectURL(selectedFile);
            videoName = selectedFile.name;
            console.log('✅ 使用 Blob URL');
            
            // 非同步保存到擴充功能
            if (window.extensionHelper) {
                setTimeout(() => {
                    window.extensionHelper.saveVideo(selectedFile)
                        .then(result => {
                            console.log('✅ 背景保存成功');
                        })
                        .catch(error => {
                            console.log('⚠️ 背景保存失敗:', error.message);
                        });
                }, 1000);
            }
            
        } else if (cloudVideoUrl) {
            // 雲端影片處理
            console.log('開始載入 Google Drive 影片...');
            
            const response = await fetch(cloudVideoUrl, {
                headers: {
                    'Authorization': `Bearer ${googleUser.accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            videoUrl = URL.createObjectURL(blob);
            videoName = 'Google Drive 影片';
            
            console.log('✅ 雲端影片載入成功');
            
            if (window.extensionHelper) {
                try {
                    await window.extensionHelper.saveCloudVideo(cloudVideoUrl, 'Google Drive 影片');
                } catch (error) {
                    console.log('擴充功能保存失敗:', error);
                }
            }
        }

        if (videoUrl) {
            video.src = videoUrl;
            video.play();
            updateCurrentVideoInfo(videoName);
            
            showUploadStatus('影片設定成功！', 'success');
            
            setTimeout(() => {
                uploadContainer.style.display = 'none';
                resetUploadForm();
            }, 1500);
        } else {
            throw new Error('沒有選擇有效的影片來源');
        }
        
    } catch (error) {
        console.error('設定失敗:', error);
        showUploadStatus(`設定失敗: ${error.message}`, 'error');
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
    }
});

// 影片錯誤處理
video.addEventListener('error', function() {
    console.error('❌ 影片載入失敗，使用預設影片');
    video.src = 'https://assets.mixkit.co/videos/preview/mixkit-white-clouds-passing-by-1152-large.mp4';
    video.play();
    updateCurrentVideoInfo('預設影片');
});

// 視頻選擇器功能
document.getElementById('video-select-btn').addEventListener('click', function () {
    videoSelector.style.display = 'flex';
});

document.getElementById('close-selector').addEventListener('click', function () {
    videoSelector.style.display = 'none';
});

// 選擇視頻
document.querySelectorAll('.video-option').forEach(option => {
    option.addEventListener('click', function () {
        const videoUrl = this.getAttribute('data-video');
        video.src = videoUrl;
        video.play();
        videoSelector.style.display = 'none';

        localStorage.setItem('selectedVideo', videoUrl);
    });
});

// 頁面載入 - 使用極速載入系統
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 頁面開始載入...');
    
    // 初始化 Google API 設定管理器
    googleConfig = new GoogleAPIConfig();

    // 啟動極速影片系統
    new UltraFastVideoSystem();
    
    document.getElementById('search-input').focus();
});

// 清理 blob URL
window.addEventListener('beforeunload', function() {
    if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
    }
});
