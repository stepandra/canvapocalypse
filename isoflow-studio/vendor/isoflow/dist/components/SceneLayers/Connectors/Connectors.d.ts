import type { useScene } from '../../../hooks/useScene';
interface Props {
    connectors: ReturnType<typeof useScene>['connectors'];
    activeItemIds: Set<string>;
}
export declare const Connectors: ({ connectors, activeItemIds }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
