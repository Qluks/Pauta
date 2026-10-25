import { RefObject, useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>("[autofocus], " + FOCUSABLE);
    first?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === dialog)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && (!document.activeElement || document.activeElement === document.body || dialog.contains(document.activeElement))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}
