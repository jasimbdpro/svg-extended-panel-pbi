import { describe, expect, it } from "vitest";
import { buildLabelText } from "./labels";
import type { SynopticDataPoint, SynopticVisualSettings } from "./modelParsing";

function labelText(labelStyle: string, value: number | null, displayName?: string): string {
    const point = { key: "Machine A", value } as SynopticDataPoint;
    const element = {
        getAttribute: (name: string) => name === "data-synoptic-display-name" ? displayName ?? null : null,
        querySelector: () => null,
        id: ""
    } as unknown as SVGElement;
    const settings = { dataLabels: { labelStyle } } as SynopticVisualSettings;
    return buildLabelText(point, element, settings);
}

describe("buildLabelText", () => {
    it("puts a data value on its own line for Column and value", () => {
        expect(labelText("both", 42)).toBe("Machine A\n42");
    });

    it("puts a data value on its own line for Area and value", () => {
        expect(labelText("both2", 42, "Area A")).toBe("Area A\n42");
    });

    it("keeps a single line when no value is available", () => {
        expect(labelText("both", null)).toBe("Machine A");
        expect(labelText("both2", null, "Area A")).toBe("Area A");
    });

    it("preserves the single value label modes", () => {
        expect(labelText("category", 42)).toBe("Machine A");
        expect(labelText("value", 42)).toBe("42");
        expect(labelText("area", 42, "Area A")).toBe("Area A");
    });
});
