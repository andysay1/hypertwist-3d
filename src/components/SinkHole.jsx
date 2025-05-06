import { useRef, useEffect } from 'react';
import * as easingUtils from 'easing-utils';

export default function SinkHole(props) {
    const canvasRef = useRef(null);
    const stateRef = useRef();

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const state = (stateRef.current = {
            canvas,
            ctx,
            discs: [],
            lines: [],
            particles: [],
            startDisc: {},
            endDisc: {},
            clip: {},
            particleArea: {},
            render: { width: 0, height: 0, dpi: window.devicePixelRatio },
            raf: 0,
            zoom: 1.0,
        });

        const onWheel = (e) => {
            e.preventDefault();
            const zoomFactor = 1.05;
            if (e.deltaY < 0) {
                state.zoom *= zoomFactor;
            } else {
                state.zoom /= zoomFactor;
            }
            state.zoom = Math.min(5.0, Math.max(0.05, state.zoom)); // ограничения
        };

        const onResize = () => {
            const rect = canvas.parentElement.getBoundingClientRect();
            state.render.width = rect.width;
            state.render.height = rect.height;
            state.render.dpi = window.devicePixelRatio;

            canvas.width = rect.width * state.render.dpi;
            canvas.height = rect.height * state.render.dpi;

            setDiscs(state, rect);
            setLines(state, rect);
            setParticles(state, rect);
        };

        window.addEventListener('resize', onResize);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        onResize();
        tick(state);

        return () => {
            cancelAnimationFrame(state.raf);
            window.removeEventListener('resize', onResize);
            canvas.removeEventListener('wheel', onWheel);
        };
    }, []);

    return <canvas ref={canvasRef} className={props.className} style={{ display: 'block', width: '100%', height: '100%' }} />;
}

/* ======================================================================== */
/*                               helpers                                    */
/* ======================================================================== */

function getEaseFn(name = 'linear') {
    if (typeof easingUtils[name] === 'function') return easingUtils[name];
    const alt = 'ease' + name.charAt(0).toUpperCase() + name.slice(1);
    if (typeof easingUtils[alt] === 'function') return easingUtils[alt];
    return (t) => t;
}

function tween(start, end, p, ease = 'linear') {
    const fn = getEaseFn(ease);
    return start + (end - start) * fn(p);
}

function setDiscs(state, rect) {
    const { width, height } = rect;
    state.discs = [];

    state.startDisc = {
        x: width * 0.5,
        y: height * 0.45,
        w: width * 0.75,
        h: height * 0.7,
        p: 0,
    };
    state.endDisc = { x: width * 0.5, y: height * 0.95, w: 0, h: 0, p: 1 };

    const total = 100;
    let maxRadius = -Infinity;
    state.clip = {};

    for (let i = 0; i < total; i++) {
        const disc = tweenDisc({ p: i / total }, state);
        const r = Math.max(disc.w, disc.h);

        if (r > maxRadius) {
            maxRadius = r;
            state.clip = { disc: { ...disc }, i };
        }

        state.discs.push(disc);
    }

    const { x, y, w, h } = state.clip.disc;
    state.clip.path = new Path2D();
    state.clip.path.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    state.clip.path.rect(x - w, 0, w * 2, y);
}

function transformTwist(x, y, a = 1, b = 1) {
    const r = Math.sqrt(x * x + y * y);
    const θ = Math.atan2(y, x);
    const R = r * (1 - a / (r * r + b));
    const T = Math.PI / (4 * (1 + r));
    return {
        x: R * Math.cos(θ + T),
        y: R * Math.sin(θ + T),
    };
}

