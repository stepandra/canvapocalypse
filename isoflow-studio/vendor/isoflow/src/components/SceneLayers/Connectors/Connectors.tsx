import React, { useMemo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Connector } from './Connector';

interface Props {
  connectors: ReturnType<typeof useScene>['connectors'];
  activeItemIds: Set<string>;
}

export const Connectors = ({ connectors, activeItemIds }: Props) => {
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });

  const mode = useUiStateStore((state) => {
    return state.mode;
  });

  const selectedConnectorId = useMemo(() => {
    if (mode.type === 'CONNECTOR') {
      return mode.id;
    }
    if (itemControls?.type === 'CONNECTOR') {
      return itemControls.id;
    }

    return null;
  }, [mode, itemControls]);

  const orderedConnectors = useMemo(() => {
    return [...connectors].reverse();
  }, [connectors]);

  const isConnectorFlowActive = (
    connector: ReturnType<typeof useScene>['connectors'][0]
  ) => {
    return (
      activeItemIds.size > 0 &&
      connector.anchors.some((anchor) => {
        return anchor.ref.item ? activeItemIds.has(anchor.ref.item) : false;
      })
    );
  };

  return (
    <>
      {orderedConnectors.map((connector, index) => {
        const isFlowActive = isConnectorFlowActive(connector);
        return (
          <Connector
            key={connector.id}
            connector={connector}
            isSelected={selectedConnectorId === connector.id}
            isFlowActive={isFlowActive}
            isContextActive={activeItemIds.size > 0}
            flowDelay={index * -0.17}
          />
        );
      })}
      {orderedConnectors.map((connector, index) => {
        if (!isConnectorFlowActive(connector)) return null;

        return (
          <Connector
            key={`${connector.id}:packet`}
            connector={connector}
            isFlowActive
            flowDelay={index * -0.17}
            packetOnly
          />
        );
      })}
    </>
  );
};
