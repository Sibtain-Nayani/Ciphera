
/**
 * Converts a PDF file into an array of base64 Image Data URIs (one for each page).
 * This allows us to load the PDF seamlessly into the react-konva CanvasEngine.
 */
export async function convertPdfToImages(file: File): Promise<string[]> {
    if (typeof window === 'undefined') {
        throw new Error("convertPdfToImages can only be run in the browser.");
    }

    // Dynamically import pdfjs-dist only on the client to prevent SSR DOMMatrix errors
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();

    // Load the PDF document
    const pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    const numPages = pdfDocument.numPages;
    const images: string[] = [];

    // Render each page to an off-screen canvas and extract the Data URI
    for (let i = 1; i <= numPages; i++) {
        const page = await pdfDocument.getPage(i);

        // Use a viewport scale of 2.0 or 3.0 for higher rendering resolution
        const viewport = page.getViewport({ scale: 2.0 });

        // Create an off-screen canvas element
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error("Unable to obtain 2D context for PDF rendering.");
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render PDF page into canvas context
        const renderContext: any = {
            canvasContext: context,
            viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Extract high-quality image data
        const dataUri = canvas.toDataURL('image/png', 1.0);
        images.push(dataUri);
    }

    return images;
}
