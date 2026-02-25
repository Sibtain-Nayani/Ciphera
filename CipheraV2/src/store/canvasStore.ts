import { create } from 'zustand';

export type ToolType = 'select' | 'draw-blackout' | 'draw-blur' | 'draw-mask';
export type ShapeType = 'blackout' | 'blur' | 'mask';

export interface RedactionShape {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: ShapeType;
}

interface CanvasState {
    imageSrc: string | null;
    scale: number;
    position: { x: number; y: number };
    shapes: RedactionShape[];
    activeTool: ToolType;

    // Actions
    setImageSrc: (src: string | null) => void;
    setScale: (scale: number) => void;
    setPosition: (position: { x: number; y: number }) => void;
    setShapes: (shapes: RedactionShape[] | ((prev: RedactionShape[]) => RedactionShape[])) => void;
    addShape: (shape: RedactionShape) => void;
    updateShape: (id: string, newProps: Partial<RedactionShape>) => void;
    deleteShape: (id: string) => void;
    setActiveTool: (tool: ToolType) => void;
    resetCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
    imageSrc: null,
    scale: 1,
    position: { x: 0, y: 0 },
    shapes: [],
    activeTool: 'select',

    setImageSrc: (src) => set({ imageSrc: src }),
    setScale: (scale) => set({ scale }),
    setPosition: (position) => set({ position }),
    setShapes: (shapesOrUpdater) => set((state) => ({
        shapes: typeof shapesOrUpdater === 'function' ? shapesOrUpdater(state.shapes) : shapesOrUpdater
    })),
    addShape: (shape) => set((state) => ({ shapes: [...state.shapes, shape] })),
    updateShape: (id, newProps) => set((state) => ({
        shapes: state.shapes.map(s => s.id === id ? { ...s, ...newProps } : s)
    })),
    deleteShape: (id) => set((state) => ({
        shapes: state.shapes.filter(s => s.id !== id)
    })),
    setActiveTool: (tool) => set({ activeTool: tool }),
    resetCanvas: () => set({
        imageSrc: null,
        scale: 1,
        position: { x: 0, y: 0 },
        shapes: [],
        activeTool: 'select',
    }),
}));
