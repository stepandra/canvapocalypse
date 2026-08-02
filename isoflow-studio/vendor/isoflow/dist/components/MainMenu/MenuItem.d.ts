import React from 'react';
export interface Props {
    onClick?: () => void;
    Icon?: React.ReactNode;
    children: string | React.ReactNode;
}
export declare const MenuItem: ({ onClick, Icon, children }: Props) => import("react/jsx-runtime").JSX.Element;
