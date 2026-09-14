import { memo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditStore } from "../store/editStore";
import { DEFAULT_EDITS, type ImageEntry } from "../types";
import { IMAGE_EXTENSIONS } from "../constants";
import { ImagePlusIcon } from "./icons";

function hasSavedEdits(image: ImageEntry): boolean {
  return !!image.edits && JSON.stringify(image.edits) !== JSON.stringify(DEFAULT_EDITS);
}

const GalleryItem = memo(function GalleryItem({
  image,
  onOpen,
  onRemove,
}: {
  image: ImageEntry;
  onOpen: (image: ImageEntry) => void;
  onRemove: (path: string) => void;
}) {
  return (
    <div className="gallery__item-wrap">
      <button className="gallery__item" onClick={() => onOpen(image)} title={image.name}>
        {image.thumbnail ? (
          <img src={image.thumbnail} alt={image.name} loading="lazy" decoding="async" />
        ) : (
          <div className="gallery__item-placeholder" />
        )}
        <span className="gallery__item-name">{image.name}</span>
      </button>
      {hasSavedEdits(image) && <span className="gallery__item-edited" title="Has edits" />}
      <button
        className="gallery__item-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(image.path);
        }}
        title="Remove from gallery"
      >
        ×
      </button>
    </div>
  );
});

export function Gallery() {
  const images = useEditStore((s) => s.images);
  const galleryViewMode = useEditStore((s) => s.galleryViewMode);
  const gallerySize = useEditStore((s) => s.gallerySize);
  const setGalleryViewMode = useEditStore((s) => s.setGalleryViewMode);
  const setGallerySize = useEditStore((s) => s.setGallerySize);
  const openImage = useEditStore((s) => s.openImage);
  const clearRecents = useEditStore((s) => s.clearRecents);
  const removeRecent = useEditStore((s) => s.removeRecent);
  const openDroppedImages = useEditStore((s) => s.openDroppedImages);

  async function handleAddPhotos() {
    const files = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
    });
    if (!files) return;
    const paths = Array.isArray(files) ? files : [files];
    if (paths.length === 0) return;
    await openDroppedImages(paths);
  }

  return (
    <div className="gallery">
      <div className="gallery__toolbar">
        <button className="primary gallery__add-photos" onClick={handleAddPhotos}>
          <ImagePlusIcon />
          Add Photos
        </button>

        <span className="gallery__hint">or drag &amp; drop photos anywhere</span>

        {images.length > 0 && (
          <button className="link-button" onClick={clearRecents}>
            Clear recents
          </button>
        )}

        <div className="gallery__view-controls">
          <button
            className={galleryViewMode === "square" ? "active" : ""}
            onClick={() => setGalleryViewMode("square")}
            title="Square thumbnails"
          >
            Square
          </button>
          <button
            className={galleryViewMode === "full" ? "active" : ""}
            onClick={() => setGalleryViewMode("full")}
            title="Full image thumbnails"
          >
            Full
          </button>
          <input
            type="range"
            min={100}
            max={360}
            step={10}
            value={gallerySize}
            onChange={(e) => setGallerySize(Number(e.target.value))}
            title="Thumbnail size"
            className="gallery__size-slider"
          />
        </div>
      </div>

      {images.length === 0 && (
        <div className="gallery__empty">
          <p>Add photos, or drag and drop them here, to get started.</p>
        </div>
      )}

      <div
        className={`gallery__grid gallery__grid--${galleryViewMode}`}
        style={{ ["--tile-size" as string]: `${gallerySize}px` }}
      >
        {images.map((image) => (
          <GalleryItem key={image.path} image={image} onOpen={openImage} onRemove={removeRecent} />
        ))}
      </div>
    </div>
  );
}
