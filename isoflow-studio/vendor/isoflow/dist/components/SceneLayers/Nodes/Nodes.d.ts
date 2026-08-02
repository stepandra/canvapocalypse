import { ViewItem } from '../../../types';
interface Props {
    nodes: ViewItem[];
    neighborhoodIds: Set<string>;
    isContextActive: boolean;
}
export declare const Nodes: ({ nodes, neighborhoodIds, isContextActive }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
