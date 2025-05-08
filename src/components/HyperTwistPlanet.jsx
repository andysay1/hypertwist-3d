import { useRef, useEffect } from 'react';

/** Переход от twist 0 — близко, 1 — далеко] по зуму */
function getTransition(zoom, min = 0.05, max = 5.0) {
    return (max - zoom) / (max - min);
}

/** Аналог Python-функции hyper_twist_circular */
function hyperTwistCircular(x, y, zoom, intensity = 2.5) {
    const t = getTransition(zoom);
    const r = Math.sqrt(x * x + y * y);
    const theta = Math.atan2(y, x);
    // const rNorm = r / (r + 1e-3);
    // const rNew = (1 - t) * rNorm + t * Math.tanh(r);
    const rNew = (1 - t) * r + t * Math.tanh(r);

    const thetaNew = theta + t * intensity * Math.exp(-r);
    return {
        x: rNew * Math.cos(thetaNew),
        y: rNew * Math.sin(thetaNew),
    };
}

/**
 * Рисует сетку точек с искажением HyperTwist
 * @param {Object} props
 * @param {CanvasRenderingContext2D} props.ctx
 * @param {number} props.zoom
 * @param {number} props.time
 * @param {number} [props.gridSize=50]
 */
export default function HyperTwistGrid({ ctx, zoom, time, gridSize = 50 }) {
    const extent = 5;
    const step = (extent * 2) / gridSize;

    ctx.save();

    const dpi = window.devicePixelRatio || 1;
    const canvasWidth = ctx.canvas.width / dpi;
    const canvasHeight = ctx.canvas.height / dpi;
    const scale = Math.min(canvasWidth, canvasHeight) / (extent * 2);

    ctx.scale(dpi, dpi); // чтобы единицы = пикселям
    ctx.translate(canvasWidth / 22, canvasHeight / 22); // центр
    ctx.scale(scale, -scale); // масштабируем и переворачиваем Y вверх

    const intensity = 2.5 * Math.sin(time * 0.001);
    for (let i = -extent; i <= extent; i += step) {
        for (let j = -extent; j <= extent; j += step) {
            const p = hyperTwistCircular(i, j, zoom, intensity);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 0.03, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255, 200, 255, 0.6)`;
            ctx.fill();
        }
    }

    ctx.restore();
}
