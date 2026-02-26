import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import PropertiesPanel from './components/PropertiesPanel';

function App() {
    return (
        <div className="w-screen h-screen flex relative overflow-hidden bg-surface-50 text-surface-900">
            <Toolbar />
            <div className="flex-1 relative">
                <Canvas />
            </div>
            <PropertiesPanel />
        </div>
    );
}

export default App;
