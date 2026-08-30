/* eslint-disable @next/next/no-img-element -- local and owner-scoped images bypass optimization intentionally. */
import { Eye, GripVertical } from "@/app/components/Icons";
import type { PlacedSignature, SignatureAssetKind } from "./types";
import type { DocumentWorkspace } from "./use-document-workspace";

export function PlacedDocumentAsset({
  asset,
  kind,
  moveSignature,
  startSignatureMove,
  updatePlacedImage,
}: {
  asset: PlacedSignature;
  kind: SignatureAssetKind;
  moveSignature: DocumentWorkspace["moveSignature"];
  startSignatureMove: DocumentWorkspace["startSignatureMove"];
  updatePlacedImage: DocumentWorkspace["updatePlacedImage"];
}) {
  const label = kind === "stamp" ? "timbre" : "firma";
  const action = asset.hidden ? "Mostrar" : "Ocultar";
  return (
    <div
      className={`placed-asset asset-${kind}`}
      style={{ left: `${asset.x}%`, top: `${asset.y}%`, width: `${asset.width}%` }}
    >
      <button
        type="button"
        className="asset-grip asset-eye print-hide"
        aria-label={`${action} ${label}`}
        onClick={() => updatePlacedImage(kind, { hidden: !asset.hidden })}
      >
        <Eye size={14} />
      </button>
      <button
        type="button"
        className="asset-grip print-hide"
        aria-label={`Mover ${label}; use las flechas del teclado`}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 5 : 1;
          const movement = {
            ArrowDown: { y: asset.y + step },
            ArrowLeft: { x: asset.x - step },
            ArrowRight: { x: asset.x + step },
            ArrowUp: { y: asset.y - step },
          }[event.key];
          if (!movement) return;
          event.preventDefault();
          updatePlacedImage(kind, movement);
        }}
        onPointerDown={(event) => startSignatureMove(kind, event)}
        onPointerMove={(event) => moveSignature(kind, event)}
      >
        <GripVertical size={14} />
      </button>
      <img
        src={asset.imageUrl}
        alt={`${kind === "stamp" ? "Timbre" : "Firma"} de ${asset.professionalName}`}
        hidden={asset.hidden}
        width={220}
        height={90}
        draggable={false}
      />
    </div>
  );
}
