import { useScene } from '../../../hooks/useScene';
interface Props {
    connector: ReturnType<typeof useScene>['connectors'][0];
    isSelected?: boolean;
    isFlowActive?: boolean;
    isContextActive?: boolean;
    flowDelay?: number;
    packetOnly?: boolean;
}
export declare const Connector: ({ connector: _connector, isSelected, isFlowActive, isContextActive, flowDelay, packetOnly }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
