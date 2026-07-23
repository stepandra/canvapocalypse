import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SizeIndicator } from 'src/components/DebugUtils/SizeIndicator';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { TransformControlsManager } from 'src/components/TransformControlsManager/TransformControlsManager';
import { useScene } from 'src/hooks/useScene';
import { RendererProps } from 'src/types/rendererProps';

export const Renderer = ({ showGrid, backgroundColor }: RendererProps) => {
  const containerRef = useRef<HTMLDivElement>();
  const interactionsRef = useRef<HTMLDivElement>();
  const enableDebugTools = useUiStateStore((state) => {
    return state.enableDebugTools;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const itemControls = useUiStateStore((state) => state.itemControls);
  const focusItemIds = useUiStateStore((state) => state.focusItemIds);
  const { setInteractionsElement } = useInteractionManager();
  const { items, rectangles, connectors, textBoxes } = useScene();
  const activeItemIds = useMemo(() => {
    const ids = new Set(focusItemIds);
    if (itemControls?.type === 'ITEM') ids.add(itemControls.id);
    return ids;
  }, [focusItemIds, itemControls]);
  const neighborhoodIds = useMemo(() => {
    if (activeItemIds.size === 0) return activeItemIds;
    const ids = new Set(activeItemIds);
    connectors.forEach((connector) => {
      const connectorIds = connector.anchors
        .map((anchor) => anchor.ref.item)
        .filter((id): id is string => Boolean(id));
      if (connectorIds.some((id) => activeItemIds.has(id))) {
        connectorIds.forEach((id) => ids.add(id));
      }
    });
    return ids;
  }, [activeItemIds, connectors]);

  useEffect(() => {
    if (!containerRef.current || !interactionsRef.current) return;

    setInteractionsElement(interactionsRef.current);
    uiStateActions.setRendererEl(containerRef.current);
  }, [setInteractionsElement, uiStateActions]);

  const isShowGrid = useMemo(() => {
    return showGrid === undefined || showGrid;
  }, [showGrid]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        bgcolor: (theme) => {
          return backgroundColor ?? theme.customVars.customPalette.diagramBg;
        }
      }}
    >
      <SceneLayer>
        <Rectangles rectangles={rectangles} />
      </SceneLayer>
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0
        }}
      >
        {isShowGrid && <Grid />}
      </Box>
      {mode.showCursor && (
        <SceneLayer>
          <Cursor />
        </SceneLayer>
      )}
      <SceneLayer>
        <Connectors connectors={connectors} activeItemIds={activeItemIds} />
      </SceneLayer>
      <SceneLayer>
        <TextBoxes textBoxes={textBoxes} />
      </SceneLayer>
      <SceneLayer>
        <ConnectorLabels connectors={connectors} />
      </SceneLayer>
      {enableDebugTools && (
        <SceneLayer>
          <SizeIndicator />
        </SceneLayer>
      )}
      {/* Interaction layer: this is where events are detected */}
      <Box
        ref={interactionsRef}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%'
        }}
      />
      <SceneLayer>
        <Nodes
          nodes={items}
          neighborhoodIds={neighborhoodIds}
          isContextActive={activeItemIds.size > 0}
        />
      </SceneLayer>
      <SceneLayer>
        <TransformControlsManager />
      </SceneLayer>
    </Box>
  );
};