function setLines(state, rect) {
    const { width, height } = rect;
    const totalLines = 100;
    const angleStep = (Math.PI * 2) / totalLines;
    const maxTwist = Math.PI / 2; // 90° максимум

    state.lines = Array.from({ length: totalLines }, () => []);
    state.discs.forEach((disc) => {
        const normalizedY = (disc.y - state.startDisc.y) / (state.endDisc.y - state.startDisc.y);
        const twistAngle = maxTwist * Math.pow(normalizedY, 2); // нелинейное скручивание
        const cosT = Math.cos(twistAngle);
        const sinT = Math.sin(twistAngle);

        for (let i = 0; i < totalLines; i++) {
            const baseAngle = i * angleStep;
            const dx = Math.cos(baseAngle) * disc.w;
            const dy = Math.sin(baseAngle) * disc.h;

            const tx = dx * cosT - dy * sinT;
            const ty = dx * sinT + dy * cosT;

            state.lines[i].push({
                x: disc.x + tx,
                y: disc.y + ty,
            });
        }
    });

    const dpi = state.render.dpi;
    state.linesCanvas = new OffscreenCanvas(width * dpi, height * dpi);
    const lctx = state.linesCanvas.getContext('2d');
    lctx.scale(dpi, dpi);

    state.lines.forEach((line) => {
        let clipped = false;
        line.forEach((p1, j) => {
            if (j === 0) return;
            const p0 = line[j - 1];

            if (!clipped && (lctx.isPointInPath(state.clip.path, p1.x, p1.y) || lctx.isPointInStroke(state.clip.path, p1.x, p1.y))) {
                clipped = true;
            } else if (clipped) {
                lctx.clip(state.clip.path);
            }

            lctx.beginPath();
            lctx.moveTo(p0.x, p0.y);
            lctx.lineTo(p1.x, p1.y);
            lctx.strokeStyle = '#444';
            lctx.lineWidth = 2;
            lctx.stroke();
        });
    });

    state.linesCtx = lctx;
}

function setParticles(state, rect) {
    const { width, height } = rect;
    state.particles = [];

    const sw = 20;
    const ew = 1000;
    const h = height * 0.85;

    state.particleArea = {
        sw,
        ew,
        h,
        sx: (width - sw) / 2,
        ex: (width - ew) / 2,
    };

    for (let i = 0; i < 100; ++i) {
        state.particles.push(initParticle(state, true));
    }
}

function initParticle(state, start = false) {
    const { sx, ex, sw, ew, h } = state.particleArea;
    const x0 = sx + sw * Math.random();
    const x1 = ex + ew * Math.random();
    return {
        sx: x0,
        dx: x1 - x0,
        x: x0,
        y: start ? 0 : 0,
        vy: 0.5 + Math.random(),
        r: 0.5 + Math.random() * 4,
        c: `rgba(255,255,255,${Math.random()})`,
    };
}

function tweenDisc(disc, state) {
    const { startDisc: s, endDisc: e } = state;
    disc.x = tween(s.x, e.x, disc.p);
    disc.y = tween(s.y, e.y, disc.p, 'inExpo');
    disc.w = tween(s.w, e.w, disc.p);
    disc.h = tween(s.h, e.h, disc.p);
    return disc;
}

function tick(state) {
    const { ctx, canvas, render } = state;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(render.dpi, render.dpi);

    moveDiscs(state);
    moveParticles(state);

    drawDiscs(state);
    drawLines(state);
    drawParticles(state);
    drawPlanet(state, performance.now());

    ctx.restore();
    state.raf = requestAnimationFrame(() => tick(state));
}

function moveDiscs(state) {
    state.discs.forEach((d) => {
        d.p = (d.p + 0.001) % 1;
        tweenDisc(d, state);
    });
}

function moveParticles(state) {
    const { particleArea, particles } = state;
    particles.forEach((p) => {
        p.p = 1 - p.y / particleArea.h;
        p.x = p.sx + p.dx * p.p;
        p.y += p.vy;
        if (p.y > particleArea.h) Object.assign(p, initParticle(state));
    });
}

function drawDiscs(state) {
    const { ctx, discs, clip } = state;
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    const maxTwist = Math.PI / 2;

    const o = state.startDisc;
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, o.w, o.h, 0, 0, Math.PI * 2);
    ctx.stroke();

    discs.forEach((d, i) => {
        if (i % 5) return;
        const useClip = d.w < clip.disc.w - 5;
        if (useClip) ctx.save(), ctx.clip(clip.path);

        const normalizedY = (d.y - state.startDisc.y) / (state.endDisc.y - state.startDisc.y);
        const angle = maxTwist * Math.pow(normalizedY, 2);

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.w, d.h, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (useClip) ctx.restore();
    });
}

