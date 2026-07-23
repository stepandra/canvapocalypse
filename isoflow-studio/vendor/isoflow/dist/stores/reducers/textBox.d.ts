import { TextBox } from '../../types';
import { State, ViewReducerContext } from './types';
export declare const syncTextBox: (id: string, { viewId, state }: ViewReducerContext) => State;
export declare const updateTextBox: ({ id, ...updates }: {
    id: string;
} & Partial<{
    id: string;
    tile: {
        x: number;
        y: number;
    };
    content: string;
    fontSize?: number | undefined;
    orientation?: "X" | "Y" | undefined;
}>, { viewId, state }: ViewReducerContext) => State;
export declare const createTextBox: (newTextBox: TextBox, { viewId, state }: ViewReducerContext) => State;
export declare const deleteTextBox: (id: string, { viewId, state }: ViewReducerContext) => State;
