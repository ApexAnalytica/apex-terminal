import { describe, it, expect, beforeEach } from "vitest";
import { useApexStore } from "@/stores/useApexStore";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("setTimelineGranularity also adjusts timelineRange to a matching window", () => {
  beforeEach(() => {
    // Seed a wide full range so the granularity-derived window has room.
    const end = new Date("2025-04-15T12:00:00.000Z").getTime();
    const start = end - 365 * DAY;
    useApexStore.setState({
      timelineRange: { start, end },
      timelineFullRange: { start, end },
    });
  });

  it("hour granularity sets timelineRange to a 1-hour window ending at the existing end", () => {
    const beforeEnd = useApexStore.getState().timelineRange.end;
    useApexStore.getState().setTimelineGranularity("hour");
    const r = useApexStore.getState().timelineRange;
    expect(r.end).toBe(beforeEnd);
    expect(r.end - r.start).toBe(HOUR);
  });

  it("day granularity sets a 24-hour window", () => {
    useApexStore.getState().setTimelineGranularity("day");
    const r = useApexStore.getState().timelineRange;
    expect(r.end - r.start).toBe(DAY);
  });

  it("week granularity sets a 7-day window", () => {
    useApexStore.getState().setTimelineGranularity("week");
    const r = useApexStore.getState().timelineRange;
    expect(r.end - r.start).toBe(7 * DAY);
  });

  it("month granularity sets a 30-day window", () => {
    useApexStore.getState().setTimelineGranularity("month");
    const r = useApexStore.getState().timelineRange;
    expect(r.end - r.start).toBe(30 * DAY);
  });

  it("clamps the window start to timelineFullRange.start (never goes earlier than available data)", () => {
    const end = new Date("2025-04-15T12:00:00.000Z").getTime();
    const fullStart = end - 5 * DAY; // only 5 days of data available
    useApexStore.setState({
      timelineRange: { start: fullStart, end },
      timelineFullRange: { start: fullStart, end },
    });
    useApexStore.getState().setTimelineGranularity("month"); // wants 30 days
    const r = useApexStore.getState().timelineRange;
    expect(r.start).toBe(fullStart); // clamped, not end - 30d
    expect(r.end).toBe(end);
  });

  it("granularity field is updated alongside the range", () => {
    useApexStore.getState().setTimelineGranularity("week");
    expect(useApexStore.getState().timelineGranularity).toBe("week");
  });

  it("subsequent granularity changes are not cumulative — each anchors fresh on the existing end", () => {
    useApexStore.getState().setTimelineGranularity("hour");
    const afterHour = useApexStore.getState().timelineRange;
    useApexStore.getState().setTimelineGranularity("month");
    const afterMonth = useApexStore.getState().timelineRange;
    // Same end, but month start is much earlier than hour start
    expect(afterMonth.end).toBe(afterHour.end);
    expect(afterMonth.start).toBeLessThan(afterHour.start);
    expect(afterMonth.end - afterMonth.start).toBe(30 * DAY);
  });

  it("captures timelineFullRange on first call so successive clicks can EXPAND back, not just shrink", () => {
    // Regression for the sticky-window bug: before the fix, clicking 1H first
    // shrank timelineRange to 1H, then clicking 1M used the *shrunk* start as
    // the floor and stayed locked at 1H forever.
    useApexStore.setState({ timelineFullRange: null }); // explicitly unset
    const initialEnd = useApexStore.getState().timelineRange.end;

    useApexStore.getState().setTimelineGranularity("hour");
    const afterHour = useApexStore.getState().timelineRange;
    expect(afterHour.end - afterHour.start).toBe(HOUR);

    // timelineFullRange should now be captured (so the expand-back path works)
    expect(useApexStore.getState().timelineFullRange).not.toBeNull();

    // Clicking 1M after 1H expands back to a 30-day window
    useApexStore.getState().setTimelineGranularity("month");
    const afterMonth = useApexStore.getState().timelineRange;
    expect(afterMonth.end).toBe(initialEnd);
    expect(afterMonth.end - afterMonth.start).toBe(30 * DAY);
    expect(afterMonth.start).toBeLessThan(afterHour.start);
  });
});
