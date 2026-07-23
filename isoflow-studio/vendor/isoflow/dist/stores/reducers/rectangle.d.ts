import { Rectangle } from '../../types';
import { State, ViewReducerContext } from './types';
export declare const updateRectangle: ({ id, ...updates }: {
    id: string;
} & Partial<{
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
}>, { viewId, state }: ViewReducerContext) => State;
export declare const createRectangle: (newRectangle: Rectangle, { viewId, state }: ViewReducerContext) => State;
export declare const deleteRectangle: (id: string, { viewId, state }: ViewReducerContext) => State;
