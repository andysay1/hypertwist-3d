// Шаг 1: В App.jsx добавим overlay для отображения тензоров
import { useRef, useState, useEffect } from 'react';
import SinkHole from './components/SinkHole';
import './App.css';
import './index.css';

function App() {
    const sinkRef = useRef();
    const [tensorText, setTensorText] = useState('');

    useEffect(() => {
        function phi(r) {
            return Math.exp(-r * r);
        }

        function phiP(r) {
            return -2 * r * Math.exp(-r * r);
        }

        function Rrr(r) {
            const φ = phi(r);
            const dφ = phiP(r);
            return -(dφ + φ / r);
        }

        function Grr(r) {
            return 0.5 * Rrr(r);
        }

        function K(r) {
            return Rrr(r) ** 2;
        }

        const rs = [0.3, 0.8, 1.2, 2.0];
        let text = '';

        rs.forEach((r) => {
            const φ = phi(r).toFixed(5);
            const dφ = phiP(r).toFixed(5);
            const ricci = Rrr(r).toFixed(5);
            const einstein = Grr(r).toFixed(5);
            const k = K(r).toFixed(5);
            text += `r = ${r.toFixed(2)}\n`;
            text += `φ = ${φ}\n`;
            text += `φ' = ${dφ}\n`;
            text += `R_rr = ${ricci}\n`;
            text += `G_rr = ${einstein}\n`;
            text += `K = ${k}\n\n`;
        });

        setTensorText(text.trim());
    }, []);

    const handleFocus = (index) => {
        if (sinkRef.current && sinkRef.current.focusOnPlanet) {
            sinkRef.current.focusOnPlanet(index);
        }
    };

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
            </div>
        </div>
    );
}

export default App;
