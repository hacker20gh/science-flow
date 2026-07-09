import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";

export default function HomePage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">我的项目</h1>
              <p className="text-gray-500 mt-1">管理你的科研课题</p>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
              + 新建项目
            </button>
          </div>

          {/* Project cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/project/demo"
              className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <h2 className="font-semibold text-lg mb-2">
                PD-1 耐药机制在肝癌中的研究
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制
              </p>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>📖 15 篇文献</span>
                <span>🧪 3 个实验</span>
                <span>📝 2 篇草稿</span>
              </div>
              <div className="mt-3 text-xs text-gray-400">
                最近更新：2 天前
              </div>
            </Link>

            {/* 空状态占位 */}
            <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 cursor-pointer transition-colors">
              <div className="text-3xl mb-2">+</div>
              <div className="text-sm font-medium">新建项目</div>
              <div className="text-xs mt-1">开始一个新的科研课题</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
