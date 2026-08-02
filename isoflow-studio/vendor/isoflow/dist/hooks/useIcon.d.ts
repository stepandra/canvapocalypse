export declare const useIcon: (id: string | undefined) => {
    icon: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    };
    iconComponent: import("react/jsx-runtime").JSX.Element;
    hasLoaded: boolean;
};
