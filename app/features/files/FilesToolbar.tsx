import { Grid2X2, List, Search } from "@/app/components/Icons";
import type { FilesLibraryController } from "./use-files-library";

type Props = Pick<FilesLibraryController,
  "origin" | "origins" | "query" | "selectionMode" | "setOrigin" | "setQuery" | "setSort" |
  "setStatusFilter" | "setView" | "sort" | "statusFilter" | "toggleSelectionMode" | "view"
>;

export function FilesToolbar(props: Props) {
  return (
    <div className="library-toolbar">
      <label className="search-box">
        <Search size={17} />
        <input aria-label="Buscar archivos" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Buscar por nombre…" />
      </label>
      <label>Origen<select value={props.origin} onChange={(event) => props.setOrigin(event.target.value)}><option value="todos">Todos</option>{props.origins.map((origin) => <option key={origin}>{origin}</option>)}</select></label>
      <label>Estado<select value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value as typeof props.statusFilter)}><option value="todos">Todos</option><option value="activo">Activos</option><option value="archivado">Archivados</option></select></label>
      <label>Orden<select value={props.sort} onChange={(event) => props.setSort(event.target.value as typeof props.sort)}><option value="recent">Más recientes</option><option value="name">Nombre</option><option value="size">Tamaño</option></select></label>
      <button className={props.selectionMode ? "button secondary active" : "button secondary"} onClick={props.toggleSelectionMode}>{props.selectionMode ? "Cancelar" : "Seleccionar"}</button>
      <div className="segmented" aria-label="Vista">
        <button className={props.view === "grid" ? "active" : ""} onClick={() => props.setView("grid")} aria-label="Vista cuadrícula"><Grid2X2 size={17} /></button>
        <button className={props.view === "list" ? "active" : ""} onClick={() => props.setView("list")} aria-label="Vista lista"><List size={17} /></button>
      </div>
    </div>
  );
}
