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

// 影片控制
const video = document.getElementById('video-background');
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

// Google API 設定管理
class GoogleAPIConfig {
    constructor() {
        this.clientId = localStorage.getItem('google_client_id');
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        
        // 載入保存的登入狀態
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

    // 檢查是否已設定
    isConfigured() {
        return !!this.clientId;
    }

    // 儲存用戶端 ID
    saveClientId(clientId) {
        if (clientId && clientId.includes('.apps.googleusercontent.com')) {
            this.clientId = clientId;
            localStorage.setItem('google_client_id', clientId);
            this.initGoogleAPI();
            return true;
        }
        return false;
    }

    // 取得用戶端 ID
    getClientId() {
        return this.clientId;
    }

    // 初始化 Google API
    async initGoogleAPI() {
        if (!this.clientId) return;

        // 載入 GAPI
        await new Promise((resolve) => {
            gapi.load('client:picker', () => {
                this.gapiInited = true;
                console.log('GAPI 載入完成');
                this.initTokenClient();
                resolve();
            });
        });
    }

    // 初始化 Token Client
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

    // 處理登入成功
    handleAuthSuccess(accessToken) {
        const authData = {
            accessToken: accessToken,
            timestamp: Date.now()
        };
        googleUser = authData;
        
        // 保存登入狀態
        localStorage.setItem('google_auth', JSON.stringify(authData));
        
        this.updateUI();
        this.initializePicker();
        showUploadStatus('Google 帳號登入成功！', 'success');
    }

    // 檢查 token 是否過期 (1小時)
    isTokenExpired() {
        if (!googleUser || !googleUser.timestamp) return true;
        const oneHour = 60 * 60 * 1000;
        return (Date.now() - googleUser.timestamp) > oneHour;
    }

    // 更新 UI 狀態
    updateUI() {
        const isConfigured = this.isConfigured();
        const isAuthenticated = !!googleUser && !this.isTokenExpired();

        // 如果 token 過期，清除登入狀態
        if (googleUser && this.isTokenExpired()) {
            console.log('Token 已過期，自動登出');
            this.logout();
            return;
        }

        // 更新右上角按鈕
        if (isAuthenticated) {
            googleLoginBtn.classList.add('authenticated');
            googleLoginBtn.innerHTML = '<img src="favicon.ico" class="google-icon" alt="Google"><span>已連線</span>';
        } else {
            googleLoginBtn.classList.remove('authenticated');
            googleLoginBtn.innerHTML = '<img src="favicon.ico" class="google-icon" alt="Google"><span>Google</span>';
        }

        // 更新選單項目
        document.getElementById('google-drive-picker-btn').style.display = isAuthenticated ? 'flex' : 'none';
        document.getElementById('google-logout-btn').style.display = isAuthenticated ? 'flex' : 'none';

        // 更新上傳視窗中的狀態
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

    // 初始化 Picker
    async initializePicker() {
        if (!this.gapiInited) return;
        
        try {
            await gapi.client.init({});
            console.log('Google Picker 初始化完成');
        } catch (error) {
            console.error('Picker 初始化失敗:', error);
        }
    }

    // 開啟 Google Drive 選擇器
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
                        
                        // 使用 Google Drive API URL
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

    // 請求授權
    requestAuth() {
        if (this.tokenClient) {
            this.tokenClient.requestAccessToken();
        } else {
            showUploadStatus('Google API 尚未準備好', 'error');
        }
    }

    // 登出
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

        if (cloudVideoUrl) {
            // 使用雲端影片 - 使用 fetch 載入
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
            
            console.log('✅ 影片載入成功，大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
            
            // 保存到擴充功能
            if (window.extensionHelper) {
                try {
                    await window.extensionHelper.saveCloudVideo(cloudVideoUrl, 'Google Drive 影片');
                    console.log('雲端影片資訊已保存到擴充功能');
                } catch (error) {
                    console.log('擴充功能保存失敗:', error);
                }
            }
            
            // 保存到本地儲存
            saveCloudVideoInfo(cloudVideoUrl, 'Google Drive 影片', 'google_drive');
            
        } else if (selectedFile) {
            // 使用本地檔案 (建立 blob URL)
            const blob = new Blob([selectedFile], { type: selectedFile.type });
            videoUrl = URL.createObjectURL(blob);
            videoName = selectedFile.name;
            
            // 保存到擴充功能
            if (window.extensionHelper) {
                try {
                    await window.extensionHelper.saveVideo(selectedFile);
                } catch (error) {
                    console.log('擴充功能保存失敗:', error);
                }
            }
            
        } else if (selectedVideoUrl) {
            // 使用網址影片
            videoUrl = selectedVideoUrl;
            videoName = '自訂網址影片';
            localStorage.setItem('videoUrl', selectedVideoUrl);
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

// 保存雲端影片資訊
function saveCloudVideoInfo(url, name, type) {
    const videoInfo = {
        url: url,
        name: name,
        type: type,
        timestamp: Date.now(),
        source: 'cloud'
    };
    localStorage.setItem('cloudVideoInfo', JSON.stringify(videoInfo));
}

// 載入雲端影片資訊
function loadCloudVideoInfo() {
    const saved = localStorage.getItem('cloudVideoInfo');
    return saved ? JSON.parse(saved) : null;
}

function updateCurrentVideoInfo(name) {
    document.getElementById('current-video-info').style.display = 'block';
    document.getElementById('current-video-name').textContent = name;
}

// 載入非 Google Drive 影片
function loadNonGoogleDriveVideos() {
    console.log('🔍 載入非 Google Drive 影片...');
    
    // 1. 優先從擴充功能載入本地影片
    if (window.extensionHelper) {
        try {
            const savedData = window.extensionHelper.loadVideo();
            console.log('從擴充功能載入資料:', savedData);
            
            // 載入本地影片（非雲端）
            if (savedData.customVideo && !savedData.cloudVideo) {
                console.log('📹 從擴充功能載入本地影片');
                let videoData = savedData.customVideo;
                if (!videoData.startsWith('data:')) {
                    videoData = `data:video/mp4;base64,${videoData}`;
                }
                video.src = videoData;
                updateCurrentVideoInfo(savedData.videoName || '自訂影片');
                video.play().catch(e => console.log('本地影片自動播放被阻止'));
                return true;
            }
        } catch (error) {
            console.log('擴充功能載入失敗:', error);
        }
    }
    
    // 2. 嘗試載入網址影片
    const videoUrl = localStorage.getItem('videoUrl');
    if (videoUrl && !videoUrl.includes('drive.google.com') && !videoUrl.includes('googleapis.com')) {
        console.log('📹 載入網址影片:', videoUrl);
        video.src = videoUrl;
        updateCurrentVideoInfo('自訂網址影片');
        video.play().catch(e => console.log('網址影片自動播放被阻止'));
        return true;
    }
    
    // 3. 嘗試載入保存的選擇（非Google Drive）
    const savedVideo = localStorage.getItem('selectedVideo');
    if (savedVideo && !savedVideo.includes('drive.google.com') && !savedVideo.includes('googleapis.com')) {
        console.log('📹 載入保存的非Google Drive影片:', savedVideo);
        video.src = savedVideo;
        video.play().catch(e => console.log('保存影片自動播放被阻止'));
        return true;
    }
    
    return false;
}

// 載入 Google Drive 影片
function loadGoogleDriveVideo() {
    // 1. 從擴充功能載入雲端影片
    if (window.extensionHelper) {
        try {
            const savedData = window.extensionHelper.loadVideo();
            if (savedData.cloudVideo && googleUser && googleUser.accessToken) {
                console.log('🚀 從擴充功能載入 Google Drive 影片...');
                return loadGoogleDriveVideoFromUrl(
                    savedData.cloudVideo.url, 
                    savedData.cloudVideo.name || '雲端影片'
                );
            }
        } catch (error) {
            console.log('擴充功能雲端影片載入失敗:', error);
        }
    }
    
    // 2. 從本地儲存載入雲端影片
    const cloudVideo = loadCloudVideoInfo();
    if (cloudVideo && cloudVideo.url && cloudVideo.type === 'google_drive' && 
        googleUser && googleUser.accessToken) {
        console.log('🚀 從本地儲存載入 Google Drive 影片...');
        return loadGoogleDriveVideoFromUrl(cloudVideo.url, cloudVideo.name || '雲端影片');
    }
    
    return false;
}

// 從 URL 載入 Google Drive 影片
async function loadGoogleDriveVideoFromUrl(videoUrl, videoName) {
    try {
        console.log('開始載入 Google Drive 影片:', videoUrl);
        
        const response = await fetch(videoUrl, {
            headers: {
                'Authorization': `Bearer ${googleUser.accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        updateCurrentVideoInfo(videoName);
        
        console.log('✅ Google Drive 影片載入成功，大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        return true;
        
    } catch (error) {
        console.error('❌ Google Drive 影片載入失敗:', error);
        return false;
    }
}

// 回退影片載入
function loadFallbackVideo() {
    console.log('🔄 執行回退影片載入...');
    
    // 使用預設影片
    console.log('📹 使用預設影片');
    updateCurrentVideoInfo('預設影片');
    video.play().catch(e => console.log('預設影片自動播放被阻止'));
}

// 影片錯誤處理
video.addEventListener('error', function() {
    console.error('❌ 當前影片載入失敗，嘗試回退到其他來源');
    loadFallbackVideo();
});

// 頁面載入 - 完整分層載入策略
window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 頁面開始載入，啟動分層影片載入策略...');
    
    // 初始化 Google API 設定管理器
    googleConfig = new GoogleAPIConfig();
    
    // 步驟1: 立即載入非 Google Drive 影片
    const nonGoogleVideoLoaded = loadNonGoogleDriveVideos();
    
    if (nonGoogleVideoLoaded) {
        console.log('✅ 非 Google Drive 影片載入成功');
    } else {
        console.log('ℹ️ 無非 Google Drive 影片，等待 Google Drive 影片');
    }
    
    // 步驟2: 初始化 Google API 並載入 Google Drive 影片
    const waitForGoogleInit = setInterval(() => {
        if (googleConfig && googleConfig.gisInited) {
            clearInterval(waitForGoogleInit);
            console.log('🔄 Google API 就緒，嘗試載入 Google Drive 影片');
            
            const driveVideoLoaded = loadGoogleDriveVideo();
            
            if (!driveVideoLoaded && !nonGoogleVideoLoaded) {
                console.log('⚠️ 無可用影片，載入回退影片');
                loadFallbackVideo();
            }
        } else if (googleConfig && !googleConfig.clientId) {
            clearInterval(waitForGoogleInit);
            console.log('⚠️ 未設定 Google API，使用現有影片');
            if (!nonGoogleVideoLoaded) {
                loadFallbackVideo();
            }
        }
    }, 100);
    
    // 超時保護
    setTimeout(() => {
        clearInterval(waitForGoogleInit);
        if (googleConfig && !googleConfig.gisInited) {
            console.log('⏰ Google API 初始化超時，使用現有影片');
            if (!nonGoogleVideoLoaded) {
                loadFallbackVideo();
            }
        }
    }, 5000);
    
    searchInput.focus();
});

// 清理 blob URL
window.addEventListener('beforeunload', function() {
    if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
    }
});
