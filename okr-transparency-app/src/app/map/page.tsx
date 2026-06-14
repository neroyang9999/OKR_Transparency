import { AppShell } from "@/components/app-shell";
import { OkrMap } from "@/components/okr-map";
import { getOkrTreeResponse } from "@/lib/okr/store";

export default async function MapPage() {
  const data = await getOkrTreeResponse();

  return (
    <AppShell active="OKR Map">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">OKR Alignment Map</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          从 Engineering Objective 到 Engineering KR，再到 Team KR。点击任意节点进入详情和源文档。
        </p>
      </div>
      <OkrMap tree={data.tree} />
    </AppShell>
  );
}
