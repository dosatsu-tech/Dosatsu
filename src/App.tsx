import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEditStore } from "./store/editStore";
import { Gallery } from "./components/Gallery";
import { Editor } from "./components/Editor";
import { IMAGE_EXTENSIONS } from "./constants";
import "./App.css";

function isImageFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
}

function App() {
  const view = useEditStore((s) => s.view);
  const loadRecents = useEditStore((s) => s.loadRecents);
  const openDroppedImages = useEditStore((s) => s.openDroppedImages);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadRecents();
  }, [loadRecents]);

  useEffect(() => {
    const main = mainRef.current;
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type === "over") {
          main?.classList.add("drag-over");
          return;
        }

        if (event.payload.type === "leave") {
          main?.classList.remove("drag-over");
          return;
        }

        if (event.payload.type === "drop") {
          main?.classList.remove("drag-over");

          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;

          const imagePaths = paths.filter(isImageFile);
          if (imagePaths.length === 0) return;

          if (useEditStore.getState().acceptingReferenceDrop) {
            await useEditStore.getState().setReferenceImageFromPath(imagePaths[0]);
            return;
          }

          await openDroppedImages(imagePaths);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [openDroppedImages]);

  return (
    <main className="app" ref={mainRef}>
      {view === "gallery" ? <Gallery /> : <Editor />}
    </main>
  );
}

export default App;
