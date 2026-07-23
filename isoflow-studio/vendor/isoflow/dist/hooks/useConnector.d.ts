export declare const useConnector: (id: string) => {
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
};
