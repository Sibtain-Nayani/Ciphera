import React, { useEffect } from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { useCanvasStore } from '@/store/canvasStore';

interface ImageLayerProps {
    src: string;
}

export const ImageLayer: React.FC<ImageLayerProps> = ({ src }) => {
    // useImage handles loading the image source into an HTMLImageElement for Konva
    const [image] = useImage(src);
    const setImageDimensions = useCanvasStore(state => state.setImageDimensions);

    useEffect(() => {
        if (image) {
            setImageDimensions({ width: image.width, height: image.height });
        }
    }, [image, setImageDimensions]);

    if (!image) {
        return null;
    }

    // We render the image at 0,0. The Stage/wrapper component will handle zooming and panning the entire canvas instance.
    return (
        <KonvaImage
            image={image}
            x={0}
            y={0}
            // Ensures image is non-interactive so dragging happens on the stage
            listening={false}
        />
    );
};
