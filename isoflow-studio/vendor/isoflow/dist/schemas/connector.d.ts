import { z } from 'zod';
export declare const connectorStyleOptions: readonly ["SOLID", "DOTTED", "DASHED"];
export declare const anchorSchema: z.ZodObject<{
    id: z.ZodString;
    ref: z.ZodObject<{
        item: z.ZodOptional<z.ZodString>;
        anchor: z.ZodOptional<z.ZodString>;
        tile: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
        }, {
            x: number;
            y: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        item?: string | undefined;
        anchor?: string | undefined;
        tile?: {
            x: number;
            y: number;
        } | undefined;
    }, {
        item?: string | undefined;
        anchor?: string | undefined;
        tile?: {
            x: number;
            y: number;
        } | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    ref: {
        item?: string | undefined;
        anchor?: string | undefined;
        tile?: {
            x: number;
            y: number;
        } | undefined;
    };
}, {
    id: string;
    ref: {
        item?: string | undefined;
        anchor?: string | undefined;
        tile?: {
            x: number;
            y: number;
        } | undefined;
    };
}>;
export declare const connectorSchema: z.ZodObject<{
    id: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    width: z.ZodOptional<z.ZodNumber>;
    style: z.ZodOptional<z.ZodEnum<["SOLID", "DOTTED", "DASHED"]>>;
    anchors: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ref: z.ZodObject<{
            item: z.ZodOptional<z.ZodString>;
            anchor: z.ZodOptional<z.ZodString>;
            tile: z.ZodOptional<z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>>;
        }, "strip", z.ZodTypeAny, {
            item?: string | undefined;
            anchor?: string | undefined;
            tile?: {
                x: number;
                y: number;
            } | undefined;
        }, {
            item?: string | undefined;
            anchor?: string | undefined;
            tile?: {
                x: number;
                y: number;
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        ref: {
            item?: string | undefined;
            anchor?: string | undefined;
            tile?: {
                x: number;
                y: number;
            } | undefined;
        };
    }, {
        id: string;
        ref: {
            item?: string | undefined;
            anchor?: string | undefined;
            tile?: {
                x: number;
                y: number;
            } | undefined;
        };
    }>, "many">;
}, "strip", z.ZodTypeAny, {
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
}, {
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
}>;
