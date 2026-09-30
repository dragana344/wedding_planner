"use client";

import { useEffect, useRef, useState } from "react";

export const PX_PER_CM = 0.4;

/** A dashed frame around grouped tables (B3); purely visual. */
export interface CanvasGroup {
  id: string;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
  label: string;
}

const GROUP_PAD_CM = 30;

export interface CanvasElement {
  id: string;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
  color: string;
  label: string | null;
  shape: "rect" | "circle";
  locked?: boolean;
  rotationDeg?: number;
  /** Gold outline: picked in the "Сите маси" view. */
  highlighted?: boolean;
  /** Seat fill state of a table (B5), exposed for tests and styling. */
  occupancy?: "free" | "partial" | "full";
  /** Small second line under the label, e.g. "7/10". */
  badge?: string;
}

interface DragInfo {
  mode: "move" | "resize" | "rotate";
  id: string;
  startClientX: number;
  startClientY: number;
  origXCm: number;
  origYCm: number;
  origWidthCm: number;
  origHeightCm: number;
  centerPageX?: number;
  centerPageY?: number;
  startAngleDeg?: number;
  origRotationDeg?: number;
}

interface LiveRotation {
  id: string;
  deg: number;
}

interface LiveGeometry {
  id: string;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
}

const MIN_SIZE_CM = 20;

function boxesOverlap(a: LiveGeometry, b: LiveGeometry): boolean {
  return (
    a.x_cm < b.x_cm + b.width_cm &&
    a.x_cm + a.width_cm > b.x_cm &&
    a.y_cm < b.y_cm + b.height_cm &&
    a.y_cm + a.height_cm > b.y_cm
  );
}

function findOverlappingIds(geometries: (LiveGeometry & { id: string })[]): Set<string> {
  const overlapping = new Set<string>();
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      if (boxesOverlap(geometries[i], geometries[j])) {
        overlapping.add(geometries[i].id);
        overlapping.add(geometries[j].id);
      }
    }
  }
  return overlapping;
}

