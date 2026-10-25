import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import Community from '@/pages/community';
import Repositories from '@/pages/repositories';
import RepositoryDetail from '@/pages/repository-detail';
import Marketplace from '@/pages/marketplace';
import People from '@/pages/people';
import SettingsPage from '@/pages/settings';
import Offline from '@/pages/offline';
import Fees from '@/pages/fees';
import { SignInPage, SignUpPage } from '@/pages/auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5000 } } });

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(152 38% 27%)',
    colorForeground: 'hsl(150 22% 13%)',
    colorMutedForeground: 'hsl(120 7% 38%)',
    colorDanger: 'hsl(6 62% 44%)',
    colorBackground: 'hsl(45 40% 98.5%)',
    colorInput: 'hsl(45 40% 98.5%)',
    colorInputForeground: 'hsl(150 22% 13%)',
    colorNeutral: 'hsl(150 15% 30%)',
    fontFamily: "'Instrument Sans', ui-sans-serif, sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card border border-border rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_20px_50px_-30px_hsl(150_30%_17%/0.5)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-serif text-2xl font-extrabold text-foreground',
    headerSubtitle: 'text-muted-foreground',
    socialButtonsBlockButtonText: 'text-foreground',
    formFieldLabel: 'text-foreground font-semibold',
    footerActionLink: 'text-primary font-semibold',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    identityPreviewEditButton: 'text-primary',
    formFieldSuccessText: 'text-primary',
    alertText: 'text-foreground',
    logoBox: 'justify-center',
    logoImage: 'h-10 w-10',
    socialButtonsBlockButton: 'border border-border bg-card',
    formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    formFieldInput: 'bg-card border border-input text-foreground',
    footerAction: 'justify-center',
    dividerLine: 'bg-border',
    alert: 'bg-accent border border-border',
    otpCodeFieldInput: 'border border-input text-foreground',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <Shell>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={Community} />
              <Route path="/repositories" component={Repositories} />
              <Route path="/repositories/:id" component={RepositoryDetail} />
              <Route path="/marketplace" component={Marketplace} />
              <Route path="/people" component={People} />
              <Route path="/settings" component={SettingsPage} />
              <Route path="/offline" component={Offline} />
              <Route path="/fees" component={Fees} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </Shell>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Sign in to GitAI', subtitle: 'Use your email to continue' } },
        signUp: { start: { title: 'Create your GitAI account', subtitle: 'Email only. Admission stays closed for now.' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
