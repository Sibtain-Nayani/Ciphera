"use client";

import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore, RedactionShape, ShapeType } from '@/store/canvasStore';
import { useDocumentStore } from '@/store/documentStore';
import { ImageLayer } from './ImageLayer';
import { ShapeLayer } from './ShapeLayer';
import { FloatingToolbar } from './FloatingToolbar';

export const CanvasEngine: React.FC = () => {
    const {
        imageSrc, scale, position, setScale, setPosition,
        activeTool, addShape, updateShape, selectedShapeId,
        setSelectedShapeId, deleteShape, imageDimensions,
    } = useCanvasStore();

    const { previewMode } = useDocumentStore();

    const stageRef     = useRef<Konva.Stage>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const setStageRef  = useCanvasStore(s => s.setStageRef);

    const [isDrawing,      setIsDrawing]      = useState(false);
    const [currentShapeId, setCurrentShapeId] = useState<string | null>(null);

    // FIX 1: Read dimensions immediately via useLayoutEffect (fires before paint)
    // so the Stage never renders at 0x0 → no cropping on first render
    const [dimensions, setDimensions] = useState(() => {
        // Server-side safe default — will be overridden immediately on client
        return { width: 0, height: 0 };
    });

    // FIX: Use a callback ref to sync the stage instance to the store.
    // This avoids the infinite loop caused by an effect running on every render.
    const handleStageRef = useCallback((node: Konva.Stage | null) => {
        if (node) {
            // @ts-ignore - sync internal ref
            stageRef.current = node;
            setStageRef(node);
        }
    }, [setStageRef]);

    // Delete key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedShapeId) {
                deleteShape(selectedShapeId);
                setSelectedShapeId(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedShapeId, deleteShape, setSelectedShapeId]);

    // FIX 1 continued: useLayoutEffect reads container size before browser paints
    // This eliminates the 0x0 flash that caused cropping
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        // Immediately read the actual rendered size
        const { offsetWidth, offsetHeight } = el;
        if (offsetWidth > 0 && offsetHeight > 0) {
            setDimensions({ width: offsetWidth, height: offsetHeight });
        }
    }, []);

    // Continue observing for resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        // Set initial dimensions (backup for SSR case)
        if (el.offsetWidth > 0) {
            setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
        }

        const obs = new ResizeObserver(entries => {
            for (const e of entries) {
                const { width, height } = e.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                }
            }
        });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // Auto-fit: keyed by imageSrc+dims combo so it runs exactly once per image
    const fittedKey = useRef<string>('');

    const doFit = useCallback((cW: number, cH: number, iW: number, iH: number) => {
        const pad    = 60;
        const scaleX = (cW - pad) / iW;
        const scaleY = (cH - pad) / iH;
        const fit    = Math.min(scaleX, scaleY, 1);
        setScale(fit);
        setPosition({
            x: (cW - iW * fit) / 2,
            y: (cH - iH * fit) / 2,
        });
    }, [setScale, setPosition]);

    useEffect(() => {
        if (!imageSrc || !imageDimensions) return;
        const key = `${imageSrc}::${imageDimensions.width}x${imageDimensions.height}`;
        if (fittedKey.current === key) return;

        const tryFit = (attempt: number) => {
            // Always re-read from DOM in case state is stale
            const w = containerRef.current?.offsetWidth  || dimensions.width;
            const h = containerRef.current?.offsetHeight || dimensions.height;

            if (w > 0 && h > 0) {
                doFit(w, h, imageDimensions.width, imageDimensions.height);
                fittedKey.current = key;
            } else if (attempt < 8) {
                // Exponential backoff: 50ms, 100ms, 150ms, 200ms...
                setTimeout(() => tryFit(attempt + 1), 50 * (attempt + 1));
            }
        };

        tryFit(0);
    }, [imageSrc, imageDimensions, dimensions, doFit]);

    const getMinScale = useCallback(() => {
        if (!dimensions.width || !imageDimensions) return 0.1;
        const pad = 60;
        return Math.min(
            (dimensions.width  - pad) / imageDimensions.width,
            (dimensions.height - pad) / imageDimensions.height,
            1,
        );
    }, [dimensions, imageDimensions]);

    const constrainPos = useCallback((pos: { x: number; y: number }, s: number) => {
        if (!imageDimensions || !dimensions.width) return pos;
        const imgW = imageDimensions.width  * s;
        const imgH = imageDimensions.height * s;
        const pad  = 30;
        let { x, y } = pos;
        x = imgW < dimensions.width
            ? (dimensions.width  - imgW) / 2
            : Math.max(dimensions.width  - imgW - pad, Math.min(pad, x));
        y = imgH < dimensions.height
            ? (dimensions.height - imgH) / 2
            : Math.max(dimensions.height - imgH - pad, Math.min(pad, y));
        return { x, y };
    }, [dimensions, imageDimensions]);

    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const old     = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const origin = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
        let   next   = e.evt.deltaY < 0 ? old * 1.1 : old / 1.1;
        next = Math.max(getMinScale(), Math.min(10, next));
        setScale(next);
        setPosition(constrainPos({ x: pointer.x - origin.x * next, y: pointer.y - origin.y * next }, next));
    };

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (previewMode === 'redacted') return;
        if (e.target !== e.target.getStage()) return;
        if (activeTool === 'select') { setSelectedShapeId(null); return; }
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;
        setIsDrawing(true);
        const id = `shape_${Date.now()}`;
        setCurrentShapeId(id);
        addShape({ id, x: pointer.x, y: pointer.y, width: 0, height: 0, type: activeTool.replace('draw-', '') as ShapeType });
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (!isDrawing || !currentShapeId) return;
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;
        const shape = useCanvasStore.getState().shapes.find(s => s.id === currentShapeId);
        if (!shape) return;
        updateShape(currentShapeId, { width: pointer.x - shape.x, height: pointer.y - shape.y });
    };

    const handleMouseUp = () => {
        if (isDrawing && currentShapeId) {
            const shape = useCanvasStore.getState().shapes.find(s => s.id === currentShapeId);
            if (shape && Math.abs(shape.width) < 5 && Math.abs(shape.height) < 5) {
                useCanvasStore.getState().deleteShape(currentShapeId);
            }
        }
        setIsDrawing(false);
        setCurrentShapeId(null);
    };

    if (!imageSrc) return null;

    const isLocked = previewMode === 'redacted';

    // Use actual container size for Stage — fallback to window size if not yet measured
    const stageW = dimensions.width  || (typeof window !== 'undefined' ? window.innerWidth  * 0.65 : 800);
    const stageH = dimensions.height || (typeof window !== 'undefined' ? window.innerHeight : 600);

    return (
        <div ref={containerRef} className="relative w-full h-full bg-[#0D0D0D] overflow-hidden">
            {!isLocked && <FloatingToolbar />}

            {isLocked && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFA500]/10 border border-[#FFA500]/30 backdrop-blur-sm pointer-events-none select-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FFA500] animate-pulse" />
                    <span className="text-[11px] font-mono text-[#FFA500] font-medium tracking-wide">
                        REDACTED PREVIEW — editing disabled
                    </span>
                </div>
            )}

            <Stage
                ref={handleStageRef}
                width={stageW}
                height={stageH}
                scaleX={scale}
                scaleY={scale}
                x={position.x}
                y={position.y}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
                draggable={activeTool === 'select' && !isLocked && !selectedShapeId}
                dragBoundFunc={pos => constrainPos(pos, scale)}
                onDragEnd={e => {
                    if (e.target === e.target.getStage()) {
                        const p = constrainPos({ x: e.target.x(), y: e.target.y() }, scale);
                        setPosition(p);
                        e.target.position(p);
                    }
                }}
                style={{ cursor: isLocked ? 'default' : activeTool === 'select' ? 'grab' : 'crosshair' }}
            >
                <Layer>
                    <ImageLayer src={imageSrc} />
                </Layer>
                <ShapeLayer
                    selectedShapeId={isLocked ? null : selectedShapeId}
                    onShapeClick={isLocked ? () => {} : setSelectedShapeId}
                    isLocked={isLocked}
                />
            </Stage>
        </div>
    );
};