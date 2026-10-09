import type powerbi from "powerbi-visuals-api";

export function attachTooltipEvents(
    element: SVGElement,
    root: HTMLElement,
    service: powerbi.extensibility.ITooltipService,
    items: powerbi.extensibility.VisualTooltipDataItem[],
    selectionId: powerbi.visuals.ISelectionId
): void {
    if (!service.enabled()) return;
    const coordinates = (event: MouseEvent): number[] => {
        const rect = root.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    };
    element.addEventListener("mouseover", (event: MouseEvent) => service.show({
        coordinates: coordinates(event), isTouchEvent: false, dataItems: items, identities: [selectionId]
    }));
    element.addEventListener("mousemove", (event: MouseEvent) => service.move({
        coordinates: coordinates(event), isTouchEvent: false, dataItems: items, identities: [selectionId]
    }));
    element.addEventListener("mouseout", () => service.hide({ isTouchEvent: false, immediately: false }));
}
