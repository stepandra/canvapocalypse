import { ModelItem, ViewItem, Connector, TextBox, Rectangle, ItemReference, LayerOrderingAction } from '../types';
export declare const useScene: () => {
    items: {
        id: string;
        tile: {
            x: number;
            y: number;
        };
        labelHeight?: number | undefined;
    }[];
    connectors: {
        path: import("../types").ConnectorPath;
        id: string;
        anchors: {
            id: string;
            ref: {
                item?: string | undefined;
                anchor?: string | undefined;
                tile?: {
                    x: number;
                    y: number;
                } | undefined;
            };
        }[];
        description: string;
        color?: string | undefined;
        width: number;
        style: "SOLID" | "DOTTED" | "DASHED";
    }[];
    colors: {
        value: string;
        id: string;
    }[];
    rectangles: {
        id: string;
        from: {
            x: number;
            y: number;
        };
        to: {
            x: number;
            y: number;
        };
        color?: string | undefined;
    }[];
    textBoxes: {
        size: import("../types").Size;
        id: string;
        tile: {
            x: number;
            y: number;
        };
        content: string;
        fontSize: number;
        orientation: "X" | "Y";
    }[];
    currentView: {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
            id: string;
            from: {
                x: number;
                y: number;
            };
            to: {
                x: number;
                y: number;
            };
            color?: string | undefined;
        }[] | undefined;
        connectors?: {
            id: string;
            anchors: {
                id: string;
                ref: {
                    item?: string | undefined;
                    anchor?: string | undefined;
                    tile?: {
                        x: number;
                        y: number;
                    } | undefined;
                };
            }[];
            description?: string | undefined;
            color?: string | undefined;
            width?: number | undefined;
            style?: "SOLID" | "DOTTED" | "DASHED" | undefined;
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    };
    createModelItem: (newModelItem: ModelItem) => void;
    updateModelItem: (id: string, updates: Partial<ModelItem>) => void;
    deleteModelItem: (id: string) => void;
    createViewItem: (newViewItem: ViewItem) => void;
    updateViewItem: (id: string, updates: Partial<ViewItem>) => void;
    deleteViewItem: (id: string) => void;
    createConnector: (newConnector: Connector) => void;
    updateConnector: (id: string, updates: Partial<Connector>) => void;
    deleteConnector: (id: string) => void;
    createTextBox: (newTextBox: TextBox) => void;
    updateTextBox: (id: string, updates: Partial<TextBox>) => void;
    deleteTextBox: (id: string) => void;
    createRectangle: (newRectangle: Rectangle) => void;
    updateRectangle: (id: string, updates: Partial<Rectangle>) => void;
    deleteRectangle: (id: string) => void;
    changeLayerOrder: (action: LayerOrderingAction, item: ItemReference) => void;
};
