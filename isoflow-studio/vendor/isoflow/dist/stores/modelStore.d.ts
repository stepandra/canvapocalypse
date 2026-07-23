import React from 'react';
import { ModelStore } from '../types';
interface ProviderProps {
    children: React.ReactNode;
}
export declare const ModelProvider: ({ children }: ProviderProps) => import("react/jsx-runtime").JSX.Element;
export declare function useModelStore<T>(selector: (state: ModelStore) => T, equalityFn?: (left: T, right: T) => boolean): T;
export {};
