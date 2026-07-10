"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";

const COURSES = [
  {
    id: "biostatistics",
    title: "生物统计学基础",
    icon: "📊",
    description: "从零开始理解假设检验、置信区间、功效分析",
    lessons: [
      { id: "1", title: "为什么需要统计？", duration: "10 min", done: false },
      { id: "2", title: "零假设与备择假设", duration: "15 min", done: false },
      { id: "3", title: "P 值与显著性水平", duration: "20 min", done: false },
      { id: "4", title: "t 检验：两组比较", duration: "20 min", done: false },
      { id: "5", title: "方差分析（ANOVA）", duration: "25 min", done: false },
      { id: "6", title: "卡方检验与非参数检验", duration: "20 min", done: false },
      { id: "7", title: "多重比较校正", duration: "15 min", done: false },
      { id: "8", title: "功效分析与样本量估算", duration: "20 min", done: false },
    ],
  },
  {
    id: "experimental-design",
    title: "实验设计实战",
    icon: "🧪",
    description: "对照、随机、重复——设计可重复的实验",
    lessons: [
      { id: "1", title: "实验设计三原则", duration: "15 min", done: false },
      { id: "2", title: "对照组的类型与选择", duration: "20 min", done: false },
      { id: "3", title: "随机化与盲法", duration: "15 min", done: false },
      { id: "4", title: "样本量估算实战", duration: "25 min", done: false },
      { id: "5", title: "剂量-反应实验设计", duration: "20 min", done: false },
      { id: "6", title: "时间序列实验设计", duration: "20 min", done: false },
    ],
  },
  {
    id: "cell-biology",
    title: "细胞生物学实验",
    icon: "🔬",
    description: "Western Blot、qPCR、流式细胞术——核心技能",
    lessons: [
      { id: "1", title: "细胞培养基础", duration: "15 min", done: false },
      { id: "2", title: "Western Blot 完全指南", duration: "30 min", done: false },
      { id: "3", title: "qPCR 实验设计与分析", duration: "25 min", done: false },
      { id: "4", title: "流式细胞术入门", duration: "25 min", done: false },
      { id: "5", title: "ELISA 实验要点", duration: "20 min", done: false },
      { id: "6", title: "免疫荧光与共聚焦", duration: "25 min", done: false },
    ],
  },
  {
    id: "paper-writing",
    title: "SCI 论文写作",
    icon: "📝",
    description: "从图表到投稿——写出有说服力的论文",
    lessons: [
      { id: "1", title: "科研图表设计原则", duration: "20 min", done: false },
      { id: "2", title: "Results 的逻辑组织", duration: "20 min", done: false },
      { id: "3", title: "Introduction 的漏斗结构", duration: "15 min", done: false },
      { id: "4", title: "Discussion 的深度解读", duration: "25 min", done: false },
      { id: "5", title: "统计结果的规范报告", duration: "15 min", done: false },
      { id: "6", title: "审稿意见的回复策略", duration: "20 min", done: false },
    ],
  },
];

export default function CoursesPage() {
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  const currentCourse = COURSES.find((c) => c.id === selectedCourse);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold">🎓 科研设计实战课</h1>
            <p className="text-gray-500 mt-1">从统计基础到论文写作，系统提升科研技能</p>
          </div>

          {currentCourse ? (
            /* 课程详情 */
            <div>
              <button
                onClick={() => setSelectedCourse(null)}
                className="text-sm text-blue-600 hover:underline mb-4"
              >
                ← 返回课程列表
              </button>

              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl">{currentCourse.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold">{currentCourse.title}</h2>
                    <p className="text-sm text-gray-500">{currentCourse.description}</p>
                  </div>
                </div>

                <div className="text-xs text-gray-400 mb-4">
                  {currentCourse.lessons.length} 节课 · 共约 {currentCourse.lessons.length * 20} 分钟
                </div>

                <div className="space-y-2">
                  {currentCourse.lessons.map((lesson, i) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg hover:border-blue-200 transition-colors cursor-pointer"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        lesson.done
                          ? "bg-green-100 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      }`}>
                        {lesson.done ? "✓" : i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{lesson.title}</div>
                      </div>
                      <span className="text-xs text-gray-400">{lesson.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* 课程列表 */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COURSES.map((course) => {
                const completed = course.lessons.filter((l) => l.done).length;
                const progress = Math.round((completed / course.lessons.length) * 100);

                return (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourse(course.id)}
                    className="text-left p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{course.icon}</span>
                      <h3 className="font-semibold">{course.title}</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">{course.description}</p>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {completed}/{course.lessons.length}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
