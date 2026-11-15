// 修正版 inject.js - 處理擴充功能失效
(function () {
    'use strict';

    console.log('頁面功能修改腳本已注入');

    let videoElement = null;
    let currentSelectedFile = null;
    let isExtensionAvailable = true;
    let helperAttempts = 0;
    let pageAttempts = 0;

    function modernBackground() {
        return !!(window.NewtabBackground || document.getElementById('bg-file'));
    }

    // 更新影片資訊顯示
    function updateCurrentVideoInfo(name) {
        const currentVideoInfo = document.getElementById('current-video-info');
        const currentVideoName = document.getElementById('current-video-name');
        if (currentVideoInfo && currentVideoName) {
            currentVideoInfo.style.display = 'block';
            currentVideoName.textContent = name;
        }
    }

    // 顯示擴充功能失效提示
    function showExtensionInvalidatedMessage() {
        const existingMessage = document.getElementById('extension-invalidated-message');
        if (existingMessage) return;

        const message = document.createElement('div');
        message.id = 'extension-invalidated-message';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255,0,0,0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-size: 14px;
        `;
        message.textContent = '擴充功能已失效，請重新加載頁面以恢復完整功能';
        document.body.appendChild(message);

        setTimeout(() => {
            if (message.parentNode) {
                message.parentNode.removeChild(message);
            }
        }, 5000);
    }

    // 載入儲存的影片
    async function loadSavedVideo() {
        console.log('開始載入儲存的影片');

        // 檢查擴充功能是否可用
        if (typeof window.extensionHelper === 'undefined') {
            console.log('❌ extensionHelper 未定義');
            loadFallbackVideo();
            return;
        }

        // 使用擴充功能載入
        try {
            const savedData = await window.extensionHelper.loadVideo();
            console.log('從擴充功能載入結果:', savedData);

            if (savedData && savedData.success && savedData.data) {
                console.log('✓ 從擴充功能載入成功');
                console.log('影片來源:', savedData.source);

                videoElement.src = savedData.data;
                updateCurrentVideoInfo('自訂影片');

                // 嘗試播放
                videoElement.play().catch(e => {
                    console.log('自動播放被阻止 - 這是正常的');
                });
                return;
            } else {
                loadFallbackVideo();
            }
        } catch (error) {
            console.log('從擴充功能載入失敗:', error.message);
            loadFallbackVideo();
        }
    }

    // 載入回退影片
    function loadFallbackVideo() {
        // 如果擴充功能沒有資料，檢查是否有網址影片
        const videoUrl = localStorage.getItem('videoUrl');
        if (videoUrl) {
            console.log('從 localStorage 載入網址影片');
            videoElement.src = videoUrl;
            updateCurrentVideoInfo('自訂網址影片');

            videoElement.play().catch(e => {
                console.log('自動播放被阻止');
            });
        } else {
            console.log('使用預設背景影片');
            // 確保使用預設影片
            if (videoElement && !videoElement.src.includes('mixkit.co')) {
                videoElement.src = 'https://assets.mixkit.co/videos/preview/mixkit-white-clouds-passing-by-1152-large.mp4';
                videoElement.play().catch(e => {
                    console.log('預設影片自動播放被阻止');
                });
            }
        }
    }

    // 修改頁面功能
    function modifyPageFunctions() {
        if (modernBackground()) return;
        console.log('開始修改頁面功能');

        const confirmBtn = document.getElementById('confirm-upload');
        const fileInput = document.getElementById('video-file');
        videoElement = document.getElementById('video-background');

        if (!confirmBtn || !fileInput || !videoElement) {
            console.log('找不到必要元素，重試中...');
            if (++pageAttempts < 20) setTimeout(modifyPageFunctions, 500);
            return;
        }

        console.log('找到必要元素，開始覆蓋功能');

        // 監聽檔案選擇變化
        fileInput.addEventListener('change', function (e) {
            currentSelectedFile = e.target.files[0];
            console.log('檔案選擇變化:', currentSelectedFile ? currentSelectedFile.name : '無檔案');

            if (currentSelectedFile && currentSelectedFile.type === 'video/mp4') {
                document.getElementById('confirm-upload').disabled = false;
            } else {
                document.getElementById('confirm-upload').disabled = true;
                if (currentSelectedFile) {
                    alert('請選擇 MP4 格式的影片檔案');
                }
            }
        });

        // 監聽擴充功能失效消息
        window.addEventListener('message', function (event) {
            if (event.source !== window) return;

            if (event.data.type === 'FROM_EXTENSION' && event.data.action === 'extensionInvalidated') {
                console.log('收到擴充功能失效通知');
                isExtensionAvailable = false;
                showExtensionInvalidatedMessage();
            }
        });

        // 修正的確認按鈕點擊事件處理器
        confirmBtn.addEventListener('click', async function (event) {
            event.preventDefault();
            event.stopPropagation();

            console.log('確認按鈕被點擊');
            console.log('當前選擇的檔案:', currentSelectedFile);

            // 檢查擴充功能是否可用
            if (!isExtensionAvailable || typeof window.extensionHelper === 'undefined') {
                alert('擴充功能目前不可用，請重新加載頁面');
                return;
            }

            const urlInput = document.getElementById('video-url');
            const selectedVideoUrl = urlInput.value.trim();

            // 顯示載入指示器
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 儲存中...';
            this.disabled = true;

            try {
                if (currentSelectedFile) {
                    // 檢查檔案大小
                    if (currentSelectedFile.size > 50 * 1024 * 1024) {
                        alert('影片檔案太大 (超過 50MB)，建議使用較小的影片或網址影片');
                        return;
                    }

                    console.log('處理檔案影片:', currentSelectedFile.name);

                    // 直接轉為 Base64 並立即使用
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(currentSelectedFile);
                    });

                    console.log('Base64 轉換完成，長度:', base64Data.length);

                    // 立即用 Base64 播放
                    videoElement.src = base64Data;

                    // 等待影片載入
                    await new Promise((resolve, reject) => {
                        videoElement.onloadeddata = resolve;
                        videoElement.onerror = reject;
                        videoElement.load();
                    });

                    await videoElement.play();
                    console.log('Base64 影片播放成功');

                    // 儲存到擴充功能 (主要儲存方式)
                    try {
                        await window.extensionHelper.saveVideo(currentSelectedFile);
                        console.log('✓ 成功儲存到擴充功能');

                        // 儲存小量資訊到 localStorage
                        localStorage.setItem('videoSource', 'extension');
                        localStorage.setItem('videoName', currentSelectedFile.name);
                        localStorage.setItem('videoType', 'base64');
                        localStorage.setItem('hasExtensionVideo', 'true');
                        console.log('儲存小量資訊到 localStorage');

                    } catch (error) {
                        console.log('⚠ 擴充功能儲存失敗:', error.message);
                        alert('儲存失敗: ' + error.message + '\n請嘗試較小的影片檔案或使用網址影片');
                    }

                    console.log('影片設定完成');

                    // 更新顯示
                    updateCurrentVideoInfo(currentSelectedFile.name);

                } else if (selectedVideoUrl) {
                    console.log('選擇了網址影片');

                    videoElement.src = selectedVideoUrl;

                    try {
                        await videoElement.play();
                    } catch (error) {
                        console.log('自動播放被阻止，需要用戶互動');
                    }

                    // 儲存網址設定
                    localStorage.setItem('videoUrl', selectedVideoUrl);
                    localStorage.setItem('videoSource', 'url');
                    localStorage.setItem('videoName', '自訂網址影片');
                    localStorage.setItem('videoType', 'url');

                    // 也儲存到擴充功能
                    try {
                        await window.extensionHelper.saveVideoUrl(selectedVideoUrl);
                        console.log('✓ 網址影片儲存到擴充功能');
                    } catch (error) {
                        console.log('擴充功能網址儲存失敗:', error.message);
                    }

                    updateCurrentVideoInfo('自訂網址影片');
                } else {
                    console.log('沒有選擇檔案或網址');
                    alert('請選擇影片檔案或輸入網址');
                    return;
                }

                // 關閉上傳視窗
                document.getElementById('video-upload-container').style.display = 'none';

            } catch (error) {
                console.error('處理影片失敗:', error);
                alert('處理影片失敗: ' + error.message);
            } finally {
                // 恢復按鈕狀態
                this.innerHTML = originalText;
                this.disabled = false;

                // 重置表單
                fileInput.value = '';
                if (urlInput) urlInput.value = '';
                document.getElementById('confirm-upload').disabled = true;
                currentSelectedFile = null;
            }
        });

        // 載入儲存的影片
        loadSavedVideo();
    }

    // 等待擴充功能幫助函數就緒
    function waitForExtensionHelper() {
        if (modernBackground()) return;
        if (typeof window.extensionHelper !== 'undefined') {
            console.log('✅ extensionHelper 已載入，可用方法:', Object.keys(window.extensionHelper));
            modifyPageFunctions();
        } else {
            console.log('⏳ 等待 extensionHelper 載入...');
            if (++helperAttempts < 100) setTimeout(waitForExtensionHelper, 100);
        }
    }

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForExtensionHelper);
    } else {
        waitForExtensionHelper();
    }

})();
