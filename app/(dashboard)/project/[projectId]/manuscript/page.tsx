export default async function ManuscriptPage() {
  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📝 论文组装</h1>
          <p className="text-gray-500 mt-1">
            从文献和实验数据自动组装论文草稿
          </p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          组装论文草稿
        </button>
      </div>

      <div className="space-y-4">
        {["Abstract", "Introduction", "Methods", "Results", "Discussion"].map(
          (section) => (
            <div
              key={section}
              className="bg-white border border-gray-200 rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{section}</h2>
                <span className="text-xs text-gray-400">⬜ 待生成</span>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                添加文献和实验数据后，点击"组装论文草稿"自动生成
              </p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
