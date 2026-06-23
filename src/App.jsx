// Шаг 1: В App.jsx добавим overlay для отображения тензоров
import { useRef, useState, useEffect } from 'react';
import SinkHole from './components/SinkHole';
import { christoffelSnapshot, compareTwistToDiagonal, geodesicAcceleration, metricSnapshot, validateMetricDomain } from './metric';
import './App.css';
import './index.css';

function App() {
    const sinkRef = useRef();
    const [tensorText, setTensorText] = useState('');
    const [validationText, setValidationText] = useState('');

    useEffect(() => {
        const rs = [0.3, 0.8, 1.2, 2.0];
        let text = '';

        rs.forEach((r) => {
            const metric = metricSnapshot(r);
            text += `r = ${r.toFixed(2)}\n`;
            text += `g_rr = ${metric.gRR.toFixed(5)}\n`;
            text += `g_rθ = ${metric.gRT.toFixed(5)}\n`;
            text += `g_θθ = ${metric.gTT.toFixed(5)}\n`;
            text += `√det(g) = ${metric.sqrtDetG.toFixed(5)}\n`;
            text += `R = ${metric.ricciScalar.toFixed(5)}\n`;
            text += `K₂D = ${metric.kretschmann.toFixed(5)}\n\n`;
        });

        setTensorText(text.trim());

        const validation = validateMetricDomain({ rMin: 0.05, rMax: 5, samples: 300 });
        const gamma = christoffelSnapshot(1);
        const acceleration = geodesicAcceleration(1, 0, 1);
        const comparison = compareTwistToDiagonal({ r: 1, rMin: 0.05, rMax: 5, samples: 300 });
        const proofLines = [
            'MODEL CHECK',
            'ds² = g_rr dr² + 2g_rθ dr dθ + g_θθ dθ²',
            `domain: r ∈ [${validation.rMin}, ${validation.rMax}], samples=${validation.samples}`,
            `det(g)>0: ${validation.isPositiveDefinite ? 'PASS' : 'FAIL'}  min=${validation.minDet.toExponential(3)} @ r=${validation.minDetRadius.toFixed(3)}`,
            `R range: [${validation.minRicci.toFixed(3)}, ${validation.maxRicci.toFixed(3)}]`,
            `Γ^r_rr=${gamma.r_rr.toFixed(3)} Γ^r_rθ=${gamma.r_rt.toFixed(3)} Γ^r_θθ=${gamma.r_tt.toFixed(3)}`,
            `Γ^θ_rr=${gamma.t_rr.toFixed(3)} Γ^θ_rθ=${gamma.t_rt.toFixed(3)} Γ^θ_θθ=${gamma.t_tt.toFixed(3)}`,
            `geodesic a(r=1, r'=0, θ'=1): ar=${acceleration.radial.toFixed(3)}, aθ=${acceleration.angular.toFixed(3)}`,
            'CONTROL: same g_rr,g_θθ but g_rθ=0',
            `Δdet(r=1)=${comparison.deltaDet.toExponential(3)}  ΔR(r=1)=${comparison.deltaRicci.toFixed(3)}`,
            `Δaθ(r=1)=${comparison.deltaAngularAcceleration.toFixed(3)}  diagonal det>0=${comparison.diagonal.isPositiveDefinite ? 'PASS' : 'FAIL'}`,
            'claim: proves internal consistency only, not real-world gravity',
        ];
        setValidationText(proofLines.join('\n'));
    }, []);

    return (
        <div className='App'>
            <div className='w-screen h-screen bg-black relative'>
                <SinkHole ref={sinkRef} className='w-full h-full' />
                <div
                    className='absolute top-0 left-4 bg-black/80 text-green-300 text-xs p-3 rounded whitespace-pre font-mono pointer-events-none'
                    style={{ maxWidth: '300px' }}
                >
                    {tensorText}
                </div>
                <div className='validation-panel'>{validationText}</div>
            </div>
        </div>
    );
}

export default App;
