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

/**
 * Redaction fill strategy:
 *
 * The goal is fully OPAQUE boxes that camouflage with the document background.
 * For most documents (white/light paper), use near-white.
 * For dark documents, use near-black.
 *
 * We sample the background from the canvas imageDimensions context.
 * As a practical default:
 *   - 'blackout' type → solid dark (#1a1a1a), fully opaque — looks like
 *     official legal redaction (the classic marker-on-paper look)
 *   - 'mask' type → solid white (#f5f5f5), fully opaque — camouflages
 *     on white paper backgrounds
 *   - 'blur' type → orange tint overlay (used for review, not final export)
 *
 * opacity is always 1.0 — nothing underneath is visible.
 */

export const ShapeLayer: React.FC<ShapeLayerProps> = ({
    onShapeClick,
    selectedShapeId,
    isLocked = false,
}) => {
    const { shapes, updateShape, activeTool } = useCanvasStore();
    const { previewMode } = useDocumentStore();

    const transformerRef = React.useRef<Konva.Transformer>(null);
    const layerRef       = React.useRef<Konva.Layer>(null);

    React.useEffect(() => {
        if (
            !isLocked &&
            selectedShapeId &&
            previewMode === 'original' &&
            transformerRef.current &&
            layerRef.current
        ) {
            const node = layerRef.current.findOne(`#shape-${selectedShapeId}`);
            if (node) {
                transformerRef.current.nodes([node]);
                transformerRef.current.getLayer()?.batchDraw();
            }
        } else if (transformerRef.current) {
            transformerRef.current.nodes([]);
        }
    }, [selectedShapeId, shapes, previewMode, isLocked]);

    /**
     * Returns fully opaque fill for each redaction type.
     * blackout = very dark charcoal (standard legal redaction appearance)
     * mask     = off-white (matches white document backgrounds)
     * blur     = orange tint (preview indicator, not for final export)
     */
    const getFill = (type: string): string => {
        switch (type) {
            case 'mask':  return '#F0F0F0';            // white paper camouflage
            case 'blur':  return 'rgba(255,165,0,0.6)'; // orange review indicator
            default:      return '#1C1C1C';             // solid dark — classic redaction
        }
    };

    const getStroke = (type: string): string => {
        switch (type) {
            case 'mask': return '#CCCCCC';
            case 'blur': return '#FFA500';
            default:     return '#111111';
        }
    };

    /**
     * Show "[REDACTED]" label only for blackout type and only when
     * the box is tall enough (≥18px) to fit text without overflow.
     */
    const shouldShowLabel = (type: string, w: number, h: number) =>
        type === 'blackout' && Math.abs(w) > 70 && Math.abs(h) >= 14;

    const getLabelColor = (type: string) =>
        type === 'mask' ? '#888888' : '#555555';

    return (
        <Layer ref={layerRef}>
            {shapes.map((shape) => {
                // Normalize negative dimensions (drawn right-to-left or bottom-up)
                const absW = Math.abs(shape.width);
                const absH = Math.abs(shape.height);
                const normX = shape.width  < 0 ? shape.x + shape.width  : shape.x;
                const normY = shape.height < 0 ? shape.y + shape.height : shape.y;

                const fill       = getFill(shape.type);
                const stroke     = getStroke(shape.type);
                const showLabel  = shouldShowLabel(shape.type, shape.width, shape.height);
                // Font size scales with box height, clamped to 7–11px
                const fontSize   = Math.min(11, Math.max(7, Math.round(absH * 0.5)));

                return (
                    <Group
                        key={shape.id}
                        id={`shape-${shape.id}`}
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
                            // After drag, position is on the Group, not the shape coords
                            updateShape(shape.id, {
                                x: normX + (e.target.x() - normX),
                                y: normY + (e.target.y() - normY),
                            });
                        }}
                        onTransformEnd={(e) => {
                            if (isLocked) return;
                            const node = e.target;
                            const sx = node.scaleX();
                            const sy = node.scaleY();
                            node.scaleX(1);
                            node.scaleY(1);
                            updateShape(shape.id, {
                                x:      node.x(),
                                y:      node.y(),
                                width:  Math.max(5, absW * sx),
                                height: Math.max(5, absH * sy),
                            });
                        }}
                    >
                        {/* Fully opaque redaction rectangle */}
                        <Rect
                            x={0}
                            y={0}
                            width={absW}
                            height={absH}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={0.5}
                            opacity={1}           // FULLY opaque — nothing shows through
                            cornerRadius={1}
                        />

                        {/* Subtle [REDACTED] stamp — only on blackout, only when large enough */}
                        {showLabel && (
                            <Text
                                x={0}
                                y={0}
                                width={absW}
                                height={absH}
                                text="[REDACTED]"
                                fontSize={fontSize}
                                fontFamily="IBM Plex Mono, monospace"
                                fill={getLabelColor(shape.type)}
                                align="center"
                                verticalAlign="middle"
                                listening={false}
                                opacity={0.6}
                            />
                        )}
                    </Group>
                );
            })}

            {!isLocked && (
                <Transformer
                    ref={transformerRef}
                    anchorStroke="#FFA500"
                    anchorFill="#FFA500"
                    anchorSize={7}
                    borderStroke="#FFA500"
                    borderDash={[3, 3]}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 5 || newBox.height < 5) return oldBox;
                        return newBox;
                    }}
                />
            )}
        </Layer>
    );
};