function drawLines(state) {
    const { ctx, linesCanvas, render } = state;
    ctx.drawImage(linesCanvas, 0, 0, linesCanvas.width, linesCanvas.height, 0, 0, render.width, render.height);
}

function drawParticles(state) {
    const { ctx, particles, clip } = state;
    ctx.save();
    ctx.clip(clip.path);
    particles.forEach((p) => {
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x, p.y, p.r, p.r);
    });
    ctx.restore();
}

function generatePlanetPoint(θ, φ, radius, spin = 0) {
    const dx = Math.cos(θ + spin) * Math.cos(φ) * radius;
    const dy = Math.sin(φ) * radius;
    return { dx, dy };
}

function drawPlanet(state, time) {
    const { ctx, startDisc, zoom } = state;
    if (!startDisc || typeof startDisc.x !== 'number' || typeof startDisc.y !== 'number') return;

    const baseRadius = 150;
    const shrink = zoom / (1 + zoom); // r / (1 + r)
    const twist = Math.PI / (4 * (1 + zoom)); // π / [4(1 + r)]
    const radius = baseRadius * shrink;

    const x = startDisc.x;
    const y = startDisc.y - 100;

    const spinAngle = (time * 0.001) % (Math.PI * 2);
    const axialTilt = (23.5 * Math.PI) / 180;

    function transformHyperTwist(x, y, zoom = 1.0, a = 2.5, b = 0.5) {
        const scale = zoom;
        const rx = x * scale;
        const ry = y * scale;
        const r = Math.sqrt(rx * rx + ry * ry);
        const θ = Math.atan2(ry, rx);
        const R = r * (1 - a / (r * r + b));
        const T = Math.PI / (4 * (1 + r));
        return {
            x: R * Math.cos(θ + T),
            y: R * Math.sin(θ + T),
        };
    }

    ctx.save();
    ctx.translate(x, y);
    const perspectiveTilt = ((1 - shrink) * Math.PI) / 3; // наклон до 60° при близости

    ctx.rotate(axialTilt);

    // === Рисуем трансформированную форму планеты (как оболочку)
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
        const θ = (i / 360) * Math.PI * 2;
        const dx = Math.cos(θ) * radius;
        const flatten = 1 - shrink * 0.8; // при shrink → 0, получится почти плоскость
        const dy = Math.sin(θ) * radius * flatten;

        const p = transformHyperTwist(dx, dy, zoom, 2.5, 0.5);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();

    // Атмосфера и контур
    ctx.shadowColor = 'rgba(100,200,255,0.4)';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#3af';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#08f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // === Сетка: меридианы и параллели
    const nMeridians = 12;
    const nParallels = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;

    // === Меридианы
    for (let i = 0; i < nMeridians; i++) {
        const θ0 = (i / nMeridians) * Math.PI * 2;
        ctx.beginPath();
        for (let j = 0; j <= 100; j++) {
            const φ = (j / 100) * Math.PI - Math.PI / 2; // от -π/2 до π/2
            const dx = Math.cos(θ0 + spinAngle) * Math.cos(φ) * radius;
            const dy = Math.sin(φ) * radius * (1 - shrink * 0.8); // учёт сплющивания
            const p = transformHyperTwist(dx, dy, zoom, 2.5, 0.5);
            if (j === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // === Параллели
    for (let j = 1; j < nParallels; j++) {
        const φ = (j / (nParallels + 1)) * Math.PI - Math.PI / 2;
        const dy = Math.sin(φ) * radius * (1 - shrink * 0.8);
        const r0 = Math.abs(Math.cos(φ) * radius);
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
            const θ = (i / 100) * Math.PI * 2;
            const dx = Math.cos(θ) * r0;
            const p = transformHyperTwist(dx, dy, zoom, 2.5, 0.5);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    ctx.restore();
}
