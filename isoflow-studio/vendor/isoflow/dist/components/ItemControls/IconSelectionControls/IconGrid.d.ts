import { Icon as IconI } from '../../../types';
interface Props {
    icons: IconI[];
    onMouseDown?: (icon: IconI) => void;
    onClick?: (icon: IconI) => void;
}
export declare const IconGrid: ({ icons, onMouseDown, onClick }: Props) => import("react/jsx-runtime").JSX.Element;
export {};
