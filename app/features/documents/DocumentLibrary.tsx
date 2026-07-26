import { FilePlus2, FileText, Search } from "@/app/components/Icons";
import { documentTemplates } from "@/app/lib/catalog";
import { formatUpdated } from "./formatters";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "filteredDocuments"
  | "newMenuOpen"
  | "recentQuery"
  | "saving"
  | "setNewMenuOpen"
  | "setRecentQuery"
  | "storedDocuments"
  | "createDocument"
  | "openDocument"
>;

export function DocumentLibrary({
  documentId,
  filteredDocuments,
  newMenuOpen,
  recentQuery,
  saving,
  setNewMenuOpen,
  setRecentQuery,
  storedDocuments,
  createDocument,
  openDocument,
}: Props) {
  return (
    <aside className="document-library print-hide">
      <button className="button primary full" disabled={saving} onClick={() => setNewMenuOpen(!newMenuOpen)} aria-keyshortcuts="Control+N Meta+N">
        <FilePlus2 size={17} /> Nuevo documento
      </button>

      {newMenuOpen ? (
        <div className="template-menu" aria-label="Tipo de documento">
          {documentTemplates.map((item) => (
            <button key={item.id} disabled={saving} onClick={() => void createDocument(item.id)}>
              <FileText size={16} />
              <span><strong>{item.name}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="recent-heading">
        <strong>Recientes</strong>
        <span>{storedDocuments.length}</span>
      </div>

      {storedDocuments.length ? (
        <>
          <label className="recent-search">
            <Search size={14} />
            <input
              aria-label="Buscar documentos recientes"
              value={recentQuery}
              onChange={(event) => setRecentQuery(event.target.value)}
              placeholder="Buscar…"
            />
          </label>
          <div className="recent-document-list">
            {filteredDocuments.map((item) => (
              <button
                className={item.id === documentId ? "active" : ""}
                disabled={saving}
                key={item.id}
                onClick={() => void openDocument(item.id)}
              >
                <span><strong>{item.title}</strong>{item.patientName ? <small>{item.patientName}</small> : null}</span>
                <span><em>{item.status}</em><small>{formatUpdated(item.updatedAt)}</small></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-recent">Los documentos guardados aparecerán aquí.</p>
      )}
    </aside>
  );
}
