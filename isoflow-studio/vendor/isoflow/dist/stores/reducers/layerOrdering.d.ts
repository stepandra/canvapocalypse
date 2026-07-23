import { ItemReference, LayerOrderingAction } from '../../types';
import { State, ViewReducerContext } from './types';
export declare const changeLayerOrder: ({ action, item }: {
    action: LayerOrderingAction;
    item: ItemReference;
}, { viewId, state }: ViewReducerContext) => State;
