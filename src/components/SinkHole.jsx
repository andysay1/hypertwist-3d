import { useRef, useEffect } from 'react';
import * as easingUtils from 'easing-utils';
import { forwardRef, useImperativeHandle } from 'react';

const SinkHole = forwardRef((props, ref) => {
    const canvasRef = useRef(null);
    const stateRef = useRef();

    useImperativeHandle(ref, () => ({
        focusOnPlanet: (index) => {
            const radius = [0.2, 0.32, 0.45, 0.6, 0.8, 1.05, 1.25, 1.45][index];
            if (stateRef.current) {
                stateRef.current.focusTarget = radius;
            }
        },
    }));

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
            tilt: Math.PI / 4,
            drop: 1.5,
            perspective: 4,
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
});

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

    const total = 150;
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

function emitCoreParticles(state) {
    if (!state.coreParticles) state.coreParticles = [];
    if (state.coreParticles.length < 300) {
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 0.005 + Math.random() * 0.01;
            state.coreParticles.push({
                r: 0,
                θ: angle,
                v: speed,
                alpha: 1.0,
                color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`,
            });
        }
    }
}

function drawCoreParticles(ctx, state) {
    const cx = state.startDisc.x;
    const cy = state.startDisc.y;
    const { render, zoom } = state;
    state.coreParticles.forEach((p) => {
        p.r += p.v;
        p.alpha -= 0.005;

        const x = p.r * Math.cos(p.θ);
        const y = p.r * Math.sin(p.θ);
        const pt = hyperTwistCircular(x, y, zoom);
        const px = cx + pt.x * render.width * 0.2;
        const py = cy + pt.y * render.height * 0.2;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, 2 * Math.PI);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    state.coreParticles = state.coreParticles.filter((p) => p.alpha > 0);
}

function emitCoreSinkParticles(state) {
    if (!state.coreSinkParticles) state.coreSinkParticles = [];
    if (state.coreSinkParticles.length < 100) {
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * 2 * Math.PI;
            state.coreSinkParticles.push({
                r: 2.5 + Math.random(),
                θ: angle,
                v: 0.01 + Math.random() * 0.005,
                omega: 0.02 + Math.random() * 0.01,
                alpha: 1.0,
                color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`,
                phase: 'descend',
            });
        }
    }
}

