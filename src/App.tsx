import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-black font-body text-white">
      <Game />
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}
