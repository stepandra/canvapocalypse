import { z } from 'zod';
export declare const modelSchema: z.ZodEffects<z.ZodObject<{
    version: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }, {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }>, "many">;
    views: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        lastUpdated: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            tile: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
            labelHeight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }, {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }>, "many">;
        rectangles: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            color: z.ZodOptional<z.ZodString>;
            from: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
            to: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
        }, "strip", z.ZodTypeAny, {
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
        }, {
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
        }>, "many">>;
        connectors: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }>, "many">>;
        textBoxes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            tile: z.ZodObject<{
                x: z.ZodNumber;
                y: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                x: number;
                y: number;
            }, {
                x: number;
                y: number;
            }>;
            content: z.ZodString;
            fontSize: z.ZodOptional<z.ZodNumber>;
            orientation: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"X">, z.ZodLiteral<"Y">]>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }, {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }, {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }>, "many">;
    icons: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        url: z.ZodString;
        collection: z.ZodOptional<z.ZodString>;
        isIsometric: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }, {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }>, "many">;
    colors: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        id: string;
    }, {
        value: string;
        id: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }[];
    title: string;
    views: {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }[];
    icons: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }[];
    colors: {
        value: string;
        id: string;
    }[];
    version?: string | undefined;
    description?: string | undefined;
}, {
    items: {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }[];
    title: string;
    views: {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }[];
    icons: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }[];
    colors: {
        value: string;
        id: string;
    }[];
    version?: string | undefined;
    description?: string | undefined;
}>, {
    items: {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }[];
    title: string;
    views: {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }[];
    icons: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }[];
    colors: {
        value: string;
        id: string;
    }[];
    version?: string | undefined;
    description?: string | undefined;
}, {
    items: {
        id: string;
        name: string;
        description?: string | undefined;
        icon?: string | undefined;
    }[];
    title: string;
    views: {
        id: string;
        name: string;
        items: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            labelHeight?: number | undefined;
        }[];
        lastUpdated?: string | undefined;
        description?: string | undefined;
        rectangles?: {
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
        }[] | undefined;
        connectors?: {
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
        }[] | undefined;
        textBoxes?: {
            id: string;
            tile: {
                x: number;
                y: number;
            };
            content: string;
            fontSize?: number | undefined;
            orientation?: "X" | "Y" | undefined;
        }[] | undefined;
    }[];
    icons: {
        id: string;
        name: string;
        url: string;
        collection?: string | undefined;
        isIsometric?: boolean | undefined;
    }[];
    colors: {
        value: string;
        id: string;
    }[];
    version?: string | undefined;
    description?: string | undefined;
}>;
