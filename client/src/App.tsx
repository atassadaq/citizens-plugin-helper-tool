import { useState } from "react";
import { RegionListView } from "./views/RegionListView";
import { RegionDetailView } from "./views/RegionDetailView";
import { CitizenEditorView } from "./views/CitizenEditorView";

type View =
  | { name: "regionList" }
  | { name: "regionDetail"; regionId: number }
  | { name: "citizenEditor"; regionId: number; uuid: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "regionList" });

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Citizens Plugin Helper Tool</h1>

      {view.name === "regionList" && (
        <RegionListView onSelectRegion={(regionId) => setView({ name: "regionDetail", regionId })} />
      )}

      {view.name === "regionDetail" && (
        <RegionDetailView
          regionId={view.regionId}
          onBack={() => setView({ name: "regionList" })}
          onSelectCitizen={(uuid) => setView({ name: "citizenEditor", regionId: view.regionId, uuid })}
        />
      )}

      {view.name === "citizenEditor" && (
        <CitizenEditorView
          regionId={view.regionId}
          uuid={view.uuid}
          onBack={() => setView({ name: "regionDetail", regionId: view.regionId })}
        />
      )}
    </div>
  );
}
