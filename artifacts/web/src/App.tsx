import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  Router as WouterRouter,
  Route,
  Switch,
} from 'wouter';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// ─── Server health check ────────────────────────────────────────────────────

function useServerHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

      const res = await fetch(`${base}/healthz`);

      if (!res.ok) {
        throw new Error('unhealthy');
      }

      return res.json() as Promise<{ status: string }>;
    },
    refetchInterval: 30_000,
  });
}

function ServerBadge() {
  const { data, isLoading, isError } = useServerHealth();

  const colour = isLoading
    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
    : isError
      ? 'bg-red-900/30 text-red-400 border-red-700/40'
      : 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40';

  const dot = '●';

  const label = isLoading
    ? 'Checking…'
    : isError
      ? 'Offline'
      : 'Live';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colour}`}
    >
      <span className={isLoading ? 'animate-pulse' : ''}>
        {dot}
      </span>

      <span>
        Server {label}
        {data?.status && !isLoading && !isError && (
          <> — {data.status}</>
        )}
      </span>
    </span>
  );
}

// ─── Suit icons ─────────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'] as const;

function FloatingSuits() {
  return (
    <>
      {SUITS.map((s, i) => (
        <span
          key={s}
          className="absolute text-7xl opacity-[0.04]"
          style={{
            top: `${10 + i * 22}%`,
            left: `${5 + i * 24}%`,
            transform: `rotate(${-15 + i * 12}deg)`,
          }}
        >
          {s}
        </span>
      ))}
    </>
  );
}

// ─── Feature cards ──────────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: '🃏',
    title: 'Bundelkhandi Chhakri Rules',
    desc: '4- or 6-player trick-taking game with Secret Hand, phased dealing, primary bids, and trump selection.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Multiplayer',
    desc: 'Socket.IO keeps every player in sync — bids, trump calls, and card plays appear instantly across all devices.',
  },
  {
    icon: '🤖',
    title: 'AI Fill-In',
    desc: 'Seats are filled by AI if a player disconnects, so the game never stalls waiting for a human to return.',
  },
  {
    icon: '🎯',
    title: 'Complete Game Engine',
    desc: 'All 384 engine tests green — bidding, trick evaluation, Chhakri detection, zero-sum scoring, and series end.',
  },
];

function FeatureCard({ icon, title, desc }: Feature) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-6">
      <div className="mb-3 text-3xl">{icon}</div>

      <h3 className="mb-2 text-base font-semibold text-foreground">
        {title}
      </h3>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </div>
  );
}

// ─── Suit legend ─────────────────────────────────────────────────────────────

function SuitLegend() {
  const suits = [
    {
      sym: '♠',
      name: 'Spades',
      hi: 'हुकुम',
      color: 'text-foreground',
    },
    {
      sym: '♥',
      name: 'Hearts',
      hi: 'पान',
      color: 'text-red-400',
    },
    {
      sym: '♦',
      name: 'Diamonds',
      hi: 'ईंट',
      color: 'text-red-400',
    },
    {
      sym: '♣',
      name: 'Clubs',
      hi: 'चिड़ी',
      color: 'text-foreground',
    },
  ];

  return (
    <div className="flex justify-center gap-8">
      {suits.map((suit) => (
        <div
          key={suit.sym}
          className="flex flex-col items-center gap-1"
        >
          <span className={`text-2xl ${suit.color}`}>
            {suit.sym}
          </span>

          <span className="text-xs text-muted-foreground">
            {suit.hi}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main landing page ──────────────────────────────────────────────────────

function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <FloatingSuits />

      {/* Hero */}
      <header className="relative mx-auto max-w-3xl px-6 pb-16 pt-20 text-center">
        {/* Oval table accent */}
        <div
          className="mx-auto mb-8 flex h-28 w-52 items-center justify-center rounded-[50%] border-4 border-[#8B5E1A]"
          style={{
            background:
              'linear-gradient(135deg, #3E1F00 0%, #5C2E00 50%, #3E1F00 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          <span className="text-5xl">🃏</span>
        </div>

        <div className="mb-4 flex justify-center">
          <ServerBadge />
        </div>

        <h1 className="mb-3 text-5xl font-extrabold tracking-tight text-foreground">
          Bundelkhandi{' '}
          <span className="text-accent">Chhakri</span>
        </h1>

        <p className="mx-auto mb-2 max-w-lg text-base text-muted-foreground">
          The classic trick-taking card game of Bundelkhand —
          now playable online with friends, anywhere.
        </p>

        <p className="mb-8 text-sm font-medium text-accent/80">
          छह पत्तों का खेल · 4 or 6 Players · Real-Time
        </p>

        <SuitLegend />
      </header>

      {/* Features */}
      <section className="relative mx-auto max-w-3xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <FeatureCard
              key={feature.title}
              {...feature}
            />
          ))}
        </div>
      </section>

      {/* How to play */}
      <section className="relative border-t border-border bg-card/40 py-14">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="mb-6 text-xl font-bold text-foreground">
            How to Play
          </h2>

          <ol className="space-y-4 text-left text-sm text-muted-foreground">
            {[
              [
                'Deal',
                'Each player receives 8 cards across three zones: Secret Hand (2), Face-Down (3), and Face-Up (3).',
              ],
              [
                'Primary Bid',
                'The Secret Hand holder must bid exactly 5 — the opening contract for trump selection.',
              ],
              [
                'Bidding',
                'Two full rounds of bidding (values 5–8). The highest bidder wins the contract and names the trump suit.',
              ],
              [
                'Play',
                'Trick-taking follows standard led-suit rules. 6 consecutive tricks by one team triggers Chhakri!',
              ],
              [
                'Score',
                'Zero-sum scoring — the first team to reach +52 cumulative wins the series.',
              ],
            ].map(([step, text]) => (
              <li
                key={step}
                className="flex gap-3"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {step}
                </span>

                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>
          Bundelkhandi Chhakri · Multiplayer Card Game
        </p>

        <p className="mt-1 opacity-50">
          API · Socket.IO · Flutter Mobile Client
        </p>
      </footer>
    </div>
  );
}

// ─── App shell ──────────────────────────────────────────────────────────────

export default function App() {
  const basePath = (import.meta.env.BASE_URL || '').replace(
    /\/$/,
    '',
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={basePath}>
        <Switch>
          <Route path="/" component={Home} />

          <Route>
            <div className="flex min-h-screen items-center justify-center">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-foreground">
                  404 — Page not found
                </h1>
              </div>
            </div>
          </Route>
        </Switch>
      </WouterRouter>
    </QueryClientProvider>
  );
}
