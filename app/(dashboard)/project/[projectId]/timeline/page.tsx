export default async function TimelinePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📅 时间线</h1>
      <p className="text-gray-500 mb-8">
        记录项目所有事件，包括失败和转向。
      </p>

      <div className="space-y-4">
        {/* Timeline event placeholder */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mt-2" />
            <div className="w-0.5 h-full bg-gray-200 flex-1" />
          </div>
          <div className="pb-8 flex-1">
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">📖</span>
                <span className="text-xs text-gray-400">Week 1</span>
              </div>
              <h3 className="font-medium text-sm">添加了 15 篇文献</h3>
              <p className="text-xs text-gray-500 mt-1">
                关键词：PD-1 resistance, HCC, sorafenib · 自动生成机制矩阵
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-amber-500 mt-2" />
            <div className="w-0.5 h-full bg-gray-200 flex-1" />
          </div>
          <div className="pb-8 flex-1">
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">💡</span>
                <span className="text-xs text-gray-400">Week 1</span>
              </div>
              <h3 className="font-medium text-sm">
                假设：sorafenib 通过 NF-κB 上调 PD-L1
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                状态：🔄 验证中 · 依据：Liu 2024, Zhang 2022
              </p>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="text-center text-gray-400 py-8">
          <p className="text-sm">添加文献、设计实验、记录结果</p>
          <p className="text-xs mt-1">所有事件都会自动出现在时间线上</p>
        </div>
      </div>
    </main>
  );
}
