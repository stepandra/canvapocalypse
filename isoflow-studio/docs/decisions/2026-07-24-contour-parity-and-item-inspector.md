# Contour perimeter and item inspector parity

Date: 2026-07-24

## Decisions

1. Isoflow rectangles used as contours render a two-pixel screen-space,
   color-derived dashed perimeter over the existing translucent fill. The style
   is a renderer concern and does not add redundant fields to the persisted
   Isoflow model.
2. Legacy item controls no longer occupy the upper-left diagram area. They use
   a narrow right-edge inspector with an explicit close action.
3. The contour legend remains independently useful and shifts left while the
   item inspector is open so the two overlays never stack.
