import { useEffect, useRef, type RefObject } from 'react';

/**
 * True while the component is on screen. Check it after an `await` before
 * changing state, so an answer that arrives after the screen closed is ignored.
 */
export function useMountedRef(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
