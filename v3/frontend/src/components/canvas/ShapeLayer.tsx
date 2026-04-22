import React from 'react';
import { Layer, Rect, Transformer } from 'react-konva';
import { useCanvasStore } from '@/store/canvasStore';
import { useDocumentStore } from '@/store/documentStore';
import Konva from 'konva';

interface ShapeLayerProps {
    onShapeClick:    (id: string) => void;
    selectedShapeId: string | null;
    isLocked?:       boolean;   // when true: no selection handles, no dragging
}

export const ShapeLayer: React.FC<ShapeLayerProps> = ({
    onShapeClick,
    selectedShapeId,
    isLocked = false,
}) => {
    const { shapes, updateShape, activeTool } = useCanvasStore();
    const { previewMode } = useDocumentStore();

    const transformerRef = React.useRef<Konva.Transformer>(null);
    const layerRef       = React.useRef<Konva.Layer>(null);

    // Sync transformer — disabled in locked mode
    React.useEffect(() => {
        if (!isLocked && selectedShapeId && previewMode === 'original' && transformerRef.current && layerRef.current) {
            const node = layerRef.current.findOne(`#${selectedShapeId}`);
            if (node) {
                transformerRef.current.nodes([node]);
                transformerRef.current.getLayer()?.batchDraw();
            }
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
        }
    }, [selectedShapeId, shapes, previewMode, isLocked]);

    const getShapeFill = (type: string) => {
        switch (type) {
            case 'blackout': return '#1a1a1a';
            case 'blur':     return 'rgba(255, 165, 0, 0.3)';
            case 'mask':     return '#FFFFFF';
            default:         return '#FFA500';
        }
    };

    return (
        <Layer ref={layerRef}>
            {shapes.map((shape) => (
                <Rect
                    key={shape.id}
                    id={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={getShapeFill(shape.type)}
                    // Locked mode: no interaction at all
                    draggable={!isLocked && activeTool === 'select' && previewMode === 'original'}
                    listening={!isLocked}
                    onClick={(e) => {
                        if (isLocked) return;
                        e.cancelBubble = true;
                        if (activeTool === 'select' && previewMode === 'original') {
                            onShapeClick(shape.id);
                        }
                    }}
                    onDragEnd={(e) => {
                        if (isLocked) return;
                        updateShape(shape.id, { x: e.target.x(), y: e.target.y() });
                    }}
                    onTransformEnd={(e) => {
                        if (isLocked) return;
                        const node  = e.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        node.scaleX(1);
                        node.scaleY(1);
                        updateShape(shape.id, {
                            x:      node.x(),
                            y:      node.y(),
                            width:  Math.max(5, node.width()  * scaleX),
                            height: Math.max(5, node.height() * scaleY),
                        });
                    }}
                />
            ))}
            {/* Transformer hidden in locked mode */}
            {!isLocked && (
                <Transformer
                    ref={transformerRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </Layer>
    );
};