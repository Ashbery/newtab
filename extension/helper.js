// 修正版 helper.js - 更穩定的初始化
(function () {
    'use strict';

    class OptimizedVideoDB {
        constructor() {
            this.dbName = 'VideoCacheDB';
            this.storeName = 'videos';
            this.db = null;
            this.isInitialized = false;
            this.initPromise = null;
        }

        async init() {
            if (this.isInitialized) return;
            if (this.initPromise) return this.initPromise;

            this.initPromise = new Promise((resolve, reject) => {
                try {
                    const request = indexedDB.open(this.dbName, 2);

                    request.onerror = () => {
                        this.initPromise = null;
                        reject(request.error);
                    };

                    request.onsuccess = () => {
                        this.db = request.result;
                        this.isInitialized = true;
                        resolve();
                    };

                    request.onupgradeneeded = (event) => {
                        const db = event.target.result;
                        if (!db.objectStoreNames.contains(this.storeName)) {
                            db.createObjectStore(this.storeName);
                        }
                    };
                } catch (error) {
                    this.initPromise = null;
                    reject(error);
                }
            });

            return this.initPromise;
        }

        async loadVideo(key) {
            if (!this.isInitialized) await this.init();

            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction([this.storeName], 'readonly');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.get(key);

                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                } catch (error) {
                    reject(error);
                }
            });
        }

        async saveVideo(key, file) {
            if (!this.isInitialized) await this.init();

            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);
                    const request = store.put(file, key);

                    request.onsuccess = () => {
                        window.cachedVideoBlob = file;
                        resolve();
                    };
                    request.onerror = () => reject(request.error);
                } catch (error) {
                    reject(error);
                }
            });
        }
    }

    const optimizedHelper = {
        videoDB: new OptimizedVideoDB(),
        isInitialized: false,

        // 安全初始化
        safeInit: async function () {
            if (this.isInitialized) return true;

            try {
                await this.videoDB.init();
                this.isInitialized = true;
                console.log('✅ 資料庫安全初始化完成');

                // 嘗試預載入影片
                this.attemptQuickPreload().catch(() => { });

                return true;
            } catch (error) {
                console.log('❌ 安全初始化失敗:', error);
                this.isInitialized = false;
                return false;
            }
        },

        // 快速預載入嘗試
        attemptQuickPreload: async function () {
            try {
                const blob = await this.videoDB.loadVideo('cached_video');
                if (blob) {
                    window.cachedVideoBlob = blob;
                    console.log('✅ 快速預載入成功');
                    return true;
                }
            } catch (error) {
                // 靜默失敗
            }
            return false;
        },

        // 極速載入 - 包含錯誤處理
        loadVideoFast: function () {
            return new Promise(async (resolve) => {
                console.log('⚡ 啟動快速載入...');
                const startTime = performance.now();

                try {
                    // 確保初始化
                    if (!this.isInitialized) {
                        await this.safeInit();
                    }

                    // 1. 檢查記憶體快取
                    if (window.cachedVideoBlob) {
                        const blobUrl = URL.createObjectURL(window.cachedVideoBlob);
                        const loadTime = performance.now() - startTime;
                        console.log(`✅ 從記憶體載入: ${loadTime.toFixed(2)}ms`);
                        resolve({
                            success: true,
                            type: 'blob',
                            data: blobUrl,
                            source: 'memory',
                            loadTime: loadTime
                        });
                        return;
                    }

                    // 2. 嘗試從 IndexedDB 載入
                    const blob = await this.videoDB.loadVideo('cached_video');
                    if (blob) {
                        window.cachedVideoBlob = blob;
                        const blobUrl = URL.createObjectURL(blob);
                        const loadTime = performance.now() - startTime;
                        console.log(`✅ 從資料庫載入: ${loadTime.toFixed(2)}ms`);
                        resolve({
                            success: true,
                            type: 'blob',
                            data: blobUrl,
                            source: 'indexed_db',
                            loadTime: loadTime
                        });
                        return;
                    }

                    // 3. 回退到預設影片
                    const loadTime = performance.now() - startTime;
                    console.log(`⚠️ 使用預設影片: ${loadTime.toFixed(2)}ms`);
                    resolve({
                        success: true,
                        type: 'url',
                        data: 'https://assets.mixkit.co/videos/preview/mixkit-white-clouds-passing-by-1152-large.mp4',
                        source: 'default',
                        loadTime: loadTime
                    });

                } catch (error) {
                    console.error('❌ 載入失敗:', error);
                    const loadTime = performance.now() - startTime;
                    resolve({
                        success: false,
                        error: error.message,
                        loadTime: loadTime
                    });
                }
            });
        },

        // 快速儲存
        saveVideoFast: function (file) {
            return new Promise(async (resolve, reject) => {
                try {
                    // 1. 立即更新記憶體快取
                    window.cachedVideoBlob = file;

                    // 2. 非同步儲存到資料庫（不等待）
                    this.videoDB.saveVideo('cached_video', file).catch(() => {
                        // 靜默處理儲存錯誤
                    });

                    // 3. 立即回應成功
                    resolve({
                        success: true,
                        instant: true
                    });

                } catch (error) {
                    reject(new Error('儲存失敗: ' + error.message));
                }
            });
        },

        // 兼容性方法
        isAvailable: function () {
            return Promise.resolve(this.isInitialized);
        },

        loadVideo: function () {
            return this.loadVideoFast();
        },

        saveVideo: function (file) {
            return this.saveVideoFast(file);
        }
    };

    // 暴露到全域
    window.extensionHelper = optimizedHelper;

    // 安全初始化
    setTimeout(() => {
        optimizedHelper.safeInit().then(success => {
            if (success) {
                console.log('✅ 優化版幫助函數初始化完成');
            } else {
                console.log('❌ 優化版幫助函數初始化失敗');
            }
        });
    }, 500);

    console.log('✅ 優化版幫助函數已載入');

})();