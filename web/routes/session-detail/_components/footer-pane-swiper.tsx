import React from "react";
import { cn } from "../../../lib/cn";

const TRANSITION_MS = 200;

export interface FooterPane {
  key: string;
  node: React.ReactNode;
}

interface FooterPaneSwiperProps {
  panes: FooterPane[];
  activeIndex: number;
}

/**
 * Container that displays multiple footer panes in a single frame with slide transitions based on `activeIndex`.
 *
 * Input detection for pane switching (swipe / keyboard etc.) is done outside this component;
 * this is a display-only component that receives the resolved `activeIndex` via props.
 *
 * Rendering approach: overlay each pane with absolute positioning, arrange horizontally using
 * `translateX((index - activeIndex) * 100%)`. CSS transition for 200ms slide animation.
 * Inactive panes remain in DOM with pointer-events: none / aria-hidden to prevent interaction
 * (preserving React state so textarea input etc. is not lost during pane switching).
 * Slot height follows active pane's offsetHeight (ResizeObserver).
 */
export function FooterPaneSwiper({
  panes,
  activeIndex,
}: FooterPaneSwiperProps): React.ReactElement {
  const [activePaneHeight, setActivePaneHeight] = React.useState<
    number | undefined
  >(undefined);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  React.useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // When switching active panes, blur if focus is outside the active pane
  // (prevents disorientation of keeping focus in textarea and lingering keyboard state)
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || !container.contains(focused)) return;
    const activePane = container.children[activeIndex] as
      | HTMLElement
      | undefined;
    if (activePane && !activePane.contains(focused)) {
      focused.blur();
    }
  }, [activeIndex]);

  const attachActivePaneRef = React.useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) return;
    setActivePaneHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => {
      setActivePaneHeight(el.offsetHeight);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  const clampedIndex = Math.max(0, Math.min(panes.length - 1, activeIndex));

  return (
    <div
      ref={containerRef}
      className={cn("shrink-0 relative overflow-hidden")}
      style={{
        height: activePaneHeight,
        transition:
          activePaneHeight !== undefined
            ? `height ${TRANSITION_MS}ms ease-out`
            : undefined,
      }}
      data-testid="footer-pane-swiper"
      data-active-index={clampedIndex}
    >
      {panes.map((pane, index) => {
        const isActive = index === clampedIndex;
        return (
          <div
            key={pane.key}
            ref={isActive ? attachActivePaneRef : undefined}
            aria-hidden={!isActive}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateX(${(index - clampedIndex) * 100}%)`,
              transition: `transform ${TRANSITION_MS}ms ease-out`,
              pointerEvents: isActive ? "auto" : "none",
            }}
          >
            {pane.node}
          </div>
        );
      })}
    </div>
  );
}
