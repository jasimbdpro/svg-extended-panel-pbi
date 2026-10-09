import { formatNumber, type SynopticDataPoint, type SynopticVisualSettings } from "./modelParsing";

export interface LabelSpec { element: SVGElement; text: string; }

export function buildLabelText(point: SynopticDataPoint, element: SVGElement, settings: SynopticVisualSettings): string {
    const areaName = readElementDisplayName(element);
    switch (settings.dataLabels.labelStyle) {
        case "area": return areaName ?? point.key;
        case "value": return point.value == null ? "" : formatNumber(point.value);
        case "both": return point.value == null ? point.key : `${point.key} ${formatNumber(point.value)}`;
        case "both2": return point.value == null ? (areaName ?? point.key) : `${areaName ?? point.key} ${formatNumber(point.value)}`;
        case "category":
        default: return point.key;
    }
}

export function buildUnmatchedLabelText(element: SVGElement, settings: SynopticVisualSettings): string {
    if (settings.dataLabels.labelStyle === "value") return "";
    return readElementDisplayName(element) ?? "";
}

export function renderLabels(svgElement: SVGSVGElement, labels: LabelSpec[], settings: SynopticVisualSettings): void {
    const labelLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelLayer.setAttribute("class", "synoptic-label-layer");
    labelLayer.setAttribute("pointer-events", "none");
    for (const label of labels) {
        const box = (label.element as SVGGraphicsElement).getBBox();
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const top = settings.dataLabels.position === "top";
        text.setAttribute("x", `${top ? box.x + 4 : box.x + box.width / 2}`);
        text.setAttribute("y", `${top ? box.y + 14 : box.y + box.height / 2}`);
        text.setAttribute("font-size", `${settings.dataLabels.fontSize}`);
        text.setAttribute("class", "synoptic-label");
        text.textContent = label.text;
        text.setAttribute("text-anchor", top ? "start" : "middle");
        if (!top) text.setAttribute("dominant-baseline", "middle");
        labelLayer.appendChild(text);
    }
    svgElement.appendChild(labelLayer);
}

function readElementDisplayName(element: SVGElement): string | null {
    return element.getAttribute("data-synoptic-display-name")
        ?? element.querySelector(":scope > title")?.textContent?.trim()
        ?? element.getAttribute("title")
        ?? (element.id || null);
}
