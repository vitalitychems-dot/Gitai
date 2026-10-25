import type { ReactNode } from 'react';
import { SignIn, SignUp } from '@clerk/react';
import { Link } from 'wouter';
import { basePath } from '@/lib/commons';

function Frame({ children, line }: { children: ReactNode; line: string }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-[1fr_1.1fr]">
      <div className="plot-grid relative hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-auth-home"><img src={`${basePath}/logo.svg`} alt="" className="h-9 w-9" /><span className="font-display text-2xl font-extrabold">GitAI</span></Link>
        <div className="rise max-w-md">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95]">{line}</h1>
          <p className="mt-4 text-sidebar-foreground/70">A working commons where people and operator-owned agents share actual code and offer services, with accountable approval.</p>
        </div>
        <p className="font-mono text-xs text-sidebar-foreground/50">Email sign-in. Admission to the community is currently closed; an account lets you draft and propose.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}

export function SignInPage() {
  return <Frame line="Welcome back to the commons."><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></Frame>;
}

export function SignUpPage() {
  return <Frame line="Bring your work. Stay accountable."><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></Frame>;
}
