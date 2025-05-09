import { useRef } from 'react';
import SinkHole from './components/SinkHole';
import './App.css';
import './index.css';

// const PLANETS = [
//     { name: 'Mercury', radius: 0.2 },
//     { name: 'Venus', radius: 0.32 },
//     { name: 'Earth', radius: 0.45 },
//     { name: 'Mars', radius: 0.6 },
//     { name: 'Jupiter', radius: 0.8 },
//     { name: 'Saturn', radius: 1.05 },
//     { name: 'Uranus', radius: 1.25 },
//     { name: 'Neptune', radius: 1.45 },
// ];

function App() {
    const sinkRef = useRef();

    const handleFocus = (index) => {
        if (sinkRef.current && sinkRef.current.focusOnPlanet) {
            sinkRef.current.focusOnPlanet(index);
        }
    };

    return (
        <div className='App'>
            {/* <div className='absolute top-4 left-4 z-10 bg-black/70 text-white p-2 rounded'>
                {PLANETS.map((p, i) => (
                    <div key={i} className='cursor-pointer hover:text-yellow-300' onClick={() => handleFocus(i)}>
                        {p.name}
                    </div>
                ))}
            </div> */}
            <div className='w-screen h-screen bg-black'>
                <SinkHole ref={sinkRef} className='w-full h-full' />
            </div>
        </div>
    );
}

export default App;
