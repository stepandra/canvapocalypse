import { IsoflowProps } from './types';
export declare const Isoflow: (props: IsoflowProps) => import("react/jsx-runtime").JSX.Element;
declare const useIsoflow: () => {
    Model: {
        get: () => import("./types").ModelStore;
        set: (partial: import("./types").ModelStore | Partial<import("./types").ModelStore> | ((state: import("./types").ModelStore) => import("./types").ModelStore | Partial<import("./types").ModelStore>), replace?: boolean | undefined) => void;
    };
    uiState: import("./types").UiStateActions;
    rendererEl: HTMLDivElement | null;
};
export { useIsoflow };
export * from './standaloneExports';
export default Isoflow;
