export const RESOURCE_AREAS = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "database", label: "Bases de datos" },
  { value: "architecture", label: "Arquitectura" },
  { value: "data-structures", label: "Estructuras de datos" },
];

export function getResourceAreaLabel(value) {
  return RESOURCE_AREAS.find((area) => area.value === value)?.label ?? "Otra área";
}
