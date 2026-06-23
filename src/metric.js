const EPS = 1e-6;

export function gRR(r) {
    const safeR = Math.max(0, r);
    const numerator = Math.PI * safeR * safeR + 16 * Math.pow(safeR * safeR + 2 * safeR + 1, 2);
    const denominator = 16 * Math.pow(1 + safeR, 6);
    return numerator / denominator;
}

export function gRT(r) {
    const safeR = Math.max(0, r);
    return (-Math.PI * safeR * safeR) / Math.pow(1 + safeR, 4);
}

function mixedTerm(r, includeTwist = true) {
    return includeTwist ? gRT(r) : 0;
}

export function gTT(r) {
    const safeR = Math.max(0, r);
    return (safeR * safeR) / Math.pow(1 + safeR, 2);
}

export function detG(r, includeTwist = true) {
    const grt = mixedTerm(r, includeTwist);
    return gRR(r) * gTT(r) - grt * grt;
}

export function circumferentialRadius(r) {
    return Math.sqrt(Math.max(0, gTT(r)));
}

export function radialStretch(r) {
    return Math.sqrt(Math.max(EPS, gRR(r)));
}

export function angularConnection(r, includeTwist = true) {
    return mixedTerm(r, includeTwist) / Math.max(EPS, gTT(r));
}

export function embeddingLift(r) {
    const safeR = Math.max(0, r);
    const drho = 1 / Math.pow(1 + safeR, 2);
    return Math.sqrt(Math.max(0, gRR(safeR) - drho * drho));
}

function derivative(fn, r, h = 1e-4) {
    const lo = Math.max(EPS, r - h);
    const hi = r + h;
    return (fn(hi) - fn(lo)) / (hi - lo);
}

function inverseMetric(r, includeTwist = true) {
    const grt = mixedTerm(r, includeTwist);
    const det = Math.max(EPS, detG(r, includeTwist));
    return [
        [gTT(r) / det, -grt / det],
        [-grt / det, gRR(r) / det],
    ];
}

function metricDerivative(r, includeTwist = true) {
    return [
        [derivative(gRR, r), includeTwist ? derivative(gRT, r) : 0],
        [includeTwist ? derivative(gRT, r) : 0, derivative(gTT, r)],
    ];
}

export function christoffel(r, includeTwist = true) {
    const inv = inverseMetric(r, includeTwist);
    const dg = metricDerivative(r, includeTwist);
    const gamma = Array.from({ length: 2 }, () =>
        Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => 0)),
    );

    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                let sum = 0;
                for (let l = 0; l < 2; l++) {
                    const dJ = j === 0 ? dg[l][k] : 0;
                    const dK = k === 0 ? dg[l][j] : 0;
                    const dL = l === 0 ? dg[j][k] : 0;
                    sum += inv[i][l] * (dJ + dK - dL);
                }
                gamma[i][j][k] = 0.5 * sum;
            }
        }
    }

    return gamma;
}

function christoffelDerivative(r, i, j, k, includeTwist = true) {
    return derivative((x) => christoffel(x, includeTwist)[i][j][k], r);
}

export function ricciScalar(r, includeTwist = true) {
    const safeR = Math.max(1e-3, r);
    const gamma = christoffel(safeR, includeTwist);
    const inv = inverseMetric(safeR, includeTwist);
    const ricci = [
        [0, 0],
        [0, 0],
    ];

    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            let value = 0;
            for (let k = 0; k < 2; k++) {
                value += k === 0 ? christoffelDerivative(safeR, k, i, j, includeTwist) : 0;
                value -= j === 0 ? christoffelDerivative(safeR, k, i, k, includeTwist) : 0;

                for (let l = 0; l < 2; l++) {
                    value += gamma[k][i][j] * gamma[l][k][l];
                    value -= gamma[l][i][k] * gamma[k][j][l];
                }
            }
            ricci[i][j] = value;
        }
    }

    let scalar = 0;
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            scalar += inv[i][j] * ricci[i][j];
        }
    }
    return scalar;
}

