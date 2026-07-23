import { Connector } from '../../types';
import { State, ViewReducerContext } from './types';
export declare const deleteConnector: (id: string, { viewId, state }: ViewReducerContext) => State;
export declare const syncConnector: (id: string, { viewId, state }: ViewReducerContext) => State;
export declare const updateConnector: ({ id, ...updates }: {
    id: string;
} & Partial<{
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
}>, { state, viewId }: ViewReducerContext) => State;
export declare const createConnector: (newConnector: Connector, { state, viewId }: ViewReducerContext) => State;
