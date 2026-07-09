import Link from "next/link";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">PD-1 耐药机制在肝癌中的研究</h1>
        <p className="text-gray-500 mt-1">
          探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">15</div>
          <div className="text-sm text-gray-500">篇文献</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-green-600">3</div>
          <div className="text-sm text-gray-500">个实验</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-amber-600">2</div>
          <div className="text-sm text-gray-500">个假设</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-purple-600">1</div>
          <div className="text-sm text-gray-500">篇草稿</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/project/${projectId}/papers/search`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">🔍</div>
          <h3 className="font-semibold">搜索文献</h3>
          <p className="text-sm text-gray-500 mt-1">
            从 PubMed + Semantic Scholar 搜索相关论文
          </p>
        </Link>

        <Link
          href={`/project/${projectId}/brain`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">🧠</div>
          <h3 className="font-semibold">知识面板</h3>
          <p className="text-sm text-gray-500 mt-1">
            查看机制矩阵、假设状态、待办清单
          </p>
        </Link>

        <Link
          href={`/project/${projectId}/experiments`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">🧪</div>
          <h3 className="font-semibold">设计实验</h3>
          <p className="text-sm text-gray-500 mt-1">
            基于文献发现设计验证实验
          </p>
        </Link>
      </div>
    </main>
  );
}
