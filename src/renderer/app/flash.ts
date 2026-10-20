import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface FlashState {
  notice?: string;
}

/** Navigation state that shows `message` once on the next screen, for example "Area saved." */
export function flash(message: string): FlashState {
  return { notice: message };
}

/** The message passed with `flash()`, shown once: it is cleared so Back does not show it again. */
export function useFlashNotice(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [message] = useState(() => (location.state as FlashState | null)?.notice ?? null);
  useEffect(() => {
    if (message) void navigate(location.pathname, { replace: true, state: null });
  }, [message, navigate, location.pathname]);
  return message;
}
