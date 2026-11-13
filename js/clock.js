/* A stable, continuous HH:MM:SS face with the calendar on its own line. */
(function (global) {
    'use strict';
    var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    function two(value) { return String(value).padStart(2, '0'); }
    function model(now, hour12) {
        var hour = now.getHours();
        return {
            hours: two(hour12 ? hour % 12 || 12 : hour),
            minutes: two(now.getMinutes()), seconds: two(now.getSeconds()),
            period: hour12 ? (hour < 12 ? '上午' : '下午') : '',
            date: now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日',
            weekday: weekdays[now.getDay()],
            iso: now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate())
        };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { model: model };
    if (!global.document) return;
    function put(node, value) { if (node && node.textContent !== value) node.textContent = value; }
    function updateClock(now) {
        var clock = document.getElementById('clock');
        if (!clock) return;
        // The widget host can recreate an older shell after restoring a layout.
        if (!clock.querySelector('.clock-hours')) {
            var oldDate = document.getElementById('date');
            if (oldDate && !clock.contains(oldDate)) oldDate.remove();
            clock.innerHTML = '<div class="clock-face" aria-hidden="true"><span class="clock-hours"></span><span class="clock-divider">:</span><span class="clock-minutes"></span><span class="clock-divider">:</span><span class="clock-seconds"></span></div>' +
                '<div class="clock-caption" aria-hidden="true"><span class="clock-calendar"><time class="date" id="date"></time><span class="clock-weekday"></span></span>' +
                '<span class="clock-period"></span></div>';
        }
        clock.setAttribute('role', 'timer');
        clock.setAttribute('aria-live', 'off');
        var use12 = global.__nt_clock_hour12 !== false;
        var value = model(now instanceof Date ? now : new Date(), use12);
        put(clock.querySelector('.clock-hours'), value.hours);
        put(clock.querySelector('.clock-minutes'), value.minutes);
        put(clock.querySelector('.clock-seconds'), value.seconds);
        var period = clock.querySelector('.clock-period');
        put(period, value.period);
        period.hidden = !use12;
        var date = document.getElementById('date');
        put(date, value.date);
        date.setAttribute('datetime', value.iso);
        put(clock.querySelector('.clock-weekday'), value.weekday);
        clock.setAttribute('aria-label', value.date + ' ' + value.weekday + '，' + value.period + value.hours + '點' + value.minutes + '分' + value.seconds + '秒');
        clock.dataset.hour12 = String(use12);
    }
    global.updateClock = updateClock;
    if (typeof global.__nt_clock_hour12 === 'undefined') global.__nt_clock_hour12 = true;
    updateClock();
    setInterval(updateClock, 1000);
})(typeof window !== 'undefined' ? window : globalThis);
