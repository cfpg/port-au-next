'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the content is positioned against. */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: Placement;
  /** Click-outside and Escape close it. Turn off for hover-driven popovers (e.g. Tooltip), which already manage their own dismissal via mouse/focus events. */
  dismissOnInteractOutside?: boolean;
}

/**
 * The mechanics shared by every floating bit of UI anchored to a trigger:
 * Menu, SplitButton's dropdown, Tooltip. Renders `children` through a portal
 * to `document.body` so an `overflow-x-auto`/`overflow-hidden` ancestor
 * (a table, a modal) can't clip it, and computes its position from the
 * anchor's real on-screen location instead of relying on CSS's `position:
 * absolute`-inside-`position: relative`, which only works while the content
 * stays a normal DOM descendant of the anchor.
 *
 * Carries no visual opinion of its own - border, shadow, radius, padding all
 * belong to whatever `children` renders.
 */
export default function Popover({
  open,
  onOpenChange,
  anchorRef,
  children,
  placement = 'bottom-start',
  dismissOnInteractOutside = true,
}: PopoverProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!anchor || !content) return;

    return autoUpdate(anchor, content, () => {
      computePosition(anchor, content, {
        placement,
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => setCoords({ x, y }));
    });
  }, [open, anchorRef, placement]);

  useEffect(() => {
    if (!open || !dismissOnInteractOutside) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || contentRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, dismissOnInteractOutside, onOpenChange, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={contentRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // Off-screen until the first position lands, so it never flashes at (0,0).
        transform: coords ? `translate(${coords.x}px, ${coords.y}px)` : 'translate(-9999px, -9999px)',
      }}
    >
      {children}
    </div>,
    document.body
  );
}
