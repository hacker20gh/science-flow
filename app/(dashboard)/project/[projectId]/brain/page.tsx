export default async function BrainPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <main className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🧠 知识面板</h1>
      <p className="text-gray-500 mb-8">
        课题的实时知识汇总——机制矩阵、假设追踪、待办清单。
      </p>

      {/* Mechanism Matrix Placeholder */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">机制矩阵</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">添加文献后，机制矩阵会自动生成</p>
            <p className="text-xs mt-1">
              每篇文献的药物、通路、表型变化会被提取并拼成对比表格
            </p>
          </div>
        </div>
      </div>

      {/* Hypothesis Tracker Placeholder */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">假设追踪器</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">提出假设后，支持/反对证据会自动积累</p>
          </div>
        </div>
      </div>

      {/* Todo List Placeholder */}
      <div>
        <h2 className="text-lg font-semibold mb-4">待办清单</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">系统会自动检查你的实验设计完整性</p>
            <p className="text-xs mt-1">缺少对照组、样本量不足等问题会在这里提醒</p>
          </div>
        </div>
      </div>
    </main>
  );
}
