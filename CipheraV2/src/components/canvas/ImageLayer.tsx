import React from 'react';
import { Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';

interface ImageLayerProps {
    src: string;
}

export const ImageLayer: React.FC<ImageLayerProps> = ({ src }) => {
    // useImage handles loading the image source into an HTMLImageElement for Konva
    const [image] = useImage(src);

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
