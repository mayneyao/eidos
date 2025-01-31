import { useEffect, useRef, type RefObject } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      const observer = new MutationObserver((mutations) => {
        const shouldIgnore = mutations.some(mutation =>
          mutation.target instanceof Element &&
          (mutation.target.closest('details') !== null ||
            mutation.target.closest('[role="message-actions"]') !== null ||
            (mutation.type === 'attributes' && 
             mutation.attributeName === 'class' &&
             mutation.target.parentElement?.closest('pre') !== null))
        );

        const isUserMessage = mutations.some(mutation => {
          const target = mutation.target;
          if (target instanceof Element) {
            const messageElement = target.closest('[data-message-role="user"]');
            return messageElement !== null;
          }
          return false;
        });

        if (!shouldIgnore && isUserMessage) {
          end.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      return () => observer.disconnect();
    }
  }, []);

  return [containerRef, endRef];
}
