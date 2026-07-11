import { type ProjectContext, getQuickQuestions } from "@/lib/chat/chat-utils";

interface QuickQuestionsProps {
  projectContext?: ProjectContext;
  onSelect: (question: string) => void;
}

export function QuickQuestions({ projectContext, onSelect }: QuickQuestionsProps) {
  const questions = getQuickQuestions(projectContext);

  return (
    <div className="text-center py-6">
      <p className="text-3xl mb-3">🤖</p>
      <p className="text-sm font-medium text-gray-700">SciFlow AI 助手</p>
      <p className="text-xs text-gray-400 mt-1 mb-4">我可以帮你分析文献、解释矛盾、建议实验设计</p>
      <div className="space-y-1.5">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="w-full text-left px-3 py-2 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            💬 {q}
          </button>
        ))}
      </div>
    </div>
  );
}