function drawCoreSinkParticles(ctx, state) {
    const { render, zoom } = state;
    const cx = state.startDisc.x;
    const cy = state.startDisc.y;

    state.coreSinkParticles.forEach((p) => {
        if (p.phase === 'descend') {
            p.r -= p.v;
            p.θ -= p.omega;
            p.alpha -= 0.003;

            const x = p.r * Math.cos(p.θ);
            const y = p.r * Math.sin(p.θ);
            const twisted = hyperTwistCircular(x, y, zoom);
            const px = cx + twisted.x * render.width * 0.2;
            let py = cy + twisted.y * render.height * 0.2;

            // Имитация падения вниз
            const zDrop = (1 - p.r / 2.5) * render.height * 0.1;
            py += zDrop;

            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    ctx.globalAlpha = 1.0;

    // Удалить исчезнувшие
    state.coreSinkParticles = state.coreSinkParticles.filter((p) => p.r > 0.05 && p.alpha > 0);
    emitCoreSinkParticles(state);
}

function emitCoreSpiralParticles(state) {
    if (!state.coreParticles) state.coreParticles = [];
    if (state.coreParticles.length < 200) {
        for (let i = 0; i < 3; i++) {
            state.coreParticles.push({
                r: 0,
                θ: Math.random() * Math.PI * 2,
                v: 0.015 + Math.random() * 0.005,
                omega: 0.05 + Math.random() * 0.02,
                alpha: 1.0,
                phase: 'ascend',
                targetY: 2.0,
                color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`,
            });
        }
    }
}

function drawCoreSpiralParticles(ctx, state) {
    const { render, zoom } = state;
    const cx = state.startDisc.x;
    const cy = state.startDisc.y; // 🌞 центр солнца — источник

    state.coreParticles.forEach((p) => {
        if (p.phase === 'ascend' && p.r >= p.targetY) {
            p.phase = 'explode';
            p.v = 0.02;
            p.omega *= 2;
        } else if (p.phase === 'explode' && p.r >= p.targetY + 1.0) {
            p.phase = 'collapse';
            p.v *= -1;
        }

        p.r += p.v;
        p.θ += p.omega;

        const x = p.r * Math.cos(p.θ);
        const y = p.r * Math.sin(p.θ);
        const twisted = hyperTwistCircular(x, y, zoom);
        const px = cx + twisted.x * render.width * 0.2;
        const py = cy + twisted.y * render.height * 0.2; // теперь центр — солнце

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, 2 * Math.PI);
        ctx.fill();

        if (p.phase === 'collapse') {
            p.alpha -= 0.01;
            if (p.alpha <= 0.3) {
                p.phase = 'return';
                p.v = 0.015 + Math.random() * 0.005;
            }
        } else if (p.phase === 'explode') {
            p.alpha -= 0.004;
        } else {
            p.alpha -= 0.002;
        }

        if (p.phase === 'return') {
            p.r -= p.v;
            p.θ -= p.omega * 0.5;
            if (p.r <= 0.1) {
                p.phase = 'ascend';
                p.r = 0;
                p.v = 0.015 + Math.random() * 0.005;
                p.omega = 0.05 + Math.random() * 0.02;
                p.alpha = 1.0;
                p.color = `hsla(${Math.random() * 360}, 100%, 70%, 1)`;
            }
        }
    });

    ctx.globalAlpha = 1.0;
    state.coreParticles = state.coreParticles.filter((p) => p.alpha > 0);
}

function tick(state) {
    const { ctx, canvas, render } = state;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(render.dpi, render.dpi);

    moveDiscs(state);
    // moveParticles(state);

    emitCoreSinkParticles(state);
    drawCoreSinkParticles(ctx, state);

    emitCoreSpiralParticles(state);
    drawCoreSpiralParticles(ctx, state);
    drawDiscs(state);
    drawLines(state);
    drawParticles(state);
    drawPlanet(state, performance.now());

    drawOrbitalPlanes(state);
    drawOrbitingPlanets(state, performance.now());

    if (state.focusTarget !== undefined) {
        const targetZoom = 3 / state.focusTarget; // например
        const ease = 0.1;
        state.zoom += (targetZoom - state.zoom) * ease;
    }

    ctx.restore();
    state.raf = requestAnimationFrame(() => tick(state));
}

function moveDiscs(state) {
    state.discs.forEach((d) => {
        d.p = (d.p + 0.001) % 1;
        tweenDisc(d, state);
    });
}

function getOrbital3DPosition(radius, angle, tilt, drop, perspective) {
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = drop * radius ** 2;

    const yT = y * Math.cos(tilt) - z * Math.sin(tilt);
    const zT = y * Math.sin(tilt) + z * Math.cos(tilt);

    return project3D(x, yT, zT, perspective);
}

function drawOrbitingPlanets(state, time) {
    const { ctx, render, zoom, startDisc } = state;

    const cx = startDisc.x;
    const cy = startDisc.y;
    const t = time * 0.001;

    const planets = [
        { radius: 0.2, size: 3, period: 88, color: '#aaa' },
        { radius: 0.32, size: 4, period: 225, color: '#c96' },
        { radius: 0.45, size: 5, period: 365, color: '#3af' },
        { radius: 0.6, size: 4, period: 687, color: '#f33' },
        { radius: 0.8, size: 8, period: 4333, color: '#fb0' },
        { radius: 1.05, size: 7, period: 10759, color: '#edc' },
        { radius: 1.25, size: 6, period: 30685, color: '#9cf' },
        { radius: 1.45, size: 6, period: 60190, color: '#36f' },
    ];

    ctx.save();

    // Коэффициенты вихря:
    const A = 3.5 + Math.sin(t * 0.1) * 0.5; // вихрь пульсирует
    const B = 2.2 + Math.cos(t * 0.07) * 0.3; // вихрь дышит медленно

    planets.forEach(({ radius, size, period, color }) => {
        const omega_orbit = (2 * Math.PI) / period;
        const angle = omega_orbit * t;

        const rawX = radius * Math.cos(angle);
        const rawY = radius * Math.sin(angle);
        const twisted = hyperTwistCircular(rawX, rawY, zoom);
        const px = cx + twisted.x * render.width * 0.2;
        const py = cy + twisted.y * render.height * 0.2;

        // Угловое вращение по собственной оси
        const omega_spin = A / Math.pow(1 + radius, B);
        const spinAngle = t * omega_spin;

        // Вращаем планету
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(spinAngle);
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, 2 * Math.PI);

        ctx.fillStyle = color;
        ctx.shadowColor = `${color}55`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    });

    // 🌞 Солнце с пульсацией и вращением
    const pulse = 2 + Math.sin(t * 3) * 1.5;
    const baseRadius = 10 + pulse;
    const gradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, baseRadius);

    const spin = (t * 0.1) % (2 * Math.PI);
    const xOffset = Math.cos(spin) * baseRadius * 0.2;
    const yOffset = Math.sin(spin) * baseRadius * 0.2;

    gradient.addColorStop(0, 'rgba(255, 255, 100, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 180, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.beginPath();
    ctx.arc(cx + xOffset, cy + yOffset, baseRadius, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(255, 200, 100, 0.5)';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
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

function drawOrbitalPlanes(state) {
    const { ctx, render, zoom, startDisc } = state;

    const canvasWidth = render.width;
    const canvasHeight = render.height;

    const cx = startDisc.x;
    const cy = startDisc.y;

    const transition = getTransition(zoom);
    const intensity = 2.5 * Math.sin(performance.now() * 0.001);

    const orbits = [
        { radius: 0.2, color: '#aaa' },
        { radius: 0.32, color: '#c96' },
        { radius: 0.45, color: '#3af' },
        { radius: 0.6, color: '#f33' },
        { radius: 0.8, color: '#fb0' },
        { radius: 1.05, color: '#edc' },
        { radius: 1.25, color: '#9cf' },
        { radius: 1.45, color: '#36f' },
    ];

    ctx.save();

    orbits.forEach(({ radius, color }) => {
        const points = [];
        const steps = 360;
        for (let a = 0; a <= steps; a += 4) {
            const θ = (a * Math.PI) / 180;
            const x = radius * Math.cos(θ);
            const y = radius * Math.sin(θ);

            // Пространственная трансформация
            const rawX = x;
            const rawY = y;
            const twisted = hyperTwistCircular(rawX, rawY, zoom);
            const px = cx + twisted.x * render.width * 0.2;
            const py = cy + twisted.y * render.height * 0.2;
            points.push({ x: px, y: py });
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
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

function transformHyperTwist(x, y, zoom = 1.0, a = 2.5, b = 0.5, strength = 1.0) {
    const scale = zoom;
    const rx = x * scale;
    const ry = y * scale;
    const r = Math.sqrt(rx * rx + ry * ry);
    const θ = Math.atan2(ry, rx);
    const R = r * (1 - strength * (a / (r * r + b)));
    const T = strength * (Math.PI / (4 * (1 + r)));
    return {
        x: R * Math.cos(θ + T),
        y: R * Math.sin(θ + T),
    };
}

// ...весь предыдущий код остаётся без изменений до drawPlanet()

function drawPlanet(state, time) {
    const { ctx, zoom, render } = state;
    // const center = {
    //     x: render.width / 2,
    //     y: render.height / 2,
    // };
    // drawHyperTwistPlanet(ctx, center, zoom, time);

    // drawHyperTwistGrid(ctx, zoom, time, 50, state.clip.path);
}

function getTransition(zoom, min = 0.05, max = 5.0) {
    return (max - zoom) / (max - min);
}

// без скручивания точек
// function hyperTwistCircular(x, y, zoom) {
//     const t = getTransition(zoom);
//     const r = Math.sqrt(x * x + y * y);
//     const theta = Math.atan2(y, x);
//     const rNew = (1 - t) * r + t * Math.tanh(r);
//     const thetaNew = theta + t * Math.exp(-r);
//     return {
//         x: rNew * Math.cos(thetaNew),
//         y: rNew * Math.sin(thetaNew),
//     };
// }

function hyperTwistCircular(x, y, zoom, intensity = 2.5) {
    const t = getTransition(zoom);
    const r = Math.sqrt(x * x + y * y);
    const theta = Math.atan2(y, x);
    const rNew = (1 - t) * r + t * Math.tanh(r);
    const thetaNew = theta + t * intensity * Math.exp(-r);
    return {
        x: rNew * Math.cos(thetaNew),
        y: rNew * Math.sin(thetaNew),
    };
}

// function hyperTwistCircular(x, y, zoom, intensity = 1.0) {
//     const t = getTransition(zoom); // от 1 (далеко) до 0 (вблизи)
//     const r = Math.sqrt(x * x + y * y);
//     const theta = Math.atan2(y, x);

//     // Подогнанное вихревое поле
//     const A = 69.98;
//     const B = 54.15;
//     const omega = A / Math.pow(1 + r, B); // вихревая угловая скорость

//     // Геометрическое скручивание
//     const thetaNew = theta + t * intensity * omega; // t → приближение усиливает
//     const rNew = r; // можно добавить tanh(r) или подобное при желании

//     return {
//         x: rNew * Math.cos(thetaNew),
//         y: rNew * Math.sin(thetaNew),
//     };
// }

//ПЛАНЕТА КЛАССИК
// function drawHyperTwistPlanet(ctx, center, zoom, time) {
//     const baseRadius = 150;
//     const transition = getTransition(zoom);
//     const radius = baseRadius * (zoom / (1 + zoom));
//     const x = center.x;
//     const y = center.y;
//     const spinAngle = (time * 0.001) % (Math.PI * 2);
//     const axialTilt = (23.5 * Math.PI) / 180;

//     ctx.save();
//     ctx.translate(x, y);
//     ctx.rotate(axialTilt);

//     // Контур планеты
//     ctx.beginPath();
//     for (let i = 0; i <= 360; i++) {
//         const θ = (i / 360) * Math.PI * 2;
//         const dx = Math.cos(θ) * radius;
//         const flatten = 1 - transition * 0.8;
//         const dy = Math.sin(θ) * radius * flatten;
//         const p = hyperTwistCircular(dx, dy, zoom);
//         if (i === 0) ctx.moveTo(p.x, p.y);
//         else ctx.lineTo(p.x, p.y);
//     }
//     ctx.closePath();
//     ctx.shadowColor = 'rgba(100,200,255,0.4)';
//     ctx.shadowBlur = 25;
//     ctx.fillStyle = '#3af';
//     ctx.fill();
//     ctx.shadowBlur = 0;
//     ctx.strokeStyle = '#08f';
//     ctx.lineWidth = 2;
//     ctx.stroke();

//     // Сетка: меридианы
//     const nMeridians = 12;
//     const nParallels = 6;
//     ctx.strokeStyle = 'rgba(255,255,255,0.3)';
//     ctx.lineWidth = 1;

//     for (let i = 0; i < nMeridians; i++) {
//         const θ0 = (i / nMeridians) * Math.PI * 2;
//         ctx.beginPath();
//         for (let j = 0; j <= 100; j++) {
//             const φ = (j / 100) * Math.PI - Math.PI / 2;
//             const dx = Math.cos(θ0 + spinAngle) * Math.cos(φ) * radius;
//             const dy = Math.sin(φ) * radius * (1 - transition * 0.8);
//             const p = hyperTwistCircular(dx, dy, zoom);
//             if (j === 0) ctx.moveTo(p.x, p.y);
//             else ctx.lineTo(p.x, p.y);
//         }
//         ctx.stroke();
//     }

//     // Сетка: параллели
//     for (let j = 1; j < nParallels; j++) {
//         const φ = (j / (nParallels + 1)) * Math.PI - Math.PI / 2;
//         const dy = Math.sin(φ) * radius * (1 - transition * 0.8);
//         const r0 = Math.abs(Math.cos(φ) * radius);
//         ctx.beginPath();
//         for (let i = 0; i <= 100; i++) {
//             const θ = (i / 100) * Math.PI * 2;
//             const dx = Math.cos(θ) * r0;
//             const p = hyperTwistCircular(dx, dy, zoom);
//             if (i === 0) ctx.moveTo(p.x, p.y);
//             else ctx.lineTo(p.x, p.y);
//         }
//         ctx.stroke();
//     }

//     ctx.restore();
// }

// # ----- ----- ------- - -- - - - - - -
// function drawHyperTwistGrid(ctx, zoom, time, gridSize = 50) {
//     const extent = 5;
//     const step = (extent * 2) / gridSize;

//     ctx.save();

//     const canvasWidth = ctx.canvas.width / window.devicePixelRatio;
//     const canvasHeight = ctx.canvas.height / window.devicePixelRatio;
//     const scale = Math.min(canvasWidth, canvasHeight) / (extent * 2);

//     ctx.translate(canvasWidth / 2, canvasHeight / 2);
//     ctx.scale(scale, -scale);

//     const intensity = 2.5 * Math.sin(time * 0.001);
//     const spinAngle = (time * 0.0002) % (2 * Math.PI);
//     const axialTilt = (23.5 * Math.PI) / 180;

//     const cosTilt = Math.cos(axialTilt);
//     const sinTilt = Math.sin(axialTilt);

//     for (let i = -extent; i <= extent; i += step) {
//         for (let j = -extent; j <= extent; j += step) {
//             const r0 = Math.sqrt(i * i + j * j);
//             if (r0 > extent) continue; // ⛔️ пропустить точки за пределами круга

//             const alpha = Math.max(0, 1 - (r0 / extent) ** 2); // плавный край

//             // Поворот оси
//             const xT = i * cosTilt - j * sinTilt;
//             const yT = i * sinTilt + j * cosTilt;

//             // Вращение
//             const r = Math.sqrt(xT * xT + yT * yT);
//             const theta = Math.atan2(yT, xT) + spinAngle;
//             const xRot = r * Math.cos(theta);
//             const yRot = r * Math.sin(theta);

//             // Гиперскручивание
//             const p = hyperTwistCircular(xRot, yRot, zoom, intensity);

//             ctx.beginPath();
//             ctx.arc(p.x, p.y, 0.03, 0, 2 * Math.PI);
//             ctx.fillStyle = `rgba(255, 200, 255, 0.6)`;
//             ctx.fill();
//         }
//     }

//     ctx.restore();
// }

function computeHyperTwistGeodesicPath(R0, steps = 1000, dt = 0.01) {
    const path = [];
    let r = R0;
    let theta = 0;
    let ur = 0;
    let ut = 1.0 / r; // начальная угловая скорость

    for (let i = 0; i < steps; i++) {
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        path.push({ x, y });

        // Производные метрики: приближённый вариант для g_{\theta\theta} = r^2(1 + \lambda / (1 + r)^2)
        const lambda = 1.0;
        const gtt = r * r * (1 + lambda / (1 + r) ** 2);
        const dgtt_dr = 2 * r * (1 + lambda / (1 + r) ** 2) - (2 * r * r * lambda) / (1 + r) ** 3;

        const Gamma_r_tt = -0.5 * dgtt_dr;
        const Gamma_t_rt = 1 / r; // приближённо

        const d2r = -Gamma_r_tt * ut * ut;
        const d2t = (-2 * ur * ut) / r;

        ur += d2r * dt;
        ut += d2t * dt;
        r += ur * dt;
        theta += ut * dt;
    }
    return path;
}

function project3D(x, y, z, perspective = 4) {
    const scale = 1 / (1 + z / perspective);
    return { x: x * scale, y: y * scale };
}

function drawHyperTwistGrid(ctx, zoom, time, gridSize = 50, clipPath = null) {
    const extent = 5;
    const step = (extent * 2) / gridSize;

    ctx.save();

    if (clipPath) {
        ctx.clip(clipPath);
    }

    const canvasWidth = ctx.canvas.width / window.devicePixelRatio;
    const canvasHeight = ctx.canvas.height / window.devicePixelRatio;
    const scale = Math.min(canvasWidth, canvasHeight) / (extent * 2);

    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.scale(scale, -scale);

    const transition = getTransition(zoom);
    const minTilt = Math.PI / 12;
    const maxTilt = Math.PI / 4;
    const axialTilt = minTilt + (maxTilt - minTilt) * (1 - transition);

    const intensity = 2.5 * Math.sin(time * 0.001);
    const spinAngle = -(time * 0.0002) % (2 * Math.PI);

    const cosTilt = Math.cos(axialTilt);
    const sinTilt = Math.sin(axialTilt);
    const baseDrop = -1.5;
    const drop = baseDrop * (1 - transition);
    const globalDrop = 2.0 * (1 - transition);

    for (let i = -extent; i <= extent; i += step) {
        for (let j = -extent; j <= extent; j += step) {
            const r0 = Math.sqrt(i * i + j * j);
            if (r0 > extent) continue;

            const alpha = Math.max(0, 1 - (r0 / extent) ** 2);

            let x3d = i * cosTilt - j * sinTilt;
            let y3d = i * sinTilt + j * cosTilt;
            let z3d = 0.3 * r0 ** 2 * (1 - transition) + drop + globalDrop;

            const r = Math.sqrt(x3d * x3d + y3d * y3d);
            const theta = Math.atan2(y3d, x3d) + spinAngle;
            const xRot = r * Math.cos(theta);
            const yRot = r * Math.sin(theta);

            const depthScale = -0.5;
            const p = hyperTwistCircular(xRot, yRot - z3d * depthScale, zoom, intensity);

            ctx.beginPath();
            ctx.arc(p.x, p.y, 0.03, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255, 200, 255, ${0.8 * alpha})`;
            ctx.fill();
        }
    }
    if (transition < 0.5) {
        const diskAlpha = 1 - transition * 2;
        const diskRadius = 1.5;
        const axialTilt = Math.PI / 4; // максимальный наклон
        const perspective = 4;

        const cosTilt = Math.cos(axialTilt);
        const sinTilt = Math.sin(axialTilt);

        const points = [];

        for (let a = 0; a <= 360; a += 2) {
            const θ = (a * Math.PI) / 180;
            const x = Math.cos(θ) * diskRadius;
            const y = Math.sin(θ) * diskRadius;
            const z = 0;

            // Поворот вокруг оси X (наклон тарелки от нас внутрь)
            const y1 = y * cosTilt - z * sinTilt;
            const z1 = y * sinTilt + z * cosTilt;

            const proj = project3D(x, y1, z1, perspective);
            points.push(proj);
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = `rgba(80, 160, 255, ${diskAlpha * 0.2})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${diskAlpha * 0.3})`;
        ctx.lineWidth = 0.05;
        ctx.stroke();
    }

    ctx.restore();
}

export default SinkHole;
