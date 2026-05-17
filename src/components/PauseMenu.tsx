import clsx from 'clsx';
import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { toast } from 'react-toastify';
import { api } from '../../convex/_generated/api';
import { toastOnError } from '../toasts';
import Button from './buttons/Button';

type BusyAction = 'pause' | 'resume' | 'restart' | 'save' | 'load';

function savedAtLabel(savedAt: number | undefined) {
  if (!savedAt) {
    return 'No save yet';
  }
  return `Saved ${new Date(savedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function MenuActionButton(props: {
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: string;
}) {
  return (
    <button
      className={clsx(
        'button pointer-events-auto text-white shadow-solid text-lg',
        props.disabled && 'cursor-not-allowed opacity-50',
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
    >
      <span>
        <div className="bg-clay-700 px-2 py-1">
          {props.busy ? `${props.children}...` : props.children}
        </div>
      </span>
    </button>
  );
}

export default function PauseMenu() {
  const stopAllowed = useQuery(api.testing.stopAllowed) ?? false;
  const defaultWorld = useQuery(api.world.defaultWorldStatus);
  const saveStatus = useQuery(api.testing.saveStatus);
  const pause = useMutation(api.testing.stop);
  const resume = useMutation(api.testing.resume);
  const restart = useAction(api.testing.restart);
  const saveGame = useAction(api.testing.saveGame);
  const loadGame = useAction(api.testing.loadGame);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const paused = defaultWorld?.status === 'stoppedByDeveloper';

  if (!stopAllowed) {
    return null;
  }

  const runAction = async (action: BusyAction, task: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(action);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  };

  const openMenu = () => {
    setOpen(true);
    if (!paused && busy !== 'pause') {
      void runAction('pause', async () => {
        await toastOnError(pause());
      });
    }
  };

  const onResume = () =>
    void runAction('resume', async () => {
      await toastOnError(resume());
      setOpen(false);
    });

  const onRestart = () =>
    void runAction('restart', async () => {
      await toastOnError(restart());
      setOpen(false);
    });

  const onSave = () =>
    void runAction('save', async () => {
      await toastOnError(saveGame());
      toast.success('Game saved.');
    });

  const onLoad = () =>
    void runAction('load', async () => {
      await toastOnError(loadGame());
      toast.success('Game loaded. Press Resume to continue.');
    });

  return (
    <>
      <Button
        onClick={openMenu}
        title="Pause the world and open save, load, restart, and resume controls."
        imgUrl="/assets/star.svg"
      >
        {open || paused ? 'Paused' : 'Pause'}
      </Button>
      {open && (
        <div className="pointer-events-auto absolute bottom-16 left-0 w-[min(20rem,calc(100vw-1.5rem))] border-8 border-brown-900 bg-brown-800/95 p-4 text-brown-100 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-3xl leading-none text-white">Paused</div>
              <div className="mt-2 text-sm text-brown-200">{savedAtLabel(saveStatus?.savedAt)}</div>
            </div>
            <div className="text-right text-sm text-brown-200">
              {busy === 'pause' ? 'Pausing...' : paused ? 'World stopped' : 'Stopping...'}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MenuActionButton
              busy={busy === 'resume'}
              disabled={!!busy || !paused}
              onClick={onResume}
              title="Resume the world simulation."
            >
              Resume
            </MenuActionButton>
            <MenuActionButton
              busy={busy === 'restart'}
              disabled={!!busy}
              onClick={onRestart}
              title="Wipe the world, recreate agents, and rejoin as the human player."
            >
              Restart
            </MenuActionButton>
            <MenuActionButton
              busy={busy === 'save'}
              disabled={!!busy || !paused}
              onClick={onSave}
              title="Overwrite the single default save slot."
            >
              Save
            </MenuActionButton>
            <MenuActionButton
              busy={busy === 'load'}
              disabled={!!busy || !saveStatus}
              onClick={onLoad}
              title="Restore the single default save slot and keep the world paused."
            >
              Load
            </MenuActionButton>
          </div>
        </div>
      )}
    </>
  );
}
