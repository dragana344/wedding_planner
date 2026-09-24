"use client";

import { useEffect, useRef, useState } from "react";

export const PX_PER_CM = 0.4;

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
}) {
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

      const dxCm = (e.clientX - drag.startClientX) / PX_PER_CM;
      const dyCm = (e.clientY - drag.startClientY) / PX_PER_CM;

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
  }, [elements, widthCm, heightCm, onMoveEnd, onResizeEnd, onRotateEnd]);

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
    const centerPageX = svgRect.left + (el.x_cm + el.width_cm / 2) * PX_PER_CM;
    const centerPageY = svgRect.top + (el.y_cm + el.height_cm / 2) * PX_PER_CM;
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

  const gridStepPx = 50 * PX_PER_CM;

  const resolvedGeometries = elements.map((el) =>
    liveGeometry && liveGeometry.id === el.id ? liveGeometry : el
  );
  const overlappingIds = findOverlappingIds(resolvedGeometries);

  return (
    <svg
      ref={canvasRef}
      data-testid="floor-plan-canvas"
      width={widthCm * PX_PER_CM}
      height={heightCm * PX_PER_CM}
      onPointerDown={() => {
        if (mode === "edit") onSelect(null);
      }}
      className="rounded-lg border border-neutral-200 bg-neutral-50"
    >
      <defs>
        <pattern id="floor-plan-grid" width={gridStepPx} height={gridStepPx} patternUnits="userSpaceOnUse">
          <path d={`M ${gridStepPx} 0 L 0 0 0 ${gridStepPx}`} fill="none" stroke="#e4e7eb" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#floor-plan-grid)" pointerEvents="none" />

      {elements.map((el) => {
        const geometry: LiveGeometry = liveGeometry && liveGeometry.id === el.id ? liveGeometry : el;
        const isSelected = mode === "select" ? (selectedIds ?? []).includes(el.id) : el.id === selectedElementId;
        const isOverlapping = overlappingIds.has(el.id);
        const centerX = (geometry.x_cm + geometry.width_cm / 2) * PX_PER_CM;
        const centerY = (geometry.y_cm + geometry.height_cm / 2) * PX_PER_CM;
        const rotationDeg = liveRotation && liveRotation.id === el.id ? liveRotation.deg : el.rotationDeg ?? 0;
        const shapeProps = {
          "data-testid": `floor-plan-element-${el.id}`,
          onPointerDown: (e: React.PointerEvent) => (mode === "select" ? startSelect(el, e) : startMove(el, e)),
          fill: el.color,
          stroke: isOverlapping ? "#dc2626" : isSelected ? "#171717" : "none",
          strokeWidth: isOverlapping ? 3 : isSelected ? 2 : 0,
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
              <circle cx={centerX} cy={centerY} r={(geometry.width_cm / 2) * PX_PER_CM} {...shapeProps} />
            ) : (
              <rect
                x={geometry.x_cm * PX_PER_CM}
                y={geometry.y_cm * PX_PER_CM}
                width={geometry.width_cm * PX_PER_CM}
                height={geometry.height_cm * PX_PER_CM}
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
            {mode === "edit" && isSelected && !el.locked ? (
              <>
                <line
                  x1={centerX}
                  y1={geometry.y_cm * PX_PER_CM}
                  x2={centerX}
                  y2={geometry.y_cm * PX_PER_CM - 16}
                  stroke="#171717"
                  strokeWidth={1}
                />
                <circle
                  data-testid={`floor-plan-rotate-${el.id}`}
                  cx={centerX}
                  cy={geometry.y_cm * PX_PER_CM - 20}
                  r={6}
                  fill="#ffffff"
                  stroke="#171717"
                  strokeWidth={1.5}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => startRotate(el, e)}
                />
                <rect
                  data-testid={`floor-plan-resize-${el.id}`}
                  x={geometry.x_cm * PX_PER_CM + geometry.width_cm * PX_PER_CM - 8}
                  y={geometry.y_cm * PX_PER_CM + geometry.height_cm * PX_PER_CM - 8}
                  width={12}
                  height={12}
                  fill="#ffffff"
                  stroke="#171717"
                  strokeWidth={1.5}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => startResize(el, e)}
                />
                <text
                  x={geometry.x_cm * PX_PER_CM + geometry.width_cm * PX_PER_CM}
                  y={geometry.y_cm * PX_PER_CM + geometry.height_cm * PX_PER_CM + 12}
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
                  cx={geometry.x_cm * PX_PER_CM - 2}
                  cy={geometry.y_cm * PX_PER_CM - 2}
                  r={7}
                  fill="#c0392b"
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDelete(el.id);
                  }}
                />
                <text
                  x={geometry.x_cm * PX_PER_CM - 2}
                  y={geometry.y_cm * PX_PER_CM - 2}
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
