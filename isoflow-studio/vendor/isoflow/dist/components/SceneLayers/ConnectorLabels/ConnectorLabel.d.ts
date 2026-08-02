import { useScene } from '../../../hooks/useScene';
interface Props {
    connector: ReturnType<typeof useScene>['connectors'][0];
}
export declare const ConnectorLabel: ({ connector }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
