const MOBILE_BREAKPOINT = 720;
function clamp(min: number, value: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTraceMapMarkerPoint(width: number, height: number) {
  return width < MOBILE_BREAKPOINT ? getMobileMarkerPoint(width, height) : getDesktopMarkerPoint(width, height);
}

export function getDesktopMarkerPoint(width: number, height: number) {
  return {
    x: width / 2,
    y: clamp(96, height * 0.52, height - 96),
  };
}

export function getMobileMarkerPoint(width: number, height: number) {
  const panelTop = 18;
  const panelMaxHeight = Math.min(height * 0.72, 430);
  const expectedPanelHeight = Math.min(panelMaxHeight, 290);

  return {
    x: width / 2,
    y: clamp(58, panelTop + expectedPanelHeight + 10, height - 58),
  };
}
