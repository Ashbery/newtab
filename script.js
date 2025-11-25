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

// 播放/暫停
document.getElementById('play-pause-btn').addEventListener('click', function () {
    if (video.paused) {
        video.play();
        this.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        video.pause();
        this.innerHTML = '<i class="fas fa-play"></i>';
    }
});

// 靜音/取消靜音
document.getElementById('mute-btn').addEventListener('click', function () {
    video.muted = !video.muted;
    this.innerHTML = video.muted ?
        '<i class="fas fa-volume-mute"></i>' :
        '<i class="fas fa-volume-up"></i>';
});

// 視頻選擇
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

        // 保存選擇
        localStorage.setItem('selectedVideo', videoUrl);
    });
});

// 加載保存的視頻
window.addEventListener('DOMContentLoaded', function () {
    const savedVideo = localStorage.getItem('selectedVideo');
    if (savedVideo) {
        video.src = savedVideo;
    }
    video.play();
});
