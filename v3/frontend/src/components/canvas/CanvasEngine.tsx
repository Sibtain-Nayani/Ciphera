"use client";

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore, RedactionShape, ShapeType } from '@/store/canvasStore';
import { useDocumentStore } from '@/store/documentStore';
import { ImageLayer } from './ImageLayer';
import { ShapeLayer } from './ShapeLayer';
import { FloatingToolbar } from './FloatingToolbar';

export const CanvasEngine: React.FC = () => {
    // Select only what we need to minimize re-renders and avoid infinite loops with callback refs
    const imageSrc           = useCanvasStore(s => s.imageSrc);
    const scale              = useCanvasStore(s => s.scale);
    const position           = useCanvasStore(s => s.position);
    const setScale           = useCanvasStore(s => s.setScale);
    const setPosition        = useCanvasStore(s => s.setPosition);
    const activeTool         = useCanvasStore(s => s.activeTool);
    const addShape           = useCanvasStore(s => s.addShape);
    const updateShape        = useCanvasStore(s => s.updateShape);
    const selectedShapeId    = useCanvasStore(s => s.selectedShapeId);
    const setSelectedShapeId = useCanvasStore(s => s.setSelectedShapeId);
    const deleteShape        = useCanvasStore(s => s.deleteShape);
    const imageDimensions    = useCanvasStore(s => s.imageDimensions);

    const { previewMode } = useDocumentStore();

    const containerRef  = useRef<HTMLDivElement>(null);
    const hasAutoFitted = useRef(false);   // FIX: track whether we've already auto-fitted
    const setStageRef   = useCanvasStore(s => s.setStageRef);

    const [isDrawing,       setIsDrawing]       = useState(false);
    const [currentShapeId,  setCurrentShapeId]  = useState<string | null>(null);
    const [dimensions,      setDimensions]       = useState({ width: 0, height: 0 });

    // FIX: Using a callback ref is much more reliable for syncing with external stores
    // than useEffect + useRef, as it triggers whenever the node actually mounts/unmounts.
    const onStageMount = useCallback((node: Konva.Stage | null) => {
        // Guard to prevent redundant store updates which can cause infinite loops
        if (useCanvasStore.getState().stageRef !== node) {
            setStageRef(node);
        }
    }, [setStageRef]);

    // Delete key handler
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

    // Container resize observer
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const measure = () => {
            if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
            }
        };

        const obs = new ResizeObserver(entries => {
            for (const e of entries) {
                if (e.contentRect.width > 0 && e.contentRect.height > 0) {
                    setDimensions({ width: e.contentRect.width, height: e.contentRect.height });
                }
            }
        });
        obs.observe(el);

        // Initial measurement
        measure();

        // Fallback: sometimes layout is delayed in Next.js/dynamic components
        const timer = setTimeout(measure, 100);
        const raf   = requestAnimationFrame(measure);

        return () => {
            obs.disconnect();
            clearTimeout(timer);
            cancelAnimationFrame(raf);
        };
    }, []);

    // FIX: Auto-fit only runs ONCE per image load (hasAutoFitted ref prevents re-running
    // when OCR updates cause re-renders, which was causing the preview to blank out)
    useEffect(() => {
        hasAutoFitted.current = false;  // Reset when image changes
    }, [imageSrc]);

    useEffect(() => {
        if (
            (!hasAutoFitted.current || scale === 0) &&
            dimensions.width > 0 && dimensions.height > 0 &&
            imageDimensions
        ) {
            const pad    = 60;
            const scaleX = (dimensions.width  - pad) / imageDimensions.width;
            const scaleY = (dimensions.height - pad) / imageDimensions.height;
            const fit    = Math.min(scaleX, scaleY, 1);

            setScale(fit);
            setPosition({
                x: (dimensions.width  - imageDimensions.width  * fit) / 2,
                y: (dimensions.height - imageDimensions.height * fit) / 2,
            });
            hasAutoFitted.current = true;  // Never auto-fit again for this image unless requested
        }
    }, [dimensions, imageDimensions, scale]);
    // NOTE: intentionally NOT including scale/position in deps —
    // those are user-controlled after the initial fit

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
        x = imgW < dimensions.width  ? (dimensions.width  - imgW) / 2 : Math.max(dimensions.width  - imgW - pad, Math.min(pad, x));
        y = imgH < dimensions.height ? (dimensions.height - imgH) / 2 : Math.max(dimensions.height - imgH - pad, Math.min(pad, y));
        return { x, y };
    }, [dimensions, imageDimensions]);

    // Wheel zoom
    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = useCanvasStore.getState().stageRef;
        if (!stage) return;
        const old     = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const origin = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
        let   next   = e.evt.deltaY < 0 ? old * 1.1 : old / 1.1;
        next = Math.max(getMinScale(), Math.min(10, next));
        const newPos  = { x: pointer.x - origin.x * next, y: pointer.y - origin.y * next };
        setScale(next);
        setPosition(constrainPos(newPos, next));
    };

    // Drawing
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        // FIX: In redacted (locked) mode, disable drawing entirely
        if (previewMode === 'redacted') return;
        if (e.target !== e.target.getStage()) return;
        if (activeTool === 'select') { setSelectedShapeId(null); return; }

        const stage = useCanvasStore.getState().stageRef;
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
        const stage = useCanvasStore.getState().stageRef;
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

    return (
        <div ref={containerRef} className="relative w-full h-full bg-[#0D0D0D] overflow-hidden">
            {/* FIX: Only show toolbar when NOT in locked/preview mode */}
            {!isLocked && <FloatingToolbar />}

            {/* Locked mode banner */}
            {isLocked && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFA500]/10 border border-[#FFA500]/30 backdrop-blur-sm pointer-events-none">
                    <div className="w-2 h-2 rounded-full bg-[#FFA500] animate-pulse" />
                    <span className="text-xs font-mono text-[#FFA500] font-medium">REDACTED PREVIEW — editing disabled</span>
                </div>
            )}

            {/* FIX: prevents Stage from initializing with 0,0 which can cause rendering bugs */}
            {dimensions.width > 0 && dimensions.height > 0 && (
                <Stage
                    width={dimensions.width}
                    height={dimensions.height}
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
                    // FIX: only draggable in edit mode
                    draggable={activeTool === 'select' && !isLocked && !selectedShapeId}
                    dragBoundFunc={pos => constrainPos(pos, scale)}
                    onDragEnd={e => {
                        if (e.target === e.target.getStage()) {
                            const p = constrainPos({ x: e.target.x(), y: e.target.y() }, scale);
                            setPosition(p);
                            e.target.position(p);
                        }
                    }}
                    ref={onStageMount}
                    style={{ cursor: isLocked ? 'not-allowed' : activeTool === 'select' ? 'grab' : 'crosshair' }}
                >
                    <Layer>
                        <ImageLayer src={imageSrc} />
                    </Layer>
                    <ShapeLayer
                        selectedShapeId={isLocked ? null : selectedShapeId}
                        onShapeClick={isLocked ? () => {} : setSelectedShapeId}
                        // FIX: pass locked state so ShapeLayer can render shapes without selection handles
                        isLocked={isLocked}
                    />
                </Stage>
            )}
        </div>
    );
};