export function kretschmann2D(r, includeTwist = true) {
    const scalar = ricciScalar(r, includeTwist);
    return scalar * scalar;
}

export function metricSnapshot(r, includeTwist = true) {
    const safeR = Math.max(EPS, r);
    const grt = mixedTerm(safeR, includeTwist);
    return {
        r: safeR,
        gRR: gRR(safeR),
        gRT: grt,
        gTT: gTT(safeR),
        detG: detG(safeR, includeTwist),
        sqrtDetG: Math.sqrt(Math.max(0, detG(safeR, includeTwist))),
        ricciScalar: ricciScalar(safeR, includeTwist),
        kretschmann: kretschmann2D(safeR, includeTwist),
    };
}

export function christoffelSnapshot(r, includeTwist = true) {
    const gamma = christoffel(Math.max(1e-3, r), includeTwist);
    return {
        r,
        r_rr: gamma[0][0][0],
        r_rt: gamma[0][0][1],
        r_tt: gamma[0][1][1],
        t_rr: gamma[1][0][0],
        t_rt: gamma[1][0][1],
        t_tt: gamma[1][1][1],
    };
}

export function geodesicAcceleration(r, radialVelocity = 0, angularVelocity = 1, includeTwist = true) {
    const gamma = christoffel(Math.max(1e-3, r), includeTwist);
    const velocity = [radialVelocity, angularVelocity];
    const acceleration = [0, 0];

    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                acceleration[i] -= gamma[i][j][k] * velocity[j] * velocity[k];
            }
        }
    }

    return {
        radial: acceleration[0],
        angular: acceleration[1],
    };
}

export function validateMetricDomain({ rMin = 0.05, rMax = 5, samples = 200, includeTwist = true } = {}) {
    let minDet = Infinity;
    let maxDet = -Infinity;
    let minRicci = Infinity;
    let maxRicci = -Infinity;
    let minDetRadius = rMin;
    let nonPositiveDetCount = 0;

    for (let i = 0; i <= samples; i++) {
        const r = rMin + (rMax - rMin) * (i / samples);
        const det = detG(r, includeTwist);
        const ricci = ricciScalar(r, includeTwist);

        if (det < minDet) {
            minDet = det;
            minDetRadius = r;
        }
        maxDet = Math.max(maxDet, det);
        minRicci = Math.min(minRicci, ricci);
        maxRicci = Math.max(maxRicci, ricci);
        if (det <= 0) nonPositiveDetCount += 1;
    }

    return {
        rMin,
        rMax,
        samples: samples + 1,
        minDet,
        maxDet,
        minDetRadius,
        nonPositiveDetCount,
        minRicci,
        maxRicci,
        isPositiveDefinite: nonPositiveDetCount === 0,
    };
}

export function compareTwistToDiagonal({ r = 1, rMin = 0.05, rMax = 5, samples = 300 } = {}) {
    const twist = validateMetricDomain({ rMin, rMax, samples, includeTwist: true });
    const diagonal = validateMetricDomain({ rMin, rMax, samples, includeTwist: false });
    const twistSnapshot = metricSnapshot(r, true);
    const diagonalSnapshot = metricSnapshot(r, false);
    const twistAcceleration = geodesicAcceleration(r, 0, 1, true);
    const diagonalAcceleration = geodesicAcceleration(r, 0, 1, false);

    return {
        r,
        twist,
        diagonal,
        deltaDet: twistSnapshot.detG - diagonalSnapshot.detG,
        deltaRicci: twistSnapshot.ricciScalar - diagonalSnapshot.ricciScalar,
        deltaAngularAcceleration: twistAcceleration.angular - diagonalAcceleration.angular,
        twistAcceleration,
        diagonalAcceleration,
    };
}
