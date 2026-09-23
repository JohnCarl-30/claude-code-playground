import { LessonNav } from "@/components/LessonNav";

export default function LearnLayout({ children }: LayoutProps<"/learn">) {
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[240px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <LessonNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
