import { useCallback, useEffect, useRef } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Coords, ModeActions, Scroll, State, SlimMouseEvent } from 'src/types';
import {
  CoordsUtils,
  getMouse,
  getItemAtTile,
  setWindowCursor
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { Cursor } from './modes/Cursor';
import { DragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';

const modes: { [k in string]: ModeActions } = {
  CURSOR: Cursor,
  DRAG_ITEMS: DragItems,
  // TODO: Adopt this notation for all modes (i.e. {node.type}.{action})
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  PAN: Pan,
  PLACE_ICON: PlaceIcon,
  TEXTBOX: TextBox
};

const getModeFunction = (mode: ModeActions, e: SlimMouseEvent) => {
  switch (e.type) {
    case 'mousemove':
      return mode.mousemove;
    case 'mousedown':
      return mode.mousedown;
    case 'mouseup':
      return mode.mouseup;
    default:
      return null;
  }
};

export const useInteractionManager = () => {
  const rendererRef = useRef<HTMLElement>();
  const reducerTypeRef = useRef<string>();
  const temporaryPanRef = useRef<{
    button: number;
    moved: boolean;
    start: Coords;
    scroll: Scroll;
  } | null>(null);
  const skipContextMenuRef = useRef(false);
  const uiState = useUiStateStore((state) => {
    return state;
  });
  const model = useModelStore((state) => {
    return state;
  });
  const scene = useScene();
  const { size: rendererSize } = useResizeObserver(uiState.rendererEl);

  const onMouseEvent = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;
      if (temporaryPanRef.current) return;

      const mouseEvent = e as MouseEvent;
      if (
        (e.type === 'mousedown' || e.type === 'mouseup') &&
        typeof mouseEvent.button === 'number' &&
        mouseEvent.button !== 0
      )
        return;

      const mode = modes[uiState.mode.type];
      const modeFunction = getModeFunction(mode, e);

      if (!modeFunction) return;

      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: e,
        rendererSize
      });

      uiState.actions.setMouse(nextMouse);

      const baseState: State = {
        model,
        scene,
        uiState,
        rendererRef: rendererRef.current,
        rendererSize,
        isRendererInteraction: rendererRef.current === e.target
      };

      if (reducerTypeRef.current !== uiState.mode.type) {
        const prevReducer = reducerTypeRef.current
          ? modes[reducerTypeRef.current]
          : null;

        if (prevReducer && prevReducer.exit) {
          prevReducer.exit(baseState);
        }

        if (mode.entry) {
          mode.entry(baseState);
        }
      }

      modeFunction(baseState);
      reducerTypeRef.current = uiState.mode.type;
    },
    [model, scene, uiState, rendererSize]
  );

  const openContextMenu = useCallback(
    (e: SlimMouseEvent) => {
      if (!rendererRef.current) return;

      const nextMouse = getMouse({
        interactiveElement: rendererRef.current,
        zoom: uiState.zoom,
        scroll: uiState.scroll,
        lastMouse: uiState.mouse,
        mouseEvent: e,
        rendererSize
      });
      uiState.actions.setMouse(nextMouse);

      const itemAtTile = getItemAtTile({
        tile: nextMouse.position.tile,
        scene
      });

      if (itemAtTile?.type === 'RECTANGLE') {
        uiState.actions.setContextMenu({
          item: itemAtTile,
          tile: nextMouse.position.tile
        });
      } else if (uiState.contextMenu) {
        uiState.actions.setContextMenu(null);
      }
    },
    [
      rendererSize,
      scene,
      uiState.actions,
      uiState.contextMenu,
      uiState.mouse,
      uiState.scroll,
      uiState.zoom
    ]
  );

  const onTemporaryPanStart = useCallback(
    (e: MouseEvent) => {
      if (
        (e.button !== 1 && e.button !== 2) ||
        !rendererRef.current ||
        !rendererRef.current.contains(e.target as Node)
      )
        return;

      e.preventDefault();
      temporaryPanRef.current = {
        button: e.button,
        moved: false,
        start: { x: e.clientX, y: e.clientY },
        scroll: uiState.scroll
      };
      setWindowCursor('grabbing');
    },
    [uiState.scroll]
  );

  const onTemporaryPanMove = useCallback(
    (e: MouseEvent) => {
      const temporaryPan = temporaryPanRef.current;
      if (!temporaryPan) return;

      e.preventDefault();
      const delta = {
        x: e.clientX - temporaryPan.start.x,
        y: e.clientY - temporaryPan.start.y
      };
      if (!temporaryPan.moved && Math.hypot(delta.x, delta.y) < 3) return;

      temporaryPan.moved = true;
      uiState.actions.setScroll({
        position: CoordsUtils.add(temporaryPan.scroll.position, delta),
        offset: temporaryPan.scroll.offset
      });
    },
    [uiState.actions]
  );

  const onTemporaryPanEnd = useCallback(
    (e: MouseEvent) => {
      const temporaryPan = temporaryPanRef.current;
      if (!temporaryPan || e.button !== temporaryPan.button) return;

      e.preventDefault();
      temporaryPanRef.current = null;
      setWindowCursor(uiState.mode.type === 'PAN' ? 'grab' : 'default');

      if (temporaryPan.button === 2) {
        skipContextMenuRef.current = true;
        window.setTimeout(() => {
          skipContextMenuRef.current = false;
        });

        if (!temporaryPan.moved) openContextMenu(e);
      }
    },
    [openContextMenu, uiState.mode.type]
  );

  const onTemporaryPanCancel = useCallback(() => {
    if (!temporaryPanRef.current) return;

    temporaryPanRef.current = null;
    setWindowCursor(uiState.mode.type === 'PAN' ? 'grab' : 'default');
  }, [uiState.mode.type]);

  const onTemporaryPanAuxClick = useCallback((e: MouseEvent) => {
    if (
      (e.button === 1 || e.button === 2) &&
      rendererRef.current?.contains(e.target as Node)
    )
      e.preventDefault();
  }, []);

  const onContextMenu = useCallback(
    (e: SlimMouseEvent) => {
      e.preventDefault();
      if (temporaryPanRef.current?.button === 2) return;
      if (skipContextMenuRef.current) {
        skipContextMenuRef.current = false;
        return;
      }

      openContextMenu(e);
    },
    [openContextMenu]
  );

  useEffect(() => {
    if (uiState.mode.type === 'INTERACTIONS_DISABLED') return;

    const el = window;

    const onTouchStart = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousedown'
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousemove'
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      onMouseEvent({
        ...e,
        clientX: 0,
        clientY: 0,
        type: 'mouseup'
      });
    };

    const onScroll = (e: WheelEvent) => {
      if (e.deltaY > 0) {
        uiState.actions.decrementZoom();
      } else {
        uiState.actions.incrementZoom();
      }
    };

    el.addEventListener('mousemove', onMouseEvent);
    el.addEventListener('mousedown', onMouseEvent);
    el.addEventListener('mouseup', onMouseEvent);
    el.addEventListener('mousedown', onTemporaryPanStart);
    el.addEventListener('mousemove', onTemporaryPanMove);
    el.addEventListener('mouseup', onTemporaryPanEnd);
    el.addEventListener('auxclick', onTemporaryPanAuxClick);
    el.addEventListener('blur', onTemporaryPanCancel);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchmove', onTouchMove);
    el.addEventListener('touchend', onTouchEnd);
    uiState.rendererEl?.addEventListener('wheel', onScroll);

    return () => {
      el.removeEventListener('mousemove', onMouseEvent);
      el.removeEventListener('mousedown', onMouseEvent);
      el.removeEventListener('mouseup', onMouseEvent);
      el.removeEventListener('mousedown', onTemporaryPanStart);
      el.removeEventListener('mousemove', onTemporaryPanMove);
      el.removeEventListener('mouseup', onTemporaryPanEnd);
      el.removeEventListener('auxclick', onTemporaryPanAuxClick);
      el.removeEventListener('blur', onTemporaryPanCancel);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      uiState.rendererEl?.removeEventListener('wheel', onScroll);
    };
  }, [
    uiState.editorMode,
    onMouseEvent,
    uiState.mode.type,
    onContextMenu,
    onTemporaryPanStart,
    onTemporaryPanMove,
    onTemporaryPanEnd,
    onTemporaryPanCancel,
    onTemporaryPanAuxClick,
    uiState.actions,
    uiState.rendererEl
  ]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
