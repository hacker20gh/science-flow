export default async function ExperimentsPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">🧪 实验管理</h1>
          <p className="text-gray-500 mt-1">设计、记录、分析你的实验</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          + 设计新实验
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="text-center text-gray-400 py-8">
          <p className="text-sm">还没有设计实验</p>
          <p className="text-xs mt-1">从知识面板的 Gap 发现或假设出发设计实验</p>
        </div>
      </div>
    </main>
  );
}
