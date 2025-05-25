import Chat from './components/Chat';
import Desktop from './components/Desktop';
import './App.css'

function App() {
  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full">
        <Chat />
      </div>
      <div className="w-1/2 h-full">
        <Desktop />
      </div>
    </div>
  );
}

export default App;
