export type SavedFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
  status: "activo" | "archivado";
  createdAt: string;
};

export type FileView = "grid" | "list";
export type FileSort = "recent" | "name" | "size";
export type FileStatusFilter = "todos" | SavedFile["status"];