export function FloorPlanCanvas({
  widthCm,
  heightCm,
  elements,
  selectedElementId,
  onSelect,
  onMoveEnd,
  onResizeEnd,
  onRotateEnd,
  onDelete,
  mode = "edit",
  selectedIds,
  onToggleSelect,
  groups = [],
  zoom = 1,
}: {
  widthCm: number;
  heightCm: number;
  elements: CanvasElement[];
  selectedElementId?: string | null;
  onSelect: (id: string | null) => void;
  onMoveEnd: (id: string, xCm: number, yCm: number) => void;
  onResizeEnd: (id: string, widthCm: number, heightCm: number) => void;
  onRotateEnd: (id: string, rotationDeg: number) => void;
  onDelete: (id: string) => void;
  mode?: "edit" | "select";
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  groups?: CanvasGroup[];
  /** Display scale (B4 zoom buttons); geometry stays in centimetres. */
  zoom?: number;
}) {
  const pxPerCm = PX_PER_CM * zoom;

  // Touch: the svg is touch-none (drags need every pointer move), so a finger
  // on the empty floor pans instead — the plan's scroll box sideways, the
  // page up and down.
  const panRef = useRef<{ x: number; y: number; scroller: HTMLElement | null } | null>(null);
  useEffect(() => {
    function move(e: PointerEvent) {
      const pan = panRef.current;
      if (!pan) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (pan.scroller) pan.scroller.scrollLeft -= dx;
      if (dy) window.scrollBy(0, -dy);
      pan.x = e.clientX;
      pan.y = e.clientY;
    }
    function end() {
      panRef.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  function scrollParent(el: HTMLElement | null): HTMLElement | null {
    for (let node = el; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return node;
    }
    return null;
  }
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const liveGeometryRef = useRef<LiveGeometry | null>(null);
  const [liveGeometry, setLiveGeometry] = useState<LiveGeometry | null>(null);
  const liveRotationRef = useRef<LiveRotation | null>(null);
  const [liveRotation, setLiveRotation] = useState<LiveRotation | null>(null);

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const el = elements.find((candidate) => candidate.id === drag.id);
      if (!el) return;

      if (drag.mode === "rotate") {
        const currentAngleDeg =
          (Math.atan2(e.clientY - drag.centerPageY!, e.clientX - drag.centerPageX!) * 180) / Math.PI;
        const deltaDeg = currentAngleDeg - drag.startAngleDeg!;
        const rotationDeg = Math.round((((drag.origRotationDeg! + deltaDeg) % 360) + 360) % 360);
        const nextRotation: LiveRotation = { id: drag.id, deg: rotationDeg };
        liveRotationRef.current = nextRotation;
        setLiveRotation(nextRotation);
        return;
      }

      const dxCm = (e.clientX - drag.startClientX) / pxPerCm;
      const dyCm = (e.clientY - drag.startClientY) / pxPerCm;

      let next: LiveGeometry;
      if (drag.mode === "move") {
        const maxXCm = Math.max(0, widthCm - el.width_cm);
        const maxYCm = Math.max(0, heightCm - el.height_cm);
        const x_cm = Math.max(0, Math.min(drag.origXCm + dxCm, maxXCm));
        const y_cm = Math.max(0, Math.min(drag.origYCm + dyCm, maxYCm));
        next = { id: drag.id, x_cm, y_cm, width_cm: el.width_cm, height_cm: el.height_cm };
      } else {
        const maxWidthCm = Math.max(MIN_SIZE_CM, widthCm - el.x_cm);
        const maxHeightCm = Math.max(MIN_SIZE_CM, heightCm - el.y_cm);
        const width_cm = Math.max(MIN_SIZE_CM, Math.min(drag.origWidthCm + dxCm, maxWidthCm));
        const height_cm = Math.max(MIN_SIZE_CM, Math.min(drag.origHeightCm + dyCm, maxHeightCm));
        next = { id: drag.id, x_cm: el.x_cm, y_cm: el.y_cm, width_cm, height_cm };
      }
      liveGeometryRef.current = next;
      setLiveGeometry(next);
    }

    function handlePointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === "rotate") {
        const current = liveRotationRef.current;
        if (current && current.id === drag.id) {
          onRotateEnd(drag.id, current.deg);
        }
        liveRotationRef.current = null;
        setLiveRotation(null);
        dragRef.current = null;
        return;
      }
      const current = liveGeometryRef.current;
      if (current && current.id === drag.id) {
        if (drag.mode === "move") {
          onMoveEnd(drag.id, current.x_cm, current.y_cm);
        } else {
          onResizeEnd(drag.id, current.width_cm, current.height_cm);
        }
      }
      liveGeometryRef.current = null;
      setLiveGeometry(null);
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [elements, widthCm, heightCm, onMoveEnd, onResizeEnd, onRotateEnd, pxPerCm]);

  function startMove(el: CanvasElement, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(el.id);
    if (el.locked) return;
    dragRef.current = {
      mode: "move",
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXCm: el.x_cm,
      origYCm: el.y_cm,
      origWidthCm: el.width_cm,
      origHeightCm: el.height_cm,
    };
  }

  function startResize(el: CanvasElement, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(el.id);
    dragRef.current = {
      mode: "resize",
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXCm: el.x_cm,
      origYCm: el.y_cm,
      origWidthCm: el.width_cm,
      origHeightCm: el.height_cm,
    };
  }

  function startSelect(el: CanvasElement, e: React.PointerEvent) {
    e.stopPropagation();
    if (el.locked) return;
    onToggleSelect?.(el.id);
  }

  function startRotate(el: CanvasElement, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(el.id);
    if (el.locked) return;
    const svgRect = canvasRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const centerPageX = svgRect.left + (el.x_cm + el.width_cm / 2) * pxPerCm;
    const centerPageY = svgRect.top + (el.y_cm + el.height_cm / 2) * pxPerCm;
    const startAngleDeg = (Math.atan2(e.clientY - centerPageY, e.clientX - centerPageX) * 180) / Math.PI;
    dragRef.current = {
      mode: "rotate",
      id: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXCm: el.x_cm,
      origYCm: el.y_cm,
      origWidthCm: el.width_cm,
      origHeightCm: el.height_cm,
      centerPageX,
      centerPageY,
      startAngleDeg,
      origRotationDeg: el.rotationDeg ?? 0,
    };
  }

  const gridStepPx = 50 * pxPerCm;

  const resolvedGeometries = elements.map((el) =>
    liveGeometry && liveGeometry.id === el.id ? liveGeometry : el
  );
  const overlappingIds = findOverlappingIds(resolvedGeometries);

  return (
    <svg
      ref={canvasRef}
      data-testid="floor-plan-canvas"
      width={widthCm * pxPerCm}
      height={heightCm * pxPerCm}
      onPointerDown={(e) => {
        if (mode === "edit") onSelect(null);
        // Only the bare floor pans; elements stop propagation themselves.
        panRef.current = { x: e.clientX, y: e.clientY, scroller: scrollParent(canvasRef.current?.parentElement ?? null) };
      }}
      // touch-none: on touch/tablet, pointer events drive drags; the browser must not pan.
      className="touch-none rounded-lg border border-neutral-200 bg-neutral-50"
    >
      <defs>
        <pattern id="floor-plan-grid" width={gridStepPx} height={gridStepPx} patternUnits="userSpaceOnUse">
          <path d={`M ${gridStepPx} 0 L 0 0 0 ${gridStepPx}`} fill="none" stroke="#e4e7eb" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#floor-plan-grid)" pointerEvents="none" />

      {groups.map((g) => (
        <g key={g.id} data-testid={`floor-plan-group-${g.id}`} pointerEvents="none">
          <rect
            x={(g.x_cm - GROUP_PAD_CM) * pxPerCm}
            y={(g.y_cm - GROUP_PAD_CM) * pxPerCm}
            width={(g.width_cm + 2 * GROUP_PAD_CM) * pxPerCm}
            height={(g.height_cm + 2 * GROUP_PAD_CM) * pxPerCm}
            rx={8}
            fill="rgba(184,145,58,0.06)"
            stroke="#B8913A"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text x={(g.x_cm - GROUP_PAD_CM) * pxPerCm + 4} y={(g.y_cm - GROUP_PAD_CM) * pxPerCm - 4} fontSize={10} fill="#8a6a22">
            {g.label}
          </text>
        </g>
      ))}

      {elements.map((el) => {
        const geometry: LiveGeometry = liveGeometry && liveGeometry.id === el.id ? liveGeometry : el;
        const isSelected = mode === "select" ? (selectedIds ?? []).includes(el.id) : el.id === selectedElementId;
        const isOverlapping = overlappingIds.has(el.id);
        const centerX = (geometry.x_cm + geometry.width_cm / 2) * pxPerCm;
        const centerY = (geometry.y_cm + geometry.height_cm / 2) * pxPerCm;
        const rotationDeg = liveRotation && liveRotation.id === el.id ? liveRotation.deg : el.rotationDeg ?? 0;
        const shapeProps = {
          "data-testid": `floor-plan-element-${el.id}`,
          onPointerDown: (e: React.PointerEvent) => (mode === "select" ? startSelect(el, e) : startMove(el, e)),
          "data-highlighted": el.highlighted ? "true" : undefined,
          "data-occupancy": el.occupancy,
          fill: el.color,
          stroke: isOverlapping ? "#dc2626" : el.highlighted ? "#B8913A" : isSelected ? "#171717" : "none",
          strokeWidth: isOverlapping || el.highlighted ? 3 : isSelected ? 2 : 0,
          strokeDasharray: isOverlapping ? "4 2" : undefined,
          style: { cursor: el.locked ? "default" : mode === "select" ? "pointer" : "grab" },
        };

        return (
          <g
            key={el.id}
            data-testid={`floor-plan-rotation-group-${el.id}`}
            transform={rotationDeg ? `rotate(${rotationDeg} ${centerX} ${centerY})` : undefined}
          >
            {el.shape === "circle" ? (
              <circle cx={centerX} cy={centerY} r={(geometry.width_cm / 2) * pxPerCm} {...shapeProps} />
            ) : (
              <rect
                x={geometry.x_cm * pxPerCm}
                y={geometry.y_cm * pxPerCm}
                width={geometry.width_cm * pxPerCm}
                height={geometry.height_cm * pxPerCm}
                {...shapeProps}
              />
            )}
            {el.label ? (
              <text
                x={centerX}
                y={centerY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fill="#ffffff"
                pointerEvents="none"
              >
                {el.label}
              </text>
            ) : null}
            {el.badge ? (
              <text
                x={centerX}
                y={centerY + 13}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={10}
                fontWeight={600}
                fill="#ffffff"
                pointerEvents="none"
              >
                {el.badge}
              </text>
            ) : null}
            {mode === "edit" && isSelected && !el.locked ? (
              <>
                <line
                  x1={centerX}
                  y1={geometry.y_cm * pxPerCm}
                  x2={centerX}
                  y2={geometry.y_cm * pxPerCm - 16}
                  stroke="#171717"
                  strokeWidth={1}
                />
                <circle
                  data-testid={`floor-plan-rotate-${el.id}`}
                  cx={centerX}
                  cy={geometry.y_cm * pxPerCm - 20}
                  r={6}
                  fill="#ffffff"
                  stroke="#171717"
                  strokeWidth={1.5}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => startRotate(el, e)}
                />
                <rect
                  data-testid={`floor-plan-resize-${el.id}`}
                  x={geometry.x_cm * pxPerCm + geometry.width_cm * pxPerCm - 8}
                  y={geometry.y_cm * pxPerCm + geometry.height_cm * pxPerCm - 8}
                  width={12}
                  height={12}
                  fill="#ffffff"
                  stroke="#171717"
                  strokeWidth={1.5}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => startResize(el, e)}
                />
                <text
                  x={geometry.x_cm * pxPerCm + geometry.width_cm * pxPerCm}
                  y={geometry.y_cm * pxPerCm + geometry.height_cm * pxPerCm + 12}
                  textAnchor="end"
                  fontSize={9}
                  fill="#6b7280"
                  pointerEvents="none"
                >
                  {(geometry.width_cm / 100).toFixed(2)}×{(geometry.height_cm / 100).toFixed(2)}m
                  {rotationDeg ? `, ${rotationDeg}°` : ""}
                </text>
                <circle
                  data-testid={`floor-plan-delete-${el.id}`}
                  cx={geometry.x_cm * pxPerCm - 2}
                  cy={geometry.y_cm * pxPerCm - 2}
                  r={7}
                  fill="#c0392b"
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDelete(el.id);
                  }}
                />
                <text
                  x={geometry.x_cm * pxPerCm - 2}
                  y={geometry.y_cm * pxPerCm - 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  ×
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
