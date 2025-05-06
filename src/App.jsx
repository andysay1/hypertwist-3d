import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import './App.css';
import SinkHole from './components/SinkHole';

function App() {
    return (
        <div className='App'>
            <div className='w-screen h-screen bg-black'>
                <SinkHole className='w-full h-full' />
            </div>
        </div>
    );
}

export default App;
