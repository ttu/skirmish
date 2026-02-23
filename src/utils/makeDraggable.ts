/**
 * Makes an absolutely-positioned element draggable by its title/handle element.
 *
 * Converts any `bottom`/`right` positioning to `top`/`left` so that
 * subsequent translate-based dragging works correctly, then uses
 * CSS `translate` to avoid clobbering the original position values.
 *
 * @param container  The panel element (position: absolute)
 * @param handle     The drag-handle element (typically the title bar)
 */
export function makeDraggable(container: HTMLElement, handle: HTMLElement): void {
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  // Convert bottom/right anchoring to top/left on first interaction
  // so translate-based movement works predictably.
  let anchorsConverted = false;
  function convertAnchors(): void {
    if (anchorsConverted) return;
    anchorsConverted = true;

    const rect = container.getBoundingClientRect();
    const parentRect =
      (container.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
      };

    const style = container.style;
    style.top = `${rect.top - parentRect.top}px`;
    style.left = `${rect.left - parentRect.left}px`;
    style.bottom = 'auto';
    style.right = 'auto';
  }

  handle.style.cursor = 'grab';

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    // Only primary button
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    convertAnchors();

    dragging = true;
    handle.style.cursor = 'grabbing';

    const rect = container.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e: MouseEvent): void {
    if (!dragging) return;

    const parentRect =
      (container.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };

    let newLeft = e.clientX - offsetX - parentRect.left;
    let newTop = e.clientY - offsetY - parentRect.top;

    // Clamp so the panel stays within the parent bounds
    const maxLeft = parentRect.width - container.offsetWidth;
    const maxTop = parentRect.height - container.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    container.style.left = `${newLeft}px`;
    container.style.top = `${newTop}px`;
  }

  function onMouseUp(): void {
    dragging = false;
    handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
}
