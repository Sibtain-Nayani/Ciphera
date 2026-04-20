import React, { useRef, useState, useEffect } from 'react';
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
        activeTool, addShape, updateShape, selectedShapeId, setSelectedShapeId, deleteShape,
        imageDimensions
    } = useCanvasStore();

    const { previewMode } = useDocumentStore();

    const stageRef = useRef<Konva.Stage>(null);
    const setStageRef = useCanvasStore(state => state.setStageRef);

    useEffect(() => {
        if (stageRef.current) {
            setStageRef(stageRef.current);
        }
        return () => setStageRef(null);
    }, [setStageRef]);

    // Keyboard controls for deleting shapes
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only trigger if we aren't typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedShapeId) {
                deleteShape(selectedShapeId);
                setSelectedShapeId(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedShapeId, deleteShape, setSelectedShapeId]);

    const [isDrawing, setIsDrawing] = useState(false);
    const [currentShapeId, setCurrentShapeId] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const getMinScale = () => {
        if (!dimensions.width || !imageDimensions) return 0.1;
        const padding = 60;
        const scaleX = (dimensions.width - padding) / imageDimensions.width;
        const scaleY = (dimensions.height - padding) / imageDimensions.height;
        return Math.min(scaleX, scaleY, 1);
    };

    const minScale = getMinScale();

    const constrainPosition = (pos: { x: number, y: number }, currentScale: number) => {
        if (!imageDimensions || dimensions.width === 0) return pos;
        const imgW = imageDimensions.width * currentScale;
        const imgH = imageDimensions.height * currentScale;
        const padding = 30; // Padding from edge

        let x = pos.x;
        let y = pos.y;

        if (imgW < dimensions.width) {
            x = (dimensions.width - imgW) / 2;
        } else {
            x = Math.max(dimensions.width - imgW - padding, Math.min(padding, x));
        }

        if (imgH < dimensions.height) {
            y = (dimensions.height - imgH) / 2;
        } else {
            y = Math.max(dimensions.height - imgH - padding, Math.min(padding, y));
        }

        return { x, y };
    };

    // Zoom Handling
    const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const scaleBy = 1.1;
        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Limit zoom to fitScale or max 10x
        let finalScale = newScale;
        if (finalScale < minScale) finalScale = minScale;
        if (finalScale > 10) finalScale = 10;

        const newPos = {
            x: pointer.x - mousePointTo.x * finalScale,
            y: pointer.y - mousePointTo.y * finalScale,
        };

        setScale(finalScale);
        setPosition(constrainPosition(newPos, finalScale));
    };

    // Drawing Logic
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (previewMode === 'redacted') return;
        // If we are clicking on an existing shape, or using select tool, do not draw.
        const clickedOnEmpty = e.target === e.target.getStage();
        if (!clickedOnEmpty) {
            return;
        }

        if (activeTool === 'select') {
            setSelectedShapeId(null);
            return;
        }

        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        setIsDrawing(true);
        const newId = `shape_${Date.now()}`;
        setCurrentShapeId(newId);

        const newShape: RedactionShape = {
            id: newId,
            x: pointer.x,
            y: pointer.y,
            width: 0,
            height: 0,
            type: activeTool.replace('draw-', '') as ShapeType,
        };

        addShape(newShape);
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        if (!isDrawing || !currentShapeId) return;

        const stage = stageRef.current;
        if (!stage) return;

        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        // Find the shape and update its width/height
        // We use state accessor from Zustand implicitly by updating it.
        const state = useCanvasStore.getState();
        const shape = state.shapes.find(s => s.id === currentShapeId);
        if (!shape) return;

        updateShape(currentShapeId, {
            width: pointer.x - shape.x,
            height: pointer.y - shape.y,
        });
    };

    const handleMouseUp = () => {
        if (isDrawing && currentShapeId) {
            const state = useCanvasStore.getState();
            const shape = state.shapes.find(s => s.id === currentShapeId);
            // Cleanup visually zero-sized rectangles
            if (shape && Math.abs(shape.width) < 5 && Math.abs(shape.height) < 5) {
                useCanvasStore.getState().deleteShape(currentShapeId);
            }
        }
        setIsDrawing(false);
        setCurrentShapeId(null);
    };

    // Automatic resizing of canvas to fit container
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const target = containerRef.current;
        if (!target) return;

        const observer = new ResizeObserver((entries) => {
            for (let entry of entries) {
                if (entry.contentBoxSize) {
                    setDimensions({
                        width: entry.contentRect.width,
                        height: entry.contentRect.height,
                    });
                }
            }
        });

        observer.observe(target);
        
        // Initial set
        setDimensions({
            width: target.offsetWidth,
            height: target.offsetHeight,
        });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (dimensions.width > 0 && dimensions.height > 0 && imageDimensions && scale === 1 && position.x === 0 && position.y === 0) {
            const padding = 60; // Extra padding around the image
            const scaleX = (dimensions.width - padding) / imageDimensions.width;
            const scaleY = (dimensions.height - padding) / imageDimensions.height;
            const fitScale = Math.min(scaleX, scaleY, 1); // Do not scale up past 100%

            setScale(fitScale);
            setPosition({
                x: (dimensions.width - (imageDimensions.width * fitScale)) / 2,
                y: (dimensions.height - (imageDimensions.height * fitScale)) / 2,
            });
        }
    }, [dimensions, imageDimensions, scale, position, setScale, setPosition]);

    // Empty state if no image
    if (!imageSrc) {
        return null;
    }

    return (
        <div ref={containerRef} className="relative w-full h-full bg-[#121212] overflow-hidden">
            <FloatingToolbar />

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
                draggable={activeTool === 'select' && previewMode === 'original' && !selectedShapeId}
                dragBoundFunc={(pos) => constrainPosition(pos, scale)}
                onDragEnd={(e) => {
                    if (e.target === e.target.getStage()) {
                        const finalPos = constrainPosition({ x: e.target.x(), y: e.target.y() }, scale);
                        setPosition(finalPos);
                        e.target.position(finalPos);
                    }
                }}
                ref={stageRef}
                className="cursor-crosshair w-full h-full"
                style={{ cursor: activeTool === 'select' ? 'grab' : 'crosshair' }}
            >
                <Layer>
                    <ImageLayer src={imageSrc} />
                </Layer>
                <ShapeLayer
                    selectedShapeId={selectedShapeId}
                    onShapeClick={setSelectedShapeId}
                />
            </Stage>
        </div>
    );
};
