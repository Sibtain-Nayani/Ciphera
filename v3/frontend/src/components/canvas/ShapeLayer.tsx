import React from 'react';
import { Layer, Rect, Text, Transformer, Group } from 'react-konva';
import { useCanvasStore } from '@/store/canvasStore';
import { useDocumentStore } from '@/store/documentStore';
import Konva from 'konva';

interface ShapeLayerProps {
    onShapeClick:    (id: string) => void;
    selectedShapeId: string | null;
    isLocked?:       boolean;
}

// Professional redaction styles — no raw black boxes
// Uses a dark charcoal with slight opacity so it looks like
// a deliberate redaction mark, not a rendering error
const REDACTION_STYLE = {
    // Main fill: very dark charcoal, slightly transparent
    fill:         'rgba(20, 20, 20, 0.92)',
    // Subtle border so the redaction area is clearly defined
    stroke:       'rgba(80, 80, 80, 0.4)',
    strokeWidth:  0.5,
    cornerRadius: 2,
};

const BLUR_STYLE = {
    fill:        'rgba(255, 165, 0, 0.25)',
    stroke:      'rgba(255, 165, 0, 0.5)',
    strokeWidth: 1,
    cornerRadius: 2,
};

const MASK_STYLE = {
    // White mask — blends with white document backgrounds
    fill:        'rgba(245, 245, 245, 0.97)',
    stroke:      'rgba(200, 200, 200, 0.4)',
    strokeWidth: 0.5,
    cornerRadius: 2,
};

export const ShapeLayer: React.FC<ShapeLayerProps> = ({
    onShapeClick,
    selectedShapeId,
    isLocked = false,
}) => {
    const { shapes, updateShape, activeTool } = useCanvasStore();
    const { previewMode }                     = useDocumentStore();

    const transformerRef = React.useRef<Konva.Transformer>(null);
    const layerRef       = React.useRef<Konva.Layer>(null);

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

    const getStyle = (type: string) => {
        switch (type) {
            case 'blur':  return BLUR_STYLE;
            case 'mask':  return MASK_STYLE;
            default:      return REDACTION_STYLE;  // 'blackout' and everything else
        }
    };

    // Determine if we should show the [REDACTED] text label
    // Only show when shape is big enough (height > 14px) to avoid overflow
    const shouldShowLabel = (width: number, height: number) =>
        Math.abs(width) > 60 && Math.abs(height) > 14;

    return (
        <Layer ref={layerRef}>
            {shapes.map((shape) => {
                const style      = getStyle(shape.type);
                const showLabel  = shouldShowLabel(shape.width, shape.height);
                const absW       = Math.abs(shape.width);
                const absH       = Math.abs(shape.height);
                // Normalize negative width/height (drawn right-to-left or bottom-up)
                const normX      = shape.width  < 0 ? shape.x + shape.width  : shape.x;
                const normY      = shape.height < 0 ? shape.y + shape.height : shape.y;

                return (
                    <Group
                        key={shape.id}
                        id={shape.id}
                        x={normX}
                        y={normY}
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
                            const node = e.target;
                            const sx = node.scaleX(), sy = node.scaleY();
                            node.scaleX(1); node.scaleY(1);
                            updateShape(shape.id, {
                                x: node.x(), y: node.y(),
                                width:  Math.max(5, absW * sx),
                                height: Math.max(5, absH * sy),
                            });
                        }}
                    >
                        {/* Main redaction rectangle */}
                        <Rect
                            x={0}
                            y={0}
                            width={absW}
                            height={absH}
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth}
                            cornerRadius={style.cornerRadius}
                        />

                        {/* [REDACTED] label — shown when shape is large enough */}
                        {showLabel && shape.type !== 'mask' && (
                            <Text
                                x={0}
                                y={0}
                                width={absW}
                                height={absH}
                                text="[REDACTED]"
                                fontSize={Math.min(11, Math.max(7, absH * 0.45))}
                                fontFamily="'JetBrains Mono', 'Courier New', monospace"
                                fontStyle="normal"
                                fill="rgba(160, 160, 160, 0.5)"
                                align="center"
                                verticalAlign="middle"
                                listening={false}
                            />
                        )}
                    </Group>
                );
            })}

            {!isLocked && (
                <Transformer
                    ref={transformerRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                        return newBox;
                    }}
                    anchorStroke="#FFA500"
                    anchorFill="#FFA500"
                    anchorSize={8}
                    borderStroke="#FFA500"
                    borderDash={[4, 4]}
                />
            )}
        </Layer>
    );
};