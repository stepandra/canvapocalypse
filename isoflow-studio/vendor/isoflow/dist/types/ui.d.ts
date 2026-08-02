import { Coords, EditorModeEnum, MainMenuOptions } from './common';
import { Icon } from './model';
import { ItemReference } from './scene';
interface AddItemControls {
    type: 'ADD_ITEM';
}
export type ItemControls = ItemReference | AddItemControls;
export interface Mouse {
    position: {
        screen: Coords;
        tile: Coords;
    };
    mousedown: {
        screen: Coords;
        tile: Coords;
    } | null;
    delta: {
        screen: Coords;
        tile: Coords;
    } | null;
}
export interface InteractionsDisabled {
    type: 'INTERACTIONS_DISABLED';
    showCursor: boolean;
}
export interface CursorMode {
    type: 'CURSOR';
    showCursor: boolean;
    mousedownItem: ItemReference | null;
}
export interface DragItemsMode {
    type: 'DRAG_ITEMS';
    showCursor: boolean;
    items: ItemReference[];
    isInitialMovement: Boolean;
}
export interface PanMode {
    type: 'PAN';
    showCursor: boolean;
}
export interface PlaceIconMode {
    type: 'PLACE_ICON';
    showCursor: boolean;
    id: string | null;
}
export interface ConnectorMode {
    type: 'CONNECTOR';
    showCursor: boolean;
    id: string | null;
}
export interface DrawRectangleMode {
    type: 'RECTANGLE.DRAW';
    showCursor: boolean;
    id: string | null;
}
export declare const AnchorPositionOptions: {
    readonly BOTTOM_LEFT: "BOTTOM_LEFT";
    readonly BOTTOM_RIGHT: "BOTTOM_RIGHT";
    readonly TOP_RIGHT: "TOP_RIGHT";
    readonly TOP_LEFT: "TOP_LEFT";
};
export type AnchorPosition = keyof typeof AnchorPositionOptions;
export interface TransformRectangleMode {
    type: 'RECTANGLE.TRANSFORM';
    showCursor: boolean;
    id: string;
    selectedAnchor: AnchorPosition | null;
}
export interface TextBoxMode {
    type: 'TEXTBOX';
    showCursor: boolean;
    id: string | null;
}
export type Mode = InteractionsDisabled | CursorMode | PanMode | PlaceIconMode | ConnectorMode | DrawRectangleMode | TransformRectangleMode | DragItemsMode | TextBoxMode;
export interface Scroll {
    position: Coords;
    offset: Coords;
}
export interface IconCollectionState {
    id?: string;
    isExpanded: boolean;
}
export type IconCollectionStateWithIcons = IconCollectionState & {
    icons: Icon[];
};
export declare const DialogTypeEnum: {
    readonly EXPORT_IMAGE: "EXPORT_IMAGE";
};
export interface ContextMenu {
    item: ItemReference;
    tile: Coords;
}
export declare const LayerOrderingActionOptions: {
    readonly BRING_TO_FRONT: "BRING_TO_FRONT";
    readonly SEND_TO_BACK: "SEND_TO_BACK";
    readonly BRING_FORWARD: "BRING_FORWARD";
    readonly SEND_BACKWARD: "SEND_BACKWARD";
};
export type LayerOrderingAction = keyof typeof LayerOrderingActionOptions;
export interface UiState {
    view: string;
    mainMenuOptions: MainMenuOptions;
    editorMode: keyof typeof EditorModeEnum;
    iconCategoriesState: IconCollectionState[];
    mode: Mode;
    dialog: keyof typeof DialogTypeEnum | null;
    isMainMenuOpen: boolean;
    itemControls: ItemControls | null;
    contextMenu: ContextMenu | null;
    zoom: number;
    scroll: Scroll;
    mouse: Mouse;
    rendererEl: HTMLDivElement | null;
    enableDebugTools: boolean;
    focusItemIds: string[];
}
export interface UiStateActions {
    setView: (view: string) => void;
    setMainMenuOptions: (options: MainMenuOptions) => void;
    setEditorMode: (mode: keyof typeof EditorModeEnum) => void;
    setIconCategoriesState: (iconCategoriesState: IconCollectionState[]) => void;
    resetUiState: () => void;
    setMode: (mode: Mode) => void;
    incrementZoom: () => void;
    decrementZoom: () => void;
    setIsMainMenuOpen: (isOpen: boolean) => void;
    setDialog: (dialog: keyof typeof DialogTypeEnum | null) => void;
    setZoom: (zoom: number) => void;
    setScroll: (scroll: Scroll) => void;
    setItemControls: (itemControls: ItemControls | null) => void;
    setContextMenu: (contextMenu: ContextMenu | null) => void;
    setMouse: (mouse: Mouse) => void;
    setRendererEl: (el: HTMLDivElement) => void;
    setEnableDebugTools: (enabled: boolean) => void;
    setFocusItemIds: (ids: string[]) => void;
}
export type UiStateStore = UiState & {
    actions: UiStateActions;
};
export {};
