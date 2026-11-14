/* Eye apertures for the registered 1086x1448 Nacho portraits.
 * Closed skin covers the swept region; the iris stays in place while an
 * opaque upper-lash ribbon follows the lid. There is no open/closed dissolve.
 */
(function (global) {
    'use strict';
    var WIDTH = 1086, HEIGHT = 1448;
    // center, horizontal radius, angle, upper/lower/closed quadratic curves,
    // and upper-lash thickness, all in original artwork pixels.
    var EYES = [
        { x: 472, y: 459, radius: 64, angle: -12.56 * Math.PI / 180,
            upper: [-38, 27], lower: [29, -19], closed: [-2.84, 17.70], lash: 20, closedHalf: 9 },
        { x: 680, y: 417, radius: 63, angle: -5.45 * Math.PI / 180,
            upper: [-42, 25], lower: [30, -19], closed: [1.41, 17.84], lash: 18, closedHalf: 7 }
    ];
    function glNumber(value) { return Number(value).toFixed(8); }
    var fragment = [
        'float eyeEase(float a,float b,float x){float t=clamp((x-a)/(b-a),0.0,1.0);return t*t*(3.0-2.0*t);}',
        'vec4 eyeAperture(vec4 base,vec2 pixel,vec2 center,float radius,float angle,vec2 upper,vec2 lower,vec2 shut,float lash,float closedHalf){',
        'float cs=cos(angle),sn=sin(angle);vec2 d=pixel-center;',
        'vec2 p=vec2(cs*d.x+sn*d.y,-sn*d.x+cs*d.y);float q=p.x/radius;',
        'if(abs(q)>=1.0)return base;',
        'float u=upper.x+upper.y*q*q,l=lower.x+lower.y*q*q,c=shut.x+shut.y*q*q;',
        'float mask=(1.0-eyeEase(0.94,1.0,abs(q)))*eyeEase(u-4.0,u-2.0,p.y)*(1.0-eyeEase(l+2.0,l+5.0,p.y));',
        'if(mask<=0.0)return base;',
        // Preserve the closed lash's entire thickness under the aperture until
        // the moving opaque lash reaches it, including the curved corners.
        'float blink=clamp(u_blink,0.0,1.0),top=mix(u,c-closedHalf,blink),bottom=mix(l,c+closedHalf,blink);',
        'vec4 color=texture2D(u_closed,pixel/vec2(1086.0,1448.0));vec4 skin=color;',
        'if(blink<0.9999&&p.y>=top&&p.y<=bottom){',
        'vec2 samplePoint=p;',
        // The upper lash moves down; uncovered iris pixels retain their shape.
        'if(p.y-top<lash)samplePoint.y=u+p.y-top;',
        'else if(bottom-p.y<2.0)samplePoint.y=l-(bottom-p.y);',
        'vec2 source=center+vec2(cs*samplePoint.x-sn*samplePoint.y,sn*samplePoint.x+cs*samplePoint.y);',
        'float edge=eyeEase(top,top+1.2,p.y)*(1.0-eyeEase(bottom-1.2,bottom,p.y));',
        'color=mix(color,texture2D(u_art,source/vec2(1086.0,1448.0)),edge);',
        // Only the already closed, narrow lash ribbon converges to its authored
        // endpoint. The entire eye patch never crossfades open into closed.
        'color=mix(color,skin,eyeEase(0.90,1.0,blink));}',
        'return mix(base,color,mask);}',
        'vec4 applyEyes(vec2 uv){vec4 color=texture2D(u_art,uv);if(u_blink<=0.0001)return color;vec2 pixel=uv*vec2(1086.0,1448.0);'
    ];
    EYES.forEach(function (eye) {
        fragment.push('color=eyeAperture(color,pixel,vec2(' + glNumber(eye.x) + ',' + glNumber(eye.y) + '),' +
            glNumber(eye.radius) + ',' + glNumber(eye.angle) + ',vec2(' + eye.upper.map(glNumber).join(',') +
            '),vec2(' + eye.lower.map(glNumber).join(',') + '),vec2(' + eye.closed.map(glNumber).join(',') + '),' + glNumber(eye.lash) + ',' + glNumber(eye.closedHalf) + ');');
    });
    fragment.push('return color;}');

    function smooth(a, b, value) {
        var t = Math.max(0, Math.min(1, (value - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }
    function createCanvas(image, closedImage, width, height) {
        width = Math.max(1, Math.round(width || 544)); height = Math.max(1, Math.round(height || 725));
        var canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        var painter = canvas.getContext('2d', { alpha: true });
        if (!painter) return null;
        painter.imageSmoothingQuality = 'high'; painter.drawImage(image, 0, 0, width, height);
        var original = painter.getImageData(0, 0, width, height);
        var closedCanvas = document.createElement('canvas'); closedCanvas.width = width; closedCanvas.height = height;
        var closedPainter = closedCanvas.getContext('2d', { alpha: true });
        if (!closedPainter) return null;
        closedPainter.imageSmoothingQuality = 'high'; closedPainter.drawImage(closedImage || image, 0, 0, width, height);
        var closed = closedPainter.getImageData(0, 0, width, height).data;
        var patches = EYES.map(function (eye) {
            var cs = Math.cos(eye.angle), sn = Math.sin(eye.angle);
            var left = Math.max(0, Math.floor((eye.x - 82) / WIDTH * width));
            var top = Math.max(0, Math.floor((eye.y - 62) / HEIGHT * height));
            var right = Math.min(width, Math.ceil((eye.x + 82) / WIDTH * width));
            var bottom = Math.min(height, Math.ceil((eye.y + 62) / HEIGHT * height));
            var patch = painter.createImageData(right - left, bottom - top);
            // Geometry is constant; precompute its masks and contours once.
            var count = patch.width * patch.height, geometry = new Float32Array(count * 7);
            for (var y = 0; y < patch.height; y++) for (var x = 0; x < patch.width; x++) {
                var px = (left + x + .5) / width * WIDTH - eye.x;
                var py = (top + y + .5) / height * HEIGHT - eye.y;
                var localX = cs * px + sn * py, localY = -sn * px + cs * py, q = localX / eye.radius;
                var u = eye.upper[0] + eye.upper[1] * q * q, l = eye.lower[0] + eye.lower[1] * q * q;
                var k = (y * patch.width + x) * 7;
                geometry[k] = localX; geometry[k + 1] = localY; geometry[k + 2] = u; geometry[k + 3] = l;
                geometry[k + 4] = eye.closed[0] + eye.closed[1] * q * q;
                geometry[k + 5] = (1 - smooth(.94, 1, Math.abs(q))) * smooth(u - 4, u - 2, localY) * (1 - smooth(l + 2, l + 5, localY));
                geometry[k + 6] = ((top + y) * width + left + x) * 4;
            }
            return { eye: eye, cs: cs, sn: sn, left: left, top: top, image: patch, geometry: geometry };
        });
        function sample(data, x, y, channel) {
            x = Math.max(0, Math.min(width - 1, x)); y = Math.max(0, Math.min(height - 1, y));
            var left = Math.floor(x), top = Math.floor(y), right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
            var dx = x - left, dy = y - top;
            var a = data[(top * width + left) * 4 + channel] * (1 - dx) + data[(top * width + right) * 4 + channel] * dx;
            var b = data[(bottom * width + left) * 4 + channel] * (1 - dx) + data[(bottom * width + right) * 4 + channel] * dx;
            return a * (1 - dy) + b * dy;
        }
        var previous = 0, destroyed = false;
        return {
            paint: function (value) {
                if (destroyed) return canvas;
                var blink = closedImage ? Math.max(0, Math.min(1, Number(value) || 0)) : 0;
                if (blink === previous) return canvas;
                previous = blink;
                if (blink <= .0001) {
                    // Restore artwork, not readback bytes: privacy browsers
                    // may perturb getImageData pixels outside the eye patches.
                    painter.clearRect(0, 0, width, height);
                    painter.drawImage(image, 0, 0, width, height);
                    return canvas;
                }
                for (var index = 0; index < patches.length; index++) {
                    var p = patches[index], geo = p.geometry, pixels = p.image.data;
                    for (var k = 0, offset = 0; k < geo.length; k += 7, offset += 4) {
                        var source = geo[k + 6], mask = geo[k + 5];
                        var upper = geo[k + 2], lower = geo[k + 3], shut = geo[k + 4];
                        var top = upper + (shut - p.eye.closedHalf - upper) * blink, bottom = lower + (shut + p.eye.closedHalf - lower) * blink;
                        var localY = geo[k + 1], visible = blink < .9999 && localY >= top && localY <= bottom;
                        var sourceX = 0, sourceY = 0, edge = 0;
                        if (mask > 0 && visible) {
                            edge = smooth(top, top + 1.2, localY) * (1 - smooth(bottom - 1.2, bottom, localY));
                            if (localY - top < p.eye.lash) localY = upper + localY - top;
                            else if (bottom - localY < 2) localY = lower - (bottom - localY);
                            sourceX = (p.eye.x + p.cs * geo[k] - p.sn * localY) / WIDTH * width - .5;
                            sourceY = (p.eye.y + p.sn * geo[k] + p.cs * localY) / HEIGHT * height - .5;
                        }
                        for (var channel = 0; channel < 4; channel++) {
                            var base = original.data[source + channel];
                            var skin = closed[source + channel];
                            var color = mask <= 0 ? base : visible ? skin + (sample(original.data, sourceX, sourceY, channel) - skin) * edge * (1 - smooth(.9, 1, blink)) : skin;
                            pixels[offset + channel] = base + (color - base) * mask;
                        }
                    }
                    painter.putImageData(p.image, p.left, p.top);
                }
                return canvas;
            },
            destroy: function () {
                destroyed = true; patches.length = 0; original = closed = null;
                canvas.width = closedCanvas.width = 1;
            }
        };
    }
    global.NewtabCompanionEyes = Object.freeze({ fragment: fragment.join('\n'), createCanvas: createCanvas });
})(window);
