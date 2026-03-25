import { describe, expect, it } from "vitest";
import {
  calculateRoas,
  calculateCpa,
  extractConversions,
  extractConversionValue,
} from "./metaAdsService";

describe("metaAdsService calculations", () => {
  describe("calculateRoas", () => {
    it("returns correct ROAS when spend > 0", () => {
      expect(calculateRoas(100, 300)).toBe(3);
      expect(calculateRoas(50, 150)).toBe(3);
    });

    it("returns 0 when spend is 0", () => {
      expect(calculateRoas(0, 300)).toBe(0);
    });

    it("returns 0 when conversion value is 0", () => {
      expect(calculateRoas(100, 0)).toBe(0);
    });
  });

  describe("calculateCpa", () => {
    it("returns correct CPA when conversions > 0", () => {
      expect(calculateCpa(100, 5)).toBe(20);
      expect(calculateCpa(300, 10)).toBe(30);
    });

    it("returns 0 when conversions is 0", () => {
      expect(calculateCpa(100, 0)).toBe(0);
    });

    it("returns 0 when spend is 0", () => {
      expect(calculateCpa(0, 5)).toBe(0);
    });
  });

  describe("extractConversions", () => {
    it("extracts purchase conversions from actions array", () => {
      const actions = [
        { action_type: "purchase", value: "5" },
        { action_type: "link_click", value: "100" },
        { action_type: "omni_purchase", value: "3" },
      ];
      const result = extractConversions(actions);
      expect(result).toBe(8); // 5 + 3
    });

    it("returns 0 for empty actions", () => {
      expect(extractConversions([])).toBe(0);
    });

    it("returns 0 for undefined actions", () => {
      expect(extractConversions(undefined)).toBe(0);
    });

    it("returns 0 when no purchase actions", () => {
      const actions = [{ action_type: "link_click", value: "100" }];
      expect(extractConversions(actions)).toBe(0);
    });
  });

  describe("extractConversionValue", () => {
    it("extracts purchase conversion value", () => {
      const actionValues = [
        { action_type: "purchase", value: "500.00" },
        { action_type: "link_click", value: "0" },
      ];
      const result = extractConversionValue(actionValues);
      expect(result).toBe(500);
    });

    it("returns 0 for empty action values", () => {
      expect(extractConversionValue([])).toBe(0);
    });

    it("returns 0 for undefined", () => {
      expect(extractConversionValue(undefined)).toBe(0);
    });
  });
});

describe("anomaly detection logic", () => {
  it("detects ROAS drop correctly", () => {
    const roasDrop = (current: number, previous: number) => {
      if (previous === 0) return false;
      return (previous - current) / previous > 0.3;
    };
    expect(roasDrop(1.0, 2.0)).toBe(true); // 50% drop
    expect(roasDrop(1.8, 2.0)).toBe(false); // 10% drop - not anomaly
    expect(roasDrop(0, 2.0)).toBe(true); // 100% drop
  });

  it("detects CPA spike correctly", () => {
    const cpaSpiked = (current: number, previous: number) => {
      if (previous === 0) return false;
      return (current - previous) / previous > 0.5;
    };
    expect(cpaSpiked(90, 50)).toBe(true); // 80% increase
    expect(cpaSpiked(60, 50)).toBe(false); // 20% increase - not anomaly
  });
});
