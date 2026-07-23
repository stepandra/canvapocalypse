import React from 'react';
import { SceneStore } from '../types';
interface ProviderProps {
    children: React.ReactNode;
}
export declare const SceneProvider: ({ children }: ProviderProps) => import("react/jsx-runtime").JSX.Element;
export declare function useSceneStore<T>(selector: (state: SceneStore) => T, equalityFn?: (left: T, right: T) => boolean): T;
export {};
