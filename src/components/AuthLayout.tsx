import type { ReactNode } from "react";
import { FileText, Sparkles } from "lucide-react";

type AuthLayoutProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
};

const AuthLayout = ({ children, eyebrow, title, description }: AuthLayoutProps) => {
  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-top" />
      <div className="auth-glow auth-glow-bottom" />

      <section className="auth-shell">
        <aside className="auth-intro" aria-label="VNote introduction">
          <div className="auth-brand">
            <span className="auth-brand-mark">
              <FileText size={21} strokeWidth={2.2} />
            </span>
            <span>VNote</span>
          </div>

          <div className="auth-intro-copy">
            <span className="auth-kicker">
              <Sparkles size={15} />
              Your thoughts, connected
            </span>
            <h2>把零散想法，整理成清晰脉络。</h2>
            <p>
              轻量记录、自由关联，在专注的空间里搭建属于你的知识网络。
            </p>
          </div>

          <div className="auth-note-preview" aria-hidden="true">
            <span className="auth-note-dot" />
            <div>
              <strong>今天的灵感</strong>
              <p>好的笔记，从一个简单的想法开始。</p>
            </div>
          </div>
        </aside>

        <div className="auth-form-panel">
          <div className="auth-form-wrap">
            <div className="auth-heading">
              <span>{eyebrow}</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthLayout;
