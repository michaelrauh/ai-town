import { useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import Button from './buttons/Button';
import { toastOnError } from '../toasts';

export default function RestartButton() {
  const restart = useAction(api.testing.restart);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await toastOnError(restart());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={onClick}
      title="Wipe the world, recreate agents, and rejoin as the human player."
      imgUrl="/assets/star.svg"
    >
      {busy ? 'Restarting…' : 'Restart'}
    </Button>
  );
}
