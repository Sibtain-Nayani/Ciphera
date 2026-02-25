import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore, RedactionShape, ShapeType } from '@/store/canvasStore';
import { ImageLayer } from './ImageLayer';
import { ShapeLayer } from './ShapeLayer';
import { FloatingToolbar } from './FloatingToolbar';

export const CanvasEngine: React.FC = () => {
    const {
        imageSrc, scale, position, setScale, setPosition,
        activeTool, addShape, updateShape, selectedShapeId, setSelectedShapeId,
        imageDimensions
    } = useCanvasStore();

    const stageRef = useRef<Konva.Stage>(null);
    const setStageRef = useCanvasStore(state => state.setStageRef);

    useEffect(() => {
        if (stageRef.current) {
            setStageRef(stageRef.current);
        }
        return () => setStageRef(null);
    }, [setStageRef]);

    const [isDrawing, setIsDrawing] = useState(false);
    const [currentShapeId, setCurrentShapeId] = useState<string | null>(null);

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

        // Limit zoom
        if (newScale < 0.1 || newScale > 10) return;

        setScale(newScale);
        setPosition({
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        });
    };

    // Drawing Logic
    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const checkSize = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };
        checkSize();
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);

    // Fit-to-screen logic
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
    }, [dimensions, imageDimensions, scale, position.x, position.y, setScale, setPosition]);

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
                draggable={activeTool === 'select' && !selectedShapeId}
                onDragEnd={(e) => {
                    if (e.target === e.target.getStage()) {
                        setPosition({ x: e.target.x(), y: e.target.y() });
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
