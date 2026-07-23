/// <reference types="react" />
export declare const useIconFiltering: () => {
    setFilter: import("react").Dispatch<import("react").SetStateAction<string>>;
    filter: string;
    filteredIcons: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }[] | null;
};
