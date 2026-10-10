import { formatNumber, type SynopticDataPoint, type SynopticVisualSettings } from "./modelParsing";

export interface LabelSpec { element: SVGElement; text: string; }

export function buildLabelText(point: SynopticDataPoint, element: SVGElement, settings: SynopticVisualSettings): string {
    const areaName = readElementDisplayName(element);
    switch (settings.dataLabels.labelStyle) {
        case "area": return areaName ?? point.key;
        case "value": return point.value == null ? "" : formatNumber(point.value);
        case "both": return point.value == null ? point.key : `${point.key}\n${formatNumber(point.value)}`;
        case "both2": return point.value == null ? (areaName ?? point.key) : `${areaName ?? point.key}\n${formatNumber(point.value)}`;
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
        const lines = label.text.split("\n");
        const fontSize = settings.dataLabels.fontSize;
        const multiline = lines.length > 1;
        const y = top || !multiline ? (top ? box.y + 14 : box.y + box.height / 2) : box.y + box.height / 2 - fontSize * 0.55;
        text.setAttribute("y", `${y}`);
        text.setAttribute("font-size", `${settings.dataLabels.fontSize}`);
        text.setAttribute("class", "synoptic-label");
        if (multiline) {
            lines.forEach((line, index) => {
                const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                tspan.setAttribute("x", `${top ? box.x + 4 : box.x + box.width / 2}`);
                tspan.setAttribute("dy", index === 0 ? "0" : "1.1em");
                tspan.textContent = line;
                text.appendChild(tspan);
            });
        } else {
            text.textContent = label.text;
        }
        text.setAttribute("text-anchor", top || multiline ? "start" : "middle");
        if (!top && !multiline) text.setAttribute("dominant-baseline", "middle");
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
