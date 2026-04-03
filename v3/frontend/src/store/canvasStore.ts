import { create } from 'zustand';
import Konva from 'konva';
import type { OcrResult } from '@/lib/ocrEngine';

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
    stageRef: Konva.Stage | null;
    selectedShapeId: string | null;
    ocrResult: OcrResult | null;
    imageDimensions: { width: number; height: number } | null;

    // Actions
    setImageSrc: (src: string | null) => void;
    setScale: (scale: number) => void;
    setPosition: (position: { x: number; y: number }) => void;
    setShapes: (shapes: RedactionShape[] | ((prev: RedactionShape[]) => RedactionShape[])) => void;
    addShape: (shape: RedactionShape) => void;
    updateShape: (id: string, newProps: Partial<RedactionShape>) => void;
    deleteShape: (id: string) => void;
    setActiveTool: (tool: ToolType) => void;
    setStageRef: (stage: Konva.Stage | null) => void;
    setSelectedShapeId: (id: string | null) => void;
    setOcrResult: (result: OcrResult | null) => void;
    setImageDimensions: (dims: { width: number; height: number } | null) => void;
    resetCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
    imageSrc: null,
    scale: 1,
    position: { x: 0, y: 0 },
    shapes: [],
    activeTool: 'select',
    stageRef: null,
    selectedShapeId: null,
    ocrResult: null,
    imageDimensions: null,

    setImageSrc: (src) => set({ imageSrc: src, imageDimensions: null, scale: 1, position: { x: 0, y: 0 } }),
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
    setStageRef: (stage) => set({ stageRef: stage }),
    setSelectedShapeId: (id) => set({ selectedShapeId: id }),
    setOcrResult: (result) => set({ ocrResult: result }),
    setImageDimensions: (dims) => set({ imageDimensions: dims }),
    resetCanvas: () => set({
        imageSrc: null,
        scale: 1,
        position: { x: 0, y: 0 },
        shapes: [],
        activeTool: 'select',
        stageRef: null,
        selectedShapeId: null,
        ocrResult: null,
        imageDimensions: null,
    }),
}));
