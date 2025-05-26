import { useState } from "react";
import Chat from './components/Chat';
import Desktop from './components/Desktop';
import './App.css'

export default function App() {
  const [dragPath, setDragPath] = useState<{ x: number; y: number }[]>([]);
  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full">
        <Chat onDragPath={setDragPath} />
      </div>
      <div className="w-1/2 h-full">
        <Desktop dragPath={dragPath} />
      </div>
    </div>
  );
}
