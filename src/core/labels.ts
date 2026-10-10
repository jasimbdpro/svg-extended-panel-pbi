import { formatLabelValue, formatNumber, type SynopticDataPoint, type SynopticVisualSettings } from "./modelParsing";

export interface LabelRun { text: string; kind: "category" | "value"; }
export interface LabelSpec { element: SVGElement; text: string; runs?: LabelRun[]; }

export function buildLabelRuns(point: SynopticDataPoint, element: SVGElement, settings: SynopticVisualSettings): LabelRun[] {
    const areaName = readElementDisplayName(element);
    const category = settings.dataLabels.labelStyle === "both" ? point.key : (areaName ?? point.key);
    const value = point.value == null ? "" : formatLabelValue(point.value, settings.dataLabels.valueUnits, settings.dataLabels.valuePrecision);
    switch (settings.dataLabels.labelStyle) {
        case "value": return value ? [{ text: value, kind: "value" }] : [];
        case "both": return value ? [{ text: point.key, kind: "category" }, { text: value, kind: "value" }] : [{ text: point.key, kind: "category" }];
        case "both2": return value ? [{ text: category, kind: "category" }, { text: value, kind: "value" }] : [{ text: category, kind: "category" }];
        case "area": return [{ text: category, kind: "category" }];
        case "category":
        default: return [{ text: point.key, kind: "category" }];
    }
}

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
        const runs = label.runs ?? label.text.split("\n").map((line, index) => ({ text: line, kind: index > 0 ? "value" as const : "category" as const }));
        const lines = runs.map((run) => run.text);
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
                applyRunStyle(tspan, runs[index].kind, settings);
                tspan.textContent = line;
                text.appendChild(tspan);
            });
        } else {
            applyRunStyle(text, runs[0]?.kind ?? "category", settings);
            text.textContent = label.text;
        }
        text.setAttribute("text-anchor", top || multiline ? "start" : "middle");
        if (!top && !multiline) text.setAttribute("dominant-baseline", "middle");
        labelLayer.appendChild(text);
    }
    svgElement.appendChild(labelLayer);
}

function applyRunStyle(element: SVGElement, kind: "category" | "value", settings: SynopticVisualSettings): void {
    const labels = settings.dataLabels;
    const isValue = kind === "value";
    element.setAttribute("font-family", isValue ? labels.valueFont : labels.categoryFont);
    element.setAttribute("fill", isValue ? labels.valueColor : labels.categoryColor);
    element.setAttribute("font-weight", (isValue ? labels.valueBold : labels.categoryBold) ? "bold" : "normal");
    element.setAttribute("font-style", (isValue ? labels.valueItalic : labels.categoryItalic) ? "italic" : "normal");
    if (isValue ? labels.valueUnderline : labels.categoryUnderline) element.setAttribute("text-decoration", "underline");
}

function readElementDisplayName(element: SVGElement): string | null {
    return element.getAttribute("data-synoptic-display-name")
        ?? element.querySelector(":scope > title")?.textContent?.trim()
        ?? element.getAttribute("title")
        ?? (element.id || null);
}
