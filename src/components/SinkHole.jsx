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
            globalScale: 1.0,
            twistStrength: 2, // начальная сила скручивания
            twistPhase: 2, // начальный сдвиг вращения
            twistAngle: 2,
            modulationHistory: [],

            starfield: Array.from({ length: 300 }, () => ({
                x: Math.random(),
                y: Math.random(),
                size: 0.5 + Math.random() * 1.5,
                brightness: 0.5 + Math.random() * 0.5,
                flickerSpeed: 0.5 + Math.random() * 1.5,
            })),
            photons: Array.from({ length: 15 }, (_, i) => ({
                x: -1.5, // старт слева
                y: -0.7 + i * 0.1, // разброс по вертикали
                path: [],
            })),
        });

        const onWheel = (e) => {
            e.preventDefault();
            const zoomFactor = 1.05;
            if (e.shiftKey) {
                // Глобальное приближение всей сцены
                if (e.deltaY < 0) {
                    state.globalScale *= zoomFactor;
                } else {
                    state.globalScale /= zoomFactor;
                }
                state.globalScale = Math.max(0.1, Math.min(4.0, state.globalScale));
            } else {
                // Локальный зум (внутренние эффекты HyperTwist)
                if (e.deltaY < 0) {
                    state.zoom *= zoomFactor;
                } else {
                    state.zoom /= zoomFactor;
                }
                state.zoom = Math.min(5.0, Math.max(0.05, state.zoom));
            }
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

function stepPhotonGeodesic(p, dt = 0.01) {
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    const eps = 0.001;
    const grr = g_rr(r);
    const grr_p = g_rr(r + eps);
    const grr_m = g_rr(r - eps);
    const dgrr = (grr_p - grr_m) / (2 * eps);

    const dMetricR = Math.sqrt(grr) + (r * dgrr) / (2 * Math.sqrt(grr));

    // Направление света — вправо по x, y — отклоняется
    const vx = 1.0;
    const vy = -dMetricR * (p.y / r); // градиент вверх/вниз

    return {
        x: p.x + dt * vx,
        y: p.y + dt * vy,
        path: [...p.path, [p.x, p.y]],
    };
}

function drawPhotons(ctx, state) {
    const { render, zoom, startDisc } = state;
    const cx = startDisc.x;
    const cy = startDisc.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,0,0.5)';
    ctx.lineWidth = 1;

    state.photons.forEach((p) => {
        const path = p.path.map(([x, y]) => {
            const twist = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
            return [cx + twist.x * render.width * 0.2, cy + twist.y * render.height * 0.2];
        });

        ctx.beginPath();
        path.forEach(([px, py], i) => {
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();
    });

    ctx.restore();
}

function drawRadialLightBeams(ctx, state) {
    const { startDisc, render } = state;
    const cx = startDisc.x;
    const cy = startDisc.y;

    ctx.save();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';

    const count = 60;
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI;
        const rMax = Math.max(render.width, render.height);
        const x = cx + Math.cos(angle) * rMax;
        const y = cy + Math.sin(angle) * rMax;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    ctx.restore();
}

/* ======================================================================== */
/*                               helpers                                    */
/* ======================================================================== */

function g_rr(r) {
    const numerator = Math.PI * r * r + 16 * Math.pow(r * r + 2 * r + 1, 2);
    const denominator = 16 * Math.pow(1 + r, 6);
    return numerator / denominator;
}

function phiField(x, y) {
    const r = Math.sqrt(x * x + y * y);
    return Math.exp(-r * r);
}

function gradPhiField(x, y) {
    const r = Math.sqrt(x * x + y * y);
    if (r === 0) return { dx: 0, dy: 0 };
    const phi = Math.exp(-r * r);
    const dPhiDr = -2 * r * phi;
    return {
        dx: dPhiDr * (x / r),
        dy: dPhiDr * (y / r),
    };
}

function getTimeColorByPhi(phi) {
    const t = Math.min(1, Math.max(0, phi)); // [0,1]
    const r = Math.round(255 * (1 - t)); // φ→0 → r=255 (красный)
    const g = Math.round(100 * t); // φ→1 → g=100 (зеленоватый)
    const b = Math.round(255 * t); // φ→1 → b=255 (синий)
    return `rgba(${r},${g},${b},0.4)`; // прозрачный ореол
}

function stepFallByMetric(p, dt = 0.01) {
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    if (r === 0) return p;

    // Вычисляем производную от r * √g_rr(r)
    const eps = 0.001;
    const grr = g_rr(r);
    const grr_p = g_rr(r + eps);
    const grr_m = g_rr(r - eps);
    const dgrr = (grr_p - grr_m) / (2 * eps);

    const dMetricR = Math.sqrt(grr) + (r * dgrr) / (2 * Math.sqrt(grr));

    const vx = -dMetricR * (p.x / r);
    const vy = -dMetricR * (p.y / r);

    return {
        x: p.x + dt * vx,
        y: p.y + dt * vy,
        path: [...p.path, [p.x, p.y]],
    };
}

function stepReflectedFlowParticle(p, dt = 0.01) {
    const grad = gradPhiField(p.x, p.y);
    const vx = grad.dx; // обратное направление
    const vy = grad.dy;
    return {
        x: p.x + dt * vx,
        y: p.y + dt * vy,
        path: [...p.path, [p.x, p.y]],
    };
}

function drawFlowPath(ctx, state) {
    if (state.flowParticle) {
        drawPath(ctx, state.flowParticle.path, state, 'cyan');
    }
    if (state.reflectedParticle) {
        drawPath(ctx, state.reflectedParticle.path, state, 'orange');
    }
}

function drawPath(ctx, path, state, color) {
    const { render, zoom, startDisc } = state;
    const cx = startDisc.x;
    const cy = startDisc.y;

    ctx.beginPath();
    path.forEach(([x, y], i) => {
        const twisted = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
        const px = cx + twisted.x * render.width * 0.2;
        const py = cy + twisted.y * render.height * 0.2;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
}

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

function tweenDisc(disc, state) {
    const { startDisc: s, endDisc: e } = state;
    disc.x = tween(s.x, e.x, disc.p);
    disc.y = tween(s.y, e.y, disc.p, 'inExpo');
    disc.w = tween(s.w, e.w, disc.p);
    disc.h = tween(s.h, e.h, disc.p);
    return disc;
}

function emitCoreSinkParticles(state) {
    // Инициализация списка частиц, если они ещё не были созданы
    if (!state.coreSinkParticles) state.coreSinkParticles = [];
    // Если текущие частицы не превышают 100, добавляем новые
    if (state.coreSinkParticles.length < 100) {
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * 2 * Math.PI;
            state.coreSinkParticles.push({
                r: 2.5 + Math.random(), // случайный радиус
                θ: angle,
                v: 0.01 + Math.random() * 0.005, // скорость падения
                omega: 0.02 + Math.random() * 0.01,
                alpha: 1.0, // начальная прозрачность
                color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`,
                phase: 'descend', // начальная фаза
            });
        }
    }
}
function emitUpwardStreamParticles(state) {
    if (!state.upwardStream) state.upwardStream = [];

    const MAX_STREAM_PARTICLES = 200;
    const BATCH = 6;

    if (state.upwardStream.length < MAX_STREAM_PARTICLES) {
        for (let i = 0; i < BATCH; i++) {
            state.upwardStream.push({
                xOffset: (Math.random() - 0.5) * 0.2, // небольшое горизонтальное отклонение
                y: 0,
                v: 1.2 + Math.random() * 1.3, // скорость вверх
                alpha: 1.0,
                size: 1.5 + Math.random() * 1.0,
                color: `hsla(200, 100%, 80%, 1)`,
            });
        }
    }
}

function drawUpwardStreamParticles(ctx, state) {
    const { render, endDisc, startDisc } = state;
    const cx = endDisc.x;
    const cy = 395;
    const targetY = startDisc.y;

    state.upwardStream.forEach((p) => {
        p.y += p.v;
        p.alpha -= 0.005;

        const px = cx + p.xOffset * render.width * 0.05;
        const py = cy - p.y;

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    });

    state.upwardStream = state.upwardStream.filter((p) => p.alpha > 0 && cy - p.y > targetY);
    emitUpwardStreamParticles(state);
}

function emitResonatorParticles(state) {
    if (!state.resonanceParticles) state.resonanceParticles = [];
    if (state.resonanceParticles.length < 100) {
        // сниженное количество
        for (let i = 0; i < 2; i++) {
            state.resonanceParticles.push({
                r: Math.random(),
                θ: Math.random() * 2 * Math.PI,
                v: 0.015 + Math.random() * 0.005,
                omega: 0.03 + Math.random() * 0.015,
                alpha: 1.0,
                color: `hsla(${Math.random() * 360}, 100%, 70%, 1)`,
            });
        }
    }
}

function drawResonatorParticles(ctx, state) {
    if (!state.resonanceParticles) return;

    const { render, zoom } = state;
    const cx = state.startDisc.x;
    const cy = state.startDisc.y;

    state.resonanceParticles.forEach((p) => {
        // Обновляем координаты
        p.r += p.v;
        p.θ += p.omega;

        // Переход в фазу "escape"
        if (p.phase !== 'escape' && p.r >= 111.5) {
            p.phase = 'escape';
            p.v = 0.02 + Math.random() * 0.01;
        }

        // Отражение только если НЕ escape
        if (p.phase !== 'escape' && p.r <= 0.05) {
            p.v *= -1;
        }

        const x = p.r * Math.cos(p.θ);
        const y = p.r * Math.sin(p.θ);
        const twisted = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
        const px = cx + twisted.x * render.width * 0.2;
        const rReference = 0.45; // уровень Земли
        const zLiftReference = rReference * Math.sqrt(g_rr(rReference)) * render.height * 0.08;
        const zLift = zLiftReference;
        const py = cy - zLift + twisted.y * render.height * 0.2;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, 2 * Math.PI);
        ctx.fill();
    });

    ctx.globalAlpha = 1.0;
    state.resonanceParticles = state.resonanceParticles.filter((p) => {
        // Быстрее исчезают те, что убегают
        p.alpha -= p.phase === 'escape' ? 0.002 : 0.003;
        return p.alpha > 0;
    });

    emitResonatorParticles(state);
}

function drawFourierSpectrum(ctx, state) {
    const { modulationHistory, render } = state;
    if (!modulationHistory || modulationHistory.length < 32) return;

    const W = 150;
    const H = 80;
    const x0 = render.width - W - 10;
    const y0 = render.height - H - 20;

    const N = modulationHistory.length;
    const re = new Array(N).fill(0);
    const im = new Array(N).fill(0);
    const spectrum = [];

    for (let k = 0; k < N / 2; k++) {
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            re[k] += modulationHistory[n] * Math.cos(angle);
            im[k] -= modulationHistory[n] * Math.sin(angle);
        }
        const mag = Math.sqrt(re[k] ** 2 + im[k] ** 2);
        spectrum.push(mag);
    }

    const max = Math.max(...spectrum);
    const peakIndex = spectrum.indexOf(max);

    ctx.save();
    ctx.strokeStyle = 'aqua';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < spectrum.length; i++) {
        const px = x0 + (i / spectrum.length) * W;
        const py = y0 + H - (spectrum[i] / max) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // сетка по оси Y
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 0.5;
    for (let j = 0; j <= 4; j++) {
        const y = y0 + (j / 4) * H;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + W, y);
        ctx.stroke();
    }

    // выделим пиковую частоту
    const peakX = x0 + (peakIndex / spectrum.length) * W;
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(peakX, y0);
    ctx.lineTo(peakX, y0 + H);
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = '10px sans-serif';
    ctx.fillText('Freq', x0 + W / 2 - 10, y0 + H + 12);
    ctx.fillText('Amp', x0 - 25, y0 + 10);
    ctx.fillText(`Peak: ${peakIndex}`, x0 + 5, y0 + 12);

    ctx.restore();
}

function emitCentralSpiralParticles(state) {
    if (!state.centralSpiral) state.centralSpiral = [];

    const MAX = 80;
    const BATCH = 4;

    if (state.centralSpiral.length < MAX) {
        for (let i = 0; i < BATCH; i++) {
            state.centralSpiral.push({
                r: 0.01 + Math.random() * 0.1,
                θ: Math.random() * Math.PI * 2,
                v: 0.008 + Math.random() * 0.005,
                omega: 0.1 + Math.random() * 0.05,
                alpha: 1.0,
                color: `hsla(${180 + Math.random() * 60}, 100%, 75%, 1)`,
            });
        }
    }
}

function drawCentralSpiralParticles(ctx, state) {
    const { render, zoom, startDisc } = state;
    const cx = startDisc.x;
    const cy = startDisc.y;

    if (!state.centralSpiral) return;

    state.centralSpiral.forEach((p) => {
        p.r += p.v;
        p.θ += p.omega;
        p.alpha -= 0.004;

        const x = p.r * Math.cos(p.θ);
        const y = -p.r * 0.5; // строго вверх
        const z = p.r * 0.4; // эффект вертикального вытягивания

        const twist = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
        const px = cx + twist.x * render.width * 0.2;
        const py = cy + twist.y * render.height * 0.2 - z * render.height * 0.05;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, 2 * Math.PI);
        ctx.fill();
    });

    state.centralSpiral = state.centralSpiral.filter((p) => p.alpha > 0);
    ctx.globalAlpha = 1.0;
    emitCentralSpiralParticles(state);
}

function tick(state) {
    if (!state.twistPhase) state.twistPhase = 0;
    state.twistPhase += 0.002; // скорость общего вращения
    state.twistAngle = state.twistPhase;

    const avgResonanceRadius = (state.resonanceParticles?.reduce((sum, p) => sum + p.r, 0) ?? 0) / (state.resonanceParticles?.length || 1);

    state.modulationHistory.push(avgResonanceRadius);
    if (state.modulationHistory.length > 1024) {
        state.modulationHistory.shift(); // ограничим длину
    }

    const { ctx, canvas, render } = state;
    if (!state.centerBursts) state.centerBursts = [];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(render.dpi, render.dpi);

    // применим глобальный масштаб:
    ctx.translate(render.width / 2, render.height / 2);
    ctx.scale(state.globalScale, state.globalScale);
    ctx.translate(-render.width / 2, -render.height / 2);

    moveDiscs(state);
    // moveParticles(state);
    emitUpwardStreamParticles(state);
    drawUpwardStreamParticles(ctx, state);
    // state.photons = state.photons.map((p) => stepPhotonGeodesic(p));
    // drawPhotons(ctx, state);
    // drawCentralSource(ctx, state);
    // drawCentralSpiralParticles(ctx, state);

    // emitCoreSinkParticles(state);
    // drawCoreSinkParticles(ctx, state);
    drawResonatorParticles(ctx, state);
    emitResonatorParticles(state);
    // emitCoreSpiralParticles(state);
    // drawCoreSpiralParticles(ctx, state);
    drawFourierSpectrum(ctx, state);
    // drawCentralSource(ctx, state);

    drawDiscsAndLines(state, performance.now());
    drawStarfield(ctx, state, performance.now());
    drawRadialLightBeams(ctx, state);

    drawOrbitalPlanes(state);
    drawOrbitingPlanets(state, performance.now());

    if (state.focusTarget !== undefined) {
        const targetZoom = 3 / state.focusTarget; // например
        const ease = 0.1;
        state.zoom += (targetZoom - state.zoom) * ease;
    }

    drawGrPlot(ctx, state);

    // if (!state.flowParticle) state.flowParticle = initFlowParticle();
    // state.flowParticle = stepFlowParticle(state.flowParticle);

    // if (!state.reflectedParticle) state.reflectedParticle = initReflectedFlowParticle();
    // state.reflectedParticle = stepReflectedFlowParticle(state.reflectedParticle);

    // drawFlowPath(ctx, state);

    ctx.restore();
    state.raf = requestAnimationFrame(() => tick(state));
}

function drawStarfield(ctx, state, t) {
    const { render, starfield, globalScale } = state;

    ctx.save();
    ctx.globalAlpha = 0.6;
    starfield.forEach((star) => {
        const flicker = 0.7 + 0.3 * Math.sin(t * 0.001 * star.flickerSpeed);
        const px = star.x * render.width;
        const py = star.y * render.height;
        const size = star.size * globalScale;

        ctx.beginPath();
        ctx.arc(px, py, size, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255,255,255,${flicker * star.brightness})`;
        ctx.fill();
    });
    ctx.restore();
}

function det_g(r) {
    return g_rr(r) * g_θθ(r);
}

function drawGrPlot(ctx, state) {
    const { render } = state;
    const W = 150;
    const H = 100;
    const x0 = render.width - W - 10;
    const y0 = 10;

    // Границы осей
    const rMin = 0;
    const rMax = 2;
    const grMin = 0;
    const grMax = 1.2;

    // Основа
    ctx.save();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, W, H);

    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
        const r = rMin + (rMax - rMin) * (i / 100);
        const gr = g_rr(r);
        const px = x0 + ((r - rMin) / (rMax - rMin)) * W;
        const py = y0 + H - ((gr - grMin) / (grMax - grMin)) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }

    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Подпись
    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.fillText('g_rr(r)', x0 + 5, y0 + 15);

    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
        const r = rMin + (rMax - rMin) * (i / 100);
        const gθθ = g_θθ(r);
        const px = x0 + ((r - rMin) / (rMax - rMin)) * W;
        const py = y0 + H - ((gθθ - 0) / (1.2 - 0)) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'orange';
    ctx.stroke();
    ctx.fillText('g_θθ(r)', x0 + 5, y0 + 30);

    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
        const r = rMin + (rMax - rMin) * (i / 100);
        const detg = Math.sqrt(Math.abs(det_g(r)));
        const px = x0 + ((r - rMin) / (rMax - rMin)) * W;
        const py = y0 + H - ((detg - 0) / (1.2 - 0)) * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'purple';
    ctx.stroke();
    ctx.fillText('√|det g|', x0 + 5, y0 + 45);
}

function moveDiscs(state) {
    state.discs.forEach((d) => {
        d.p = (d.p + 0.001) % 1;
        tweenDisc(d, state);
    });
}

function predictSpinTiltInterpolated(r) {
    // Кубическая интерполяция вручную
    // Таблица значений r и tilt из Python
    const rs = [0.2, 0.32, 0.45, 0.6, 0.8, 1.05, 1.25, 1.45];
    const tilts = [0.03, 177.4, 23.44, 25.19, 3.13, 26.7, 97.8, 28.3];

    // Поиск интервала
    for (let i = 1; i < rs.length; i++) {
        if (r <= rs[i]) {
            const x0 = rs[i - 1],
                x1 = rs[i];
            const y0 = tilts[i - 1],
                y1 = tilts[i];
            const t = (r - x0) / (x1 - x0);

            // Простейшая сглаженная интерполяция (линейная)
            return (1 - t) * y0 + t * y1;
        }
    }

    // За пределами диапазона — clamp to edge
    return tilts[tilts.length - 1];
}

function drawOrbitingPlanets(state, time) {
    const { ctx, render, zoom, startDisc } = state;

    const cx = startDisc.x;
    const cy = startDisc.y;
    const t = time * 0.001;

    const planets = [
        { name: 'Mercury', radius: 0.2, size: 3, period: 88, color: '#aaa', spinTilt: predictSpinTiltInterpolated(0.2) },
        { name: 'Venus', radius: 0.32, size: 4, period: 225, color: '#c96', spinTilt: predictSpinTiltInterpolated(0.32) },
        { name: 'Earth', radius: 0.45, size: 5, period: 365, color: '#3af', spinTilt: predictSpinTiltInterpolated(0.45) },
        { name: 'Mars', radius: 0.6, size: 4, period: 687, color: '#f33', spinTilt: predictSpinTiltInterpolated(0.6) },
        { name: 'Jupiter', radius: 0.8, size: 8, period: 4333, color: '#fb0', spinTilt: predictSpinTiltInterpolated(0.8) },
        { name: 'Saturn', radius: 1.05, size: 7, period: 10759, color: '#edc', spinTilt: predictSpinTiltInterpolated(1.05) },
        { name: 'Uranus', radius: 1.25, size: 6, period: 30685, color: '#9cf', spinTilt: predictSpinTiltInterpolated(1.25) },
        { name: 'Neptune', radius: 1.45, size: 6, period: 60190, color: '#36f', spinTilt: predictSpinTiltInterpolated(1.45) },
    ];

    ctx.save();

    const A = 3.5 + Math.sin(t * 0.1) * 0.5;
    const B = 2.2 + Math.cos(t * 0.07) * 0.3;

    // Солнце
    const pulse = 2 + Math.sin(t * 3) * 1.5;
    const baseRadius = 10 + pulse;

    // Центр (r = 0), поэтому подъём по g_rr(0)
    const rEarth = 0.45;
    const zLiftSun = rEarth * Math.sqrt(g_rr(rEarth)) * render.height * 0.08;
    const sunX = cx;
    const sunY = cy - zLiftSun;

    // Анимация смещения (вращение свечения)
    const spin = (t * 0.1) % (2 * Math.PI);
    const xOffset = Math.cos(spin) * baseRadius * 0.2;
    const yOffset = Math.sin(spin) * baseRadius * 0.2;

    // убрать вращение свечения
    const gradient = ctx.createRadialGradient(sunX, sunY, baseRadius * 0.3, sunX, sunY, baseRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 100, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 180, 0, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

    ctx.beginPath();
    ctx.arc(sunX + xOffset, sunY + yOffset, baseRadius, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(255, 200, 100, 0.5)';
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;

    planets.forEach(({ name, radius, size, period, color, spinTilt }) => {
        const omega_orbit = (2 * Math.PI) / period;
        const angle = omega_orbit * t;

        const scaleθ = (3 * Math.sqrt(g_θθ(radius))) / radius;
        const rawX = radius * Math.cos(angle) * scaleθ;
        const rawY = radius * Math.sin(angle) * scaleθ;
        const twisted = hyperTwistCircular(rawX, rawY, zoom, state.twistStrength, state.twistAngle);
        const px = cx + twisted.x * render.width * 0.2;

        const zLift = radius * Math.sqrt(g_rr(radius)) * render.height * 0.08;
        const py = cy - zLift + twisted.y * render.height * 0.2;

        const phi = phiField(rawX, rawY);

        ctx.beginPath();
        ctx.arc(px, py, size + 5, 0, 2 * Math.PI);
        ctx.fillStyle = getTimeColorByPhi(phi);
        ctx.fill();

        const omega_spin = A / Math.pow(1 + radius, B);
        const spinAngle = t * omega_spin;

        const tiltRad = (spinTilt * Math.PI) / 180;
        const tiltLength = size * 1.5;
        const dx = tiltLength * Math.cos(tiltRad);
        const dy = tiltLength * Math.sin(tiltRad);

        ctx.fillStyle = 'white';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${name}`, px + size + 6, py - 6);
        ctx.fillText(`${spinTilt.toFixed(1)}°`, px + size + 6, py + 6);

        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx, py - dy);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.stroke();

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

    ctx.restore();
}

function drawOrbitalPlanes(state) {
    const { ctx, render, zoom, startDisc } = state;

    const cx = startDisc.x;
    const cy = startDisc.y;

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
            const scaleθ = (3 * Math.sqrt(g_θθ(radius))) / radius;
            const x = radius * Math.cos(θ) * scaleθ;
            const y = radius * Math.sin(θ) * scaleθ;

            const twisted = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
            const px = cx + twisted.x * render.width * 0.2;

            // Добавим подъём орбит над воронкой
            const zLift = radius * Math.sqrt(g_rr(radius)) * render.height * 0.08;
            const py = cy - zLift + twisted.y * render.height * 0.2;

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

function drawDiscsAndLines(state, time) {
    const { ctx, startDisc, render, zoom, globalScale, twistStrength } = state;
    const cx = startDisc.x;
    const cy = startDisc.y;

    const t = time * 0.001;
    const zoomScale = getTransition(zoom);
    const rMax = 1.5 + 13.0 * globalScale * (1 - zoomScale);

    const stepsTheta = 100;
    const totalDiscs = 80;
    const totalLines = 60;

    ctx.lineWidth = 0.5;

    // --- Радиальные линии строго по гиперскручиванию ---
    ctx.strokeStyle = '#555';
    ctx.globalAlpha = 0.4;

    for (let i = 0; i < totalLines; i++) {
        const θ0 = (i / totalLines) * 2 * Math.PI;

        ctx.beginPath();
        for (let j = 0; j <= totalDiscs; j++) {
            const r = (j / totalDiscs) * rMax;
            const x = r * Math.cos(θ0);
            const y = r * Math.sin(θ0);

            const twisted = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
            const px = cx + twisted.x * render.width * 0.2;

            const liftFactor = 0.08 * Math.exp(-r * 1.5); // быстро убывает
            const zLift = r * Math.sqrt(g_rr(r)) * render.height * liftFactor;
            const py = cy - zLift + twisted.y * render.height * 0.2;

            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }

    // --- Концентрические окружности строго по g_θθ ---
    ctx.strokeStyle = '#333';
    ctx.globalAlpha = 0.6;

    for (let j = 0; j < totalDiscs; j++) {
        const r = (j / totalDiscs) * rMax;

        ctx.beginPath();
        for (let i = 0; i <= stepsTheta; i++) {
            const θ = (i / stepsTheta) * 2 * Math.PI;
            const x = r * Math.cos(θ);
            const y = r * Math.sin(θ);

            const twisted = hyperTwistCircular(x, y, zoom, state.twistStrength, state.twistAngle);
            const px = cx + twisted.x * render.width * 0.2;

            const zLift = r * Math.sqrt(g_rr(r)) * render.height * 0.08;
            const py = cy - zLift + twisted.y * render.height * 0.2;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
}

function project3D(x, y, z, perspective = 4) {
    const scale = 1 / (1 + z / perspective);
    return {
        x: x * scale,
        y: y * scale,
    };
}

function getTransition(zoom, min = 0.05, max = 5.0) {
    const t = (max - zoom) / (max - min);
    return Math.max(0, Math.min(1, t));
}

function g_rθ(r) {
    return (-Math.PI * r * r) / Math.pow(1 + r, 4);
}

function g_θθ(r) {
    return (r * r) / Math.pow(1 + r, 2);
}

function hyperTwistCircular(x, y, zoom, intensity = 2.5, twistPhase = 0) {
    const t = getTransition(zoom);
    const r = Math.sqrt(x * x + y * y);
    const theta = Math.atan2(y, x);

    const twistLocal = g_rθ(r) * intensity;
    const twistGlobal = twistPhase * Math.exp(-r * 1.5);

    const thetaNew = theta + t * (twistLocal + twistGlobal);

    const rMetric = r * Math.sqrt(g_rr(r));
    const rNew = (1 - t) * r + t * rMetric;

    return {
        x: rNew * Math.cos(thetaNew),
        y: rNew * Math.sin(thetaNew),
    };
}

export default SinkHole;
