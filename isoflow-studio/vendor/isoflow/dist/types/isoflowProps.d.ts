import type { EditorModeEnum, MainMenuOptions } from './common';
import type { Model } from './model';
import type { RendererProps } from './rendererProps';
import type { Scroll } from './ui';
import type { ItemReference } from './scene';
export type InitialData = Model & {
    fitToView?: boolean;
    view?: string;
    viewport?: {
        zoom: number;
        scroll: Scroll;
    };
};
export interface IsoflowProps {
    initialData?: InitialData;
    mainMenuOptions?: MainMenuOptions;
    onModelUpdated?: (Model: Model) => void;
    width?: number | string;
    height?: number | string;
    enableDebugTools?: boolean;
    editorMode?: keyof typeof EditorModeEnum;
    renderer?: RendererProps;
    onItemSelected?: (item: ItemReference | null) => void;
    focusItemIds?: string[];
}
