/**
 * pdfRenderer.ts — V3
 * Converts a PDF file into an array of base64 Image Data URIs (one per page).
 * Returns ALL pages so the UI can navigate between them.
 */

export interface PdfPageData {
    dataUri:    string;
    pageNumber: number;
    width:      number;
    height:     number;
}

/**
 * Renders every page of a PDF at the given scale and returns them as PNG data URIs.
 * @param file   - The PDF File object
 * @param scale  - Render resolution multiplier (2.0 = retina quality)
 * @returns      - Array of PdfPageData, one entry per page
 */
export async function convertPdfToImages(
    file:  File,
    scale: number = 2.0,
): Promise<PdfPageData[]> {
    if (typeof window === 'undefined') {
        throw new Error("convertPdfToImages can only run in the browser.");
    }

    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

    const arrayBuffer  = await file.arrayBuffer();
    const pdfDocument  = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const numPages     = pdfDocument.numPages;
    const pages: PdfPageData[] = [];

    for (let i = 1; i <= numPages; i++) {
        const page     = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas   = document.createElement('canvas');
        const context  = canvas.getContext('2d');

        if (!context) throw new Error("Unable to obtain 2D context for PDF rendering.");

        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context as any, viewport }).promise;

        pages.push({
            dataUri:    canvas.toDataURL('image/png', 1.0),
            pageNumber: i,
            width:      viewport.width,
            height:     viewport.height,
        });
    }

    return pages;
}