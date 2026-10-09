import type powerbi from "powerbi-visuals-api";

type SelectionId = powerbi.visuals.ISelectionId;

export function applySelectionState(svg: SVGSVGElement, matchedElements: Set<SVGElement>, selections: SelectionId[]): void {
    const hasSelection = selections.length > 0;
    const hasHighlights = svg.getAttribute("data-has-highlights") === "true";
    const activeKeys = new Set(selections.map((selection) => selection.getKey()));
    if (!hasSelection && !hasHighlights) {
        svg.removeAttribute("data-synoptic-dimmed");
        for (const element of matchedElements) element.removeAttribute("data-synoptic-active");
        return;
    }
    svg.setAttribute("data-synoptic-dimmed", "true");
    for (const element of matchedElements) {
        const active = hasSelection
            ? activeKeys.has(element.getAttribute("data-selection-key") ?? "")
            : element.getAttribute("data-highlighted") === "true";
        if (active) element.setAttribute("data-synoptic-active", "true");
        else element.removeAttribute("data-synoptic-active");
    }
}
