import React from 'react';
import { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { getColorVariant } from 'src/utils';
import { useColor } from 'src/hooks/useColor';
import { useUiStateStore } from 'src/stores/uiStateStore';

type Props = ReturnType<typeof useScene>['rectangles'][0];

export const Rectangle = ({ from, to, color: colorId }: Props) => {
  const color = useColor(colorId);
  const zoom = useUiStateStore((state) => state.zoom);
  const screenSpaceScale = 1 / Math.max(zoom, 0.1);

  return (
    <IsoTileArea
      from={from}
      to={to}
      fill={color.value}
      cornerRadius={22}
      stroke={{
        color: getColorVariant(color.value, 'dark', { grade: 2 }),
        width: 2 * screenSpaceScale,
        dashArray: `${14 * screenSpaceScale} ${9 * screenSpaceScale}`
      }}
    />
  );
};
