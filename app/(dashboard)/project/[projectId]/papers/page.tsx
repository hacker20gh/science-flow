import Link from "next/link";

export default async function PapersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📖 文献管理</h1>
          <p className="text-gray-500 mt-1">管理项目中的所有文献</p>
        </div>
        <Link
          href={`/project/${projectId}/papers/search`}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          🔍 搜索新文献
        </Link>
      </div>

      {/* Paper list placeholder */}
      <div className="space-y-3">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center text-gray-400 py-8">
            <p className="text-sm">还没有添加文献</p>
            <p className="text-xs mt-1">点击上方"搜索新文献"开始</p>
          </div>
        </div>
      </div>
    </main>
  );
}
