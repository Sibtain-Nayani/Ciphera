import React from 'react';
import { Layer, Rect, Transformer } from 'react-konva';
import { useCanvasStore } from '@/store/canvasStore';
import Konva from 'konva';

interface ShapeLayerProps {
    onShapeClick: (id: string) => void;
    selectedShapeId: string | null;
}

export const ShapeLayer: React.FC<ShapeLayerProps> = ({ onShapeClick, selectedShapeId }) => {
    const { shapes, updateShape, activeTool } = useCanvasStore();
    const transformerRef = React.useRef<Konva.Transformer>(null);
    const layerRef = React.useRef<Konva.Layer>(null);

    // Sync transformer whenever selected shape changes
    React.useEffect(() => {
        if (selectedShapeId && transformerRef.current && layerRef.current) {
            const node = layerRef.current.findOne(`#${selectedShapeId}`);
            if (node) {
                transformerRef.current.nodes([node]);
                transformerRef.current.getLayer()?.batchDraw();
            }
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
        }
    }, [selectedShapeId, shapes]);

    const getShapeFill = (type: string) => {
        switch (type) {
            case 'blackout': return '#1E1E1E';         // Solid black/dark grey
            case 'blur': return 'rgba(255, 165, 0, 0.3)'; // Semi-transparent orange (placeholder for actual blur filter)
            case 'mask': return '#FFFFFF';             // Solid white mask
            default: return '#FFA500';
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
                    draggable={activeTool === 'select'}
                    onClick={(e) => {
                        e.cancelBubble = true; // prevent event bubbling to stage
                        if (activeTool === 'select') {
                            onShapeClick(shape.id);
                        }
                    }}
                    onDragEnd={(e) => {
                        updateShape(shape.id, {
                            x: e.target.x(),
                            y: e.target.y()
                        });
                    }}
                    onTransformEnd={(e) => {
                        // transformer changes scale of nodes, so we reset scale to 1 and change width/height
                        const node = e.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        node.scaleX(1);
                        node.scaleY(1);

                        updateShape(shape.id, {
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(5, node.width() * scaleX),
                            height: Math.max(5, node.height() * scaleY),
                        });
                    }}
                />
            ))}
            <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                    // Limit minimum size
                    if (newBox.width < 5 || newBox.height < 5) return oldBox;
                    return newBox;
                }}
            />
        </Layer>
    );
};
