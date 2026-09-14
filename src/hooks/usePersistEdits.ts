import { useEffect, useRef } from "react";
import type { Edits, ImageEntry } from "../types";
import { useEditStore } from "../store/editStore";

const SAVE_DELAY = 900;

/**
 * Debounced background auto-save of a photo's edits (including rotation/flip/crop)
 * so the latest filter settings always persist without the user ever having to
 * remember to save.
 */
export function usePersistEdits(image: ImageEntry | null, edits: Edits) {
  const saveImageEdits = useEditStore((s) => s.saveImageEdits);

  const skipNextSave = useRef(true);

  useEffect(() => {
    skipNextSave.current = true;
  }, [image]);

  useEffect(() => {
    if (!image) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveImageEdits(image.path, edits);
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [image, edits, saveImageEdits]);
